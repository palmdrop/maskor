# Review: Aspect Preview / Reader

**Date**: 2026-06-15
**Scope**: `packages/frontend`
**Plan**: `references/plans/aspect-preview-reader.md`
**Spec**: `specifications/fragment-editor.md`

---

## Overall

Faithful, clean implementation of all four plan phases, plus four follow-up commits fixing gutter overflow on the shell grid. New tests cover the reader list, accordion, orphan, empty state, preview states, and the `preview-aspect` command; 38 targeted tests pass. No bugs found. Two design notes worth a decision (a known command-system bypass on aspect creation, and a dead chip-click in the inline overlay) and one confirmation that the shell grid's loss of prose-centering is intentional.

**Update (2026-06-15):** all three items resolved. Item 1 (create bypass): reader-tab orphan create now routes through a palette-discoverable `aspect-reader:create-aspect` command; the metadata combobox's free-text create stays an inline mutation by design (matches `FragmentListPage`, can't be palette-modeled); shared `useCreateAspectByKey` hook dedupes both. Items 2 (dead chip-click) and 3 (label wording) also fixed. Full `bun run verify` clean — 826 tests pass. Separately flagged a stray `console.log` in `tag-combobox.tsx:78` (out of scope) in `references/suggestions.md`.

---

## Bugs

None.

---

## Design

### 1. Aspect creation bypasses the command system — FIXED

`packages/frontend/src/components/aspects/aspect-reader-tab.tsx:63` — `handleCreate` calls `createAspect` (`useCreateAspect().mutateAsync`) directly from an `onClick`. `packages/frontend/CLAUDE.md` forbids `useMutation` in `onClick`; mutations belong in command files. Consequence today: the create has no `onFailure` route, so a failed create rejects unhandled with no toast.

**Resolved (2026-06-15):**
- Extracted the shared `useCreateAspectByKey(projectId)` hook (`src/hooks/`) — the create mutation + list invalidation now live in one place; rejects on non-201 carrying the server message. Both call sites use it.
- **Reader-tab orphan create:** routed through a new `aspect-reader:create-aspect` command (new `aspectReaderScope`). It's parameterized by the fragment's *orphaned* keys, so it's genuinely palette-discoverable, and declares `onFailure: "Failed to create aspect."` — a failed create now toasts. The button dispatches `commands.run("aspect-reader:create-aspect", key)`.
- **Metadata combobox create-and-attach:** kept as an inline `onCreate` mutation (now via the shared hook) — a *deliberate* exception, matching `FragmentListPage.handleCreateFragment` and the CLAUDE.md inline-create carve-out. A free-text, not-yet-existing key has no fixed item list, so it cannot be a palette command (the palette arg picker only selects from resolved items); forcing it through would add a permanently-empty "No items available" entry. Errors still render in place below the field; the rethrow is preserved so the combobox keeps the typed query for retry.
- Tests: `aspect-reader:create-aspect` scope-smoke (run + disabled), reader-tab create POSTs through the command, plus the existing in-place error coverage.

### 2. Dead chip-click in the inline Overview/Preview overlay — FIXED

`packages/frontend/src/components/fragments/fragment-metadata-form.tsx:269,302` — the aspect chip is now a `<button>` dispatching `fragment-editor:preview-aspect`, which sets `gutterTab="aspect"`. But `FragmentMetadataForm` always renders (it lives in the shell sidebar), while the Aspect tab only mounts when `showMargin` is true. In the inline overlay (`showMargin={false}`) the chip stays clickable and the command is a silent no-op — the gutter it targets isn't mounted.

**Resolved (2026-06-15):** added a `canPreviewAspects` prop (default `false`); `fragment-editor.tsx` passes `canPreviewAspects={showMargin}`. The chip markup is now a shared `renderAspectChip` helper (removing the live/orphaned duplication) that renders a button only when preview is available, otherwise a plain span. Tests added for both render modes.

---

## Minor

### 3. Tab label vs. plan/spec wording — FIXED

`packages/frontend/src/components/fragments/fragment-editor.tsx:432` — the trigger reads "Aspects" (plural) while the plan and spec call it the "Aspect tab". Cosmetic only.

**Resolved (2026-06-15):** aligned the spec to the UI — `specifications/fragment-editor.md` now reads `[Margin] [Aspects]` / "the Aspects tab". The plural reads better for a list and avoids churning the UI label.

---

## Non-issues

- **`useGetAspect(projectId, "")` before the `!summary` early return** (`aspect-preview.tsx:25`) — the generated hook self-disables via `enabled: !!(projectId && aspectId)`, so no request fires for an empty uuid. Safe.
- **Deep relative import of `resolveAspectColor`** (`aspect-reader-tab.tsx:13`, `../../pages/OverviewPage/utils/aspectColors`) — matches the existing import in `fragment-metadata-form.tsx:21`; consistent, not new drift.
- **Nested-looking buttons in the chip** (`fragment-metadata-form.tsx`) — the preview button and detach `×` button are siblings inside a `justify-between` span, not nested interactives. Correct.
- **Margin tab force-mounted + hidden, never unmounted** (`fragment-editor.tsx:438`) — deliberate, per the plan: it holds draft + scroll-sync state, and its geometry is driven by the always-visible editor, so hiding does not corrupt alignment.
- **Shell grid no longer centers the prose** (`entity-editor-shell.tsx`, `[1fr_auto_1fr]` → `[4rem_auto_minmax(0,1fr)]`) — intentional per the "give the prose precedence" commits and documented in the inline comment: the editor body is now left-aligned behind a fixed 4rem gutter, Margin takes leftover on the right and shrinks before the prose does. Confirmed deliberate.
