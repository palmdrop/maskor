# Review: Extract Selection — Slices 2 + 3

**Date**: 2026-05-21
**Scope**: `packages/api`, `packages/frontend`, `packages/shared`
**Plan**: `references/plans/extract-selection-2.md`
**Spec**: `specifications/extract-selection.md`

---

## Overall

Both plans are fully checked off; 8 commits on the branch map cleanly to the phases. `bun run verify` is green (674 backend + 260 frontend tests). The implementation matches the structural shape of the spec — 12 commands, two modal shapes, per-type log entries, partial-success path on cut failure, route-level cut → source PATCH ordering. Deviations are concentrated in toggle-state scoping (finer-grained than spec calls for, and locally-scoped instead of session-scoped) and a duplicated key regex on the frontend. None of the items below block the slice.

---

## Bugs

None.

---

## Design

### 1. Append/prepend session-sticky toggles are split per direction instead of shared

`packages/frontend/src/components/entity-editor-shell.tsx:157-160` declares four independent `useState` values (`appendSourceMode`, `appendNextMode`, `prependSourceMode`, `prependNextMode`). The spec, line 212:

> _"the last setting picked while doing an extract-to-new sticks for the next extract-to-new; the last setting picked while doing an append/prepend sticks for the next append/prepend. The two directions do not share state."_

"Directions" here means **extract-to-new vs append/prepend**, not append vs prepend. Picking `Cut` while doing an Append should carry into the next Prepend; today it does not. Plan phase 4 says the toggles should be "tracked independently from the extract-to-new toggles", implying append/prepend share state with each other.

Fix: collapse to two toggles (`insertSourceMode`, `insertNextMode`) shared across both directions.

### 2. Session-sticky state is local to `EntityEditorShell`, so it resets on entity navigation

Same four `useState` hooks above live inside `EntityEditorShell`, which remounts when the user navigates to a different entity. Spec line 212 says the toggles "reset on browser reload" — i.e., they should survive across entities for the duration of the session. Today they reset every time the user clicks into a different fragment/note/reference/aspect.

Fix: lift to a context or a Zustand slice at app root if full session-scope was intended. If per-entity-edit scope is intended, the spec wording should be tightened.

### 3. Frontend duplicates the shared key validation regex (blocked by a packaging issue)

`packages/frontend/src/components/fragments/extract-utils.ts:1-2`:

```ts
// TODO: this should use the key from the shared package?
const ENTITY_KEY_REGEX = /^[\p{L}\p{N} _-]+$/u;
```

`packages/shared/src/utils/validate-entity-key.ts` already exports `ENTITY_KEY_REGEX` built from `ENTITY_KEY_CHAR_CLASS`. The spec, line 311, says: _"This feature MUST NOT introduce a parallel validation surface."_

**Why the duplication exists**: `packages/shared/src/index.ts:4` re-exports `./logger`, and `logger/index.ts:15` references `process.stdout` (pino). Type-only imports from `@maskor/shared` work because TS erases them, but a **value** import (`import { ENTITY_KEY_REGEX } from "@maskor/shared"`) pulls the whole barrel into the frontend bundle, and `process` is undefined in the browser. So this is a working-around, not a slip.

The real fix is upstream — see `references/suggestions.md`. Until that lands, leave the duplicate but keep the regex character class identical to `ENTITY_KEY_CHAR_CLASS`. Drop the question mark from the TODO and reference the suggestion.

### 4. `validateExtractKey`'s discarded-clash branch is fragment-only but parameter accepts all four types

`packages/frontend/src/components/fragments/extract-utils.ts:13-28` takes `discardedKeys: Set<string>` and `entityType: "fragment" | "note" | "reference" | "aspect"`, but the discarded-clash message is hardcoded to `"A discarded fragment uses this key. Restore or rename it first."`. Non-fragment callers (`ExtractToNoteDialog`, `ExtractToReferenceDialog`, `ExtractToAspectDialog`) pass `new Set()` so the branch is dead in practice.

Fix: either drop the `discardedKeys` parameter for non-fragment callers (move the discarded check into the fragment wrapper), or keep it general and key the message off `entityType`. As-is the API shape lies about what it supports.

### 5. `*ExtractCommand` input types are wider than the route schemas

`extractFragmentCommand` / `extractNoteCommand` / `extractReferenceCommand` / `extractAspectCommand` all declare `sourceMode: "keep" | "cut" | "link"`, but the route schemas (`FragmentExtractSchema`, `NoteExtractSchema`, `ReferenceExtractSchema`, `AspectExtractSchema`) all enforce `z.enum(["keep"])`. The command-level union is forward-compat for the deferred Cut/Link extract-to-new slice, but there is no comment saying so, and the inconsistency could lead a future caller to assume the route accepts `cut`/`link`.

Fix: either narrow the command input to `"keep"` until those modes are exposed, or leave a one-line comment marking the wider union as intentional.

---

## Minor

### 6. `AspectExtractSchema.description` lacks `min(1)` unlike sibling content fields

`packages/api/src/schemas/aspect.ts:59` — `description: z.string()`. Sibling schemas (`FragmentExtractSchema.content`, `NoteExtractSchema.content`, `ReferenceExtractSchema.content`) all use `z.string().min(1)`. The frontend trims and rejects empty selections, so this is unlikely to fire, but the route would accept an empty description body, contradicting the spec's "reject empty-after-trim" rule on line 100.

### 7. `extract-utils` location no longer matches its scope

`packages/frontend/src/components/fragments/extract-utils.ts` and its test under the same `__tests__/` directory are now consumed by all four per-type extract dialogs (`fragments/`, `notes/`, `references/`, `aspects/`). The `fragments/` path is misleading now that the utility is generic.

### 8. Two redundant log-type assertions in insert commands

Each insert command writes the log entry with a verbose cast:

```ts
type: (position === "append" ? "fragment:appended" : "fragment:prepended") as
  | "fragment:appended"
  | "fragment:prepended",
```

The conditional already narrows to that union; the `as ... | ...` cast is a no-op. Same pattern in `insert-fragment.ts:31-33`, `insert-note.ts:30-32`, `insert-reference.ts:41-43`, `insert-aspect.ts:33-35`. Drop the casts.

### 9. `EntityEditorShell` registers 12 `useCommand` calls inline

`entity-editor-shell.tsx:472-548` — 12 sequential `useEditorExtractCommand` / `useEditorInsertCommand` calls. Works, but the surface is wide. A small loop over a `[direction, targetType]` matrix would compress it without losing readability. Not a defect, just dense.

### 10. `extract-to-fragment-dialog`'s server-error fallback string is generic

`packages/frontend/src/components/fragments/extract-to-fragment-dialog.tsx:58-60` — falls back to `"Extraction failed. Try again."` if the server response has no `message`. Same string in the note/reference/aspect wrappers. Spec doesn't mandate a specific message here, and the inline error from the server is preferred when present; harmless but worth noting in case a richer error contract lands later.

---

## Non-issues

- **`cutBodyCommand` emits no log entries** — `packages/api/src/commands/cut-body.ts:20-22` has a comment explaining: the cut is a downstream effect of the append/prepend, which is already logged. Plan phase 3 explicitly says so.
- **`sourceMode: "link"` rejected at schema level only** — the insert routes use `z.enum(["keep", "cut"])`. Plan phase 3 explicitly mandates this; the command-level union accepts a wider set forward-compat for when Link ships.
- **Default `sourceMode` is `cut`, not `keep`, on the append/prepend modal** — `entity-editor-shell.tsx:157-160` initializes to `"cut"`. Matches spec line 387/404 ("default source-side mode is `Cut`") and the prior decision on line 327-328.
- **Default `nextMode` is `stay` on append/prepend, `switch` on extract-to-new** — matches spec line 209 and the per-direction defaults in line 387/404.
- **`countOccurrences` requires exactly one match before cutting** — `cut-body.ts:22-30`. If the selection text appears zero or multiple times in the source body, the cut is skipped and the route returns `sourceCutFailed: true`. Conservative, matches the spec's selection-drift handling on line 260-265.
- **Frontend extract dialogs hardcode `sourceMode: "keep"`** — extract-to-new toggles are deferred to a follow-up slice (per plan scope notes), so the dialogs send `"keep"` until that slice lands.
- **`resolveSourceKey` helper does a per-request read** — adds a vault read on every extract/insert. Acceptable; vault reads are cheap and the alternative (carrying the source key through the request) would leak source state into the wire format.
