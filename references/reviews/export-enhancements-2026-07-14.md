# Review: Export annotations (references as footnotes, Margin as comments/footnotes)

**Date**: 2026-07-14
**Status**: Resolved
**Scope**: `packages/exporter`, `packages/api`, `packages/shared`, `packages/storage`, `packages/frontend`
**Plan**: `references/plans/export-enhancements.md`
**Spec**: `specifications/export.md`, `specifications/margins.md`

---

## Overall

Solid implementation, faithful to the plan. The byte-identity invariant for preview holds (verified: the separator change is a literal NBSP, byte-identical; tests cover the no-annotation path). Config plumbing, orphan warnings, and the docx side-channel all match the grill-session decisions. Test coverage is strong at every layer, including unzip-level docx assertions. Four bugs found — all edge cases, three of them silent-drop paths in the docx comment lowering, all confirmed by running the code. Most important: a footnote label collision that corrupts md output deterministically (finding 1), and docx comments silently lost when a block carries more than one marker or is a list (findings 2–3).

---

## Bugs

### 1. Reference label can collide with the comment counter namespace → duplicate footnote definitions

`packages/exporter/src/assemble-markdown.ts:158` — `allocateReferenceLabel` guards slug collisions between reference keys, but not against the `c<N>` labels the shared comment counter mints. A reference whose key slugifies to `c1`, `c2`, … (e.g. key `"C1"`) produces a label identical to a comment label. Confirmed output:

```
Prose.[^c1][^c1]

[^c1]: Comment body.

[^c1]: C1 — Reference body.
```

Two definitions share one label; renderers bind both refs to the first definition, so the reference footnote displays the comment body. Fix: treat labels matching `/^c\d+$/` as reserved in `allocateReferenceLabel` (fall into the suffixing loop, yielding `c1-2`).

### 2. docx: only the last of multiple trailing markers on a block becomes a Word comment

`packages/exporter/src/markdown-to-docx.ts:74` — `trailingCommentMarkerId` walks back from the end of a paragraph's children and returns on the **first** html node it meets. With two adjacent markers (`…prose.<!--c:a--><!--c:b-->` — reachable via external vault edits, and via any future multi-comment-per-block UI), only `b` gets a comment range; `a`'s marker node is dropped by `phrasingToRuns` and its body is silently lost — no warning, since the assembly recorded it as bound. Confirmed: comment A absent from `word/comments.xml`, comment B present. The md path handles the same input correctly (`[^c1][^c2]`). Fix: collect **all** trailing marker ids (keep walking past html marker nodes) and have `withCommentRange` wrap the runs in nested ranges — overlapping comment ranges are valid OOXML.

### 3. docx: a comment anchored to a list block is silently dropped

`packages/exporter/src/markdown-to-docx.ts:245` — `walkListItems` never runs trailing-marker detection or `withCommentRange`. The editor anchors markers at `range.to` of the anchored block; when that block is a list, the marker trails the last list item. Confirmed: `- item two<!--c:listmark-->` with a bound body produces no comments part (marker at least doesn't leak as text). md path renders the footnote fine. Fix: detect the trailing marker in the last list item's paragraph and wrap that item's runs in a comment range.

### 4. New required action-log payload fields invalidate previously written `sequence:exported` entries

`packages/shared/src/schemas/domain/action.ts:283` — `includeReferences`/`includeMarginAnnotations` were added as **required** to the `sequence:exported` payload. `readRecentEntries` (`packages/storage/src/action-log/reader.ts:29`) validates each line with `LogEntrySchema.safeParse` and skips failures as "malformed", so every export logged before this branch disappears from the action-log view in existing vaults. Greenfield softens this, but the log is the developer's own history and the fix is one line: make both fields `.optional()` (or `.default(true)`).

---

## Design

### 5. `assembleSequenceForExport` duplicates `assembleSequence`'s block/nav building

`packages/exporter/src/assemble.ts:139` — the section/title/body/nav loop is a near-copy of `assembleSequence`'s (`assemble.ts:86`), differing only in the `annotations` field on body blocks. Two loops that must stay in lockstep (skip rules, nav shape, block ordering). Per the project overlap rule, extract one shared block builder (annotations optional) and have both call it — `assembleSequence` can delegate with no annotations; the byte-identity test already pins the behavior.

### 6. `ExportDialog` hand-rolls the setting lifecycle `useProjectSetting` already owns

`packages/frontend/src/components/ExportDialog.tsx:75-109` — the read-config → local state → resync-effect → update-mutation → invalidate dance is exactly what `useProjectSetting` (`packages/frontend/src/hooks/useProjectSetting.ts`) provides, including per-setting error surfacing which the dialog currently lacks: `persistExportConfig` fires `mutate` with no `onError`, so a failed persistence is invisible (the export itself still works because the request carries dialog state, but the toggle silently fails to stick). Extend `BooleanSettingPath`/`SettingSection` with the `export` section and use the hook's `draft`/`commit` shape for instant checkbox feedback.

---

## Minor

### 7. Toggle resync race can transiently revert a checkbox

`packages/frontend/src/components/ExportDialog.tsx:87` — the resync effect overwrites both toggles whenever the project query refetches. Toggling A invalidates and refetches; if B is toggled while that refetch is in flight, the response (which predates B's PATCH) reverts B's checkbox until B's own invalidation lands. An export clicked in that window sends the reverted state. Low probability; largely mitigated by adopting `useProjectSetting` (finding 6).

### 8. Literal NBSP character in source

`packages/exporter/src/assemble-markdown.ts:107` — the blank-line separator now returns a literal U+00A0 character instead of the previous `" "` escape. Byte-identical today (verified with `od`), but the character is invisible in most editors and one well-meaning normalization away from a preview-regression. Restore the escape.

### 9. Notes ref renders after a first-line comment ref (raw label order)

`packages/exporter/src/assemble-markdown.ts:356` — with titles off, the notes head token is appended to the first line **after** marker replacement, so a comment marker on that line yields `text[^c2][^c1]` — labels out of document order in the raw markdown. Renderers renumber footnotes by first-reference order, so displayed output is correct. Cosmetic; acceptable as-is.

---

## Non-issues

- **`separatorSegment` NBSP diff looks like a plain space** — it is still U+00A0 (0xC2 0xA0), only the escape was replaced by the literal character; output is byte-identical (see finding 8 for the residual style concern).
- **Both assembly passes always run** — `assembleAnnotated` renders footnote and docx dialects even for md exports. Cheap (string work), and keeps warnings identical across formats.
- **`gfmFootnote` always enabled in `markdownToDocx`** — authored GFM footnote syntax in prose now lowers to real Word footnotes even with annotations off. Reasonable; undefined `[^refs]` still fall through as plain text.
- **`X-Maskor-Export-Warnings` readability** — hono's bare `cors()` exposes no custom headers cross-origin, but the frontend reaches the API through the vite same-origin proxy (as the existing `content-disposition` filename parsing already relies on). Only relevant if the app ever goes genuinely cross-origin.
- **Notes marker on a multi-line first block (titles off)** — verified empirically: the synthetic marker lands mid-paragraph in the docx-bound markdown but the comment still lowers correctly.
- **Toggles persist even if the dialog is cancelled** — matches the plan ("persisted on change").
- **txt = md bytes** — by design (developer decision 2026-07-12; spec updated).

---

## Resolution

Fixes applied 2026-07-14 in commits `dc27654e` (findings 1–4, 8) and `e4a719cc` (findings 5–7).

1. **Fixed.** `allocateReferenceLabel` treats candidates matching `/^c\d+$/` as reserved; a colliding reference key now suffixes to `c1-2`. Regression test added.
2. **Fixed.** `trailingCommentMarkerIds` collects every trailing marker; `withCommentRanges` nests the comment ranges so all bound comments lower. Unzip-level regression test added.
3. **Fixed.** `walkListItems` runs the same trailing-marker detection and wraps the item's runs in comment ranges. Regression test added.
4. **Fixed.** `includeReferences`/`includeMarginAnnotations` on the `sequence:exported` payload are `.optional()`; legacy entries parse again (reader regression test added). OpenAPI snapshot regenerated.
5. **Fixed.** Shared `buildSequenceBlocks(assembled, resolveAnnotations?)`; both assemblers delegate to it. Byte-identity test pins the output.
6. **Fixed.** `useProjectSetting` gained the `export` section paths; the dialog uses two hooks with the `draft`/`commit` shape and surfaces persistence errors inline. Hand-rolled state/effect/mutation removed.
7. **Mitigated.** Follows from 6 — the resync lifecycle now lives in the shared hook (same pattern as every other setting); the theoretical in-flight-refetch revert window remains but matches the accepted project-wide behavior.
8. **Fixed.** `" "` escape restored.
9. **Won't fix.** Cosmetic raw-label ordering; renderers renumber footnotes by first reference, so displayed output is correct.
