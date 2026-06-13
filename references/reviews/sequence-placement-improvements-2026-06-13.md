# Review: Sequence placement improvements

**Date**: 2026-06-13
**Scope**: `packages/sequencer`, `packages/api/src/commands/sequences`, `packages/frontend` (OverviewPage, PlaceInSequenceModal, fragment-editor)
**Plan**: `references/plans/sequence-placement-improvements.md`
**Spec**: `specifications/sequencer.md`, `specifications/overview.md`

---

## Overall

Implementation matches the goal. The robustness centrepiece — import-sequences frozen at the backend, not just hidden in the UI — is done correctly: the guard lives in `@maskor/sequencer` on the pure mutating functions, so it holds for every caller, with the three section commands that bypass the pure layer (`create`/`delete`/`rename-section`) guarded at the command layer. Coverage at the sequencer level is exhaustive and the route mapper translates the error to a clean 409. No correctness bugs found. The remaining issues are one process item (the regenerated OpenAPI snapshot is uncommitted, so HEAD is not verify-clean) and minor structural/UX notes.

---

## Bugs

None.

---

## Design

### 1. OpenAPI snapshot regeneration is uncommitted — HEAD is not verify-clean

`packages/frontend/src/api/openapi.json` — the working tree carries a 2013-insertion reflow (single-line arrays → multi-line). This is **not** a semantic change: schema content is byte-identical aside from array wrapping. The generator (`generate-openapi.ts`) uses `JSON.stringify(document, null, 2)`, which emits multi-line arrays; an earlier committed snapshot was prettier-collapsed before `openapi.json` was added to `.prettierignore`. `verify:openapi` compares the regen against the on-disk (working-tree) file, so it passes now — but only because the regen sits uncommitted. Committing it is exactly Phase 5's open "fix codegen-drift / commit" step.

Action: commit the regenerated snapshot. Without it, the branch's HEAD does not pass `verify:openapi`.

### 2. Read-only predicate duplicated inline across the frontend

`fragment-editor.tsx:99` (`sequence.origin === undefined`) and `OverviewPage/index.tsx:115` (`sequence?.origin !== undefined`) each hand-roll the import-sequence test. `@maskor/sequencer` exports `isSequenceReadOnly`, but it takes the sequencer's `Sequence`, not the generated frontend schema type, so it can't be reused directly. A small frontend helper (`isSequenceReadOnly(sequence: schema.Sequence)`) would keep the rule in one place and prevent the two sites drifting (e.g. one later also checking a different flag). Low priority — the logic is currently trivial and consistent.

---

## Minor

### 3. Route-level read-only tests cover 2 of 11 mutating routes

`sequences.test.ts` asserts 409 `sequence_read_only` for `placeFragment` and `createSection` only. The plan's Phase 1 says "route-level tests asserting **each** mutation is rejected". The sequencer-level test (`sequencer.test.ts`) is exhaustive across all eight pure functions plus insert/clone, and the route error mapper is shared, so the two route tests adequately prove the mapping wires through — but the plan's claim is broader than what shipped. Acceptable; flag the overstatement.

### 4. Badge label wording differs from the spec/glossary

`placementOptions.ts:42` renders `${name} · in "${sectionName}"`. The goal statement and glossary describe an "already in «section»" badge. Cosmetic, but the spec wording and the rendered string should agree — pick one.

### 5. Arranger selection highlight does not change the action target

`SequenceArranger.tsx:187` wires `onSelectFragment={setSelectedFragmentUuid}`, so clicking any row moves the highlight — but the footer Move/Remove buttons (`:218-244`) and the keyboard handler (`:151-164`) always act on `activeFragmentUuid`, never the selected row. A user who clicks a different row then presses Backspace removes the *active* fragment, not the highlighted one. Mildly misleading; consider making the highlight read-only (no `onSelect`) or making the actions follow selection.

### 6. "Add" no longer lets the user choose a target section

`SequenceArranger.tsx:121-134` — `handleAdd` always places into `sectionsData[0]`. The old modal offered a section `Select` when adding. This is intentional per ADR 0014 (the arranger arranges, it does not manage sections) and drag-from-pool still reaches any section, so no capability is lost — noting only because it is a deliberate behaviour change from the superseded modal.

---

## Non-issues

- **Guard on the pure functions doesn't break import/clone/insert-source** — verified: `import.ts` builds the import-sequence as an object literal and writes via storage (never calls `placeFragment`); `cloneSequence` constructs a fresh object with no `origin` (the escape hatch); `insertSequenceIntoSequence` guards the target only, so an import-sequence remains usable as an insert *source*. No other internal callers of the guarded functions exist outside the command files.
- **`move-section` throws 404 before 409 on a read-only sequence with a bad section id** — `moveSectionCommand` checks `sectionExists` before `moveSection`'s guard fires. Benign: a valid section on a read-only sequence still returns 409; only the nonexistent-section-on-read-only edge returns 404 first, which is a reasonable precedence.
- **`buildPlacementOptions` does not itself filter import-sequences** — the caller (`fragment-editor.tsx` → `placeableSequences`) filters them out first, so they never reach the option builder. No double responsibility.
- **Footer buttons / DnD call `.mutate()` directly instead of dispatching through the command system** — exempt per `packages/frontend/CLAUDE.md` (dialog-internal confirmations and DnD handlers are not palette-discoverable).
