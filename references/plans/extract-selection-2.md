# Plan: Extract Selection — Slices 2 + 3

**Date**: 21-05-2026
**Status**: In Progress
**Specs**: `specifications/extract-selection.md`

---

## Goal

A writer can (slice 2) extract any body selection into a new note, reference, or aspect — not just a new fragment — and (slice 3) append or prepend any body selection to any existing entity of any of the four types, via 8 new palette commands that use the closed-set argument picker to choose the target entity. End state: 12 palette commands total (`Extract / Append / Prepend to <fragment|note|reference|aspect>`), all wired through `EntityEditorShell`, all writing per-type action-log entries that match the shipped `fragment:extracted` shape.

---

## Scope notes

- **Slice 2 stays Keep-only**, mirroring the shipped first slice for fragments. No source-mode toggle, no next-mode toggle, hardcoded `Switch`. Cut + Stay toggles for extract-to-new are deferred to a follow-up slice (already deferred by the first-slice plan).
- **Slice 3 introduces Cut and the source-mode toggle, but scoped to the append/prepend modal only.** The append/prepend modal has both `Keep / Cut` and `Switch / Stay` toggles, including the target-then-source ordering and partial-success toast. The extract-to-new modal is not touched — its toggles land later. Spec's "session-sticky per direction" rule means the two directions don't share toggle state, so this asymmetry is non-leaky.
- **No `Link` mode in either slice.** `Link` stays UI-disabled until `document-links.md` ships.
- **Prerequisite check: the command palette already supports closed-set parameterized commands** (palette plan phases 4–5 shipped — see `specifications/command-palette.md` → "Parameterized commands"). No new palette infrastructure required for slice 3's entity picker.
- **Validator is already shared** (`packages/shared/src/utils/validate-entity-key.ts`). No new validation work; reused as-is.
- **`EntityEditorShell` is already shared** across fragment, note, reference, and aspect editor pages. The 12 commands and the two modals plug into it once.

---

## Tasks

### Phase 1 — Branch and shared frontend refactor

- [x] Create branch `feature/extract-selection-slices-2-3` off `main`.
- [x] Refactor `ExtractToFragmentDialog` into a per-type pair: a shared core (selection preview, key field with live validation, Confirm/Cancel, pre-fill+pre-select on open) and four thin wrappers per target type that supply the type-specific mutation hook, list-query hook, pre-fill prefix, and post-success route. The fragment wrapper preserves current behavior 1:1.
- [x] Refactor `useEditorExtractToFragmentCommand` into a generic `useEditorExtractCommand` factory or four parallel per-type hooks (`useEditorExtractTo{Fragment,Note,Reference,Aspect}Command`). Each registers `editor.extract-to-<type>` with the correct label, scope, disabled-with-reason, and `onExtract` callback. Pick the shape that minimizes duplication — likely a factory taking the target type plus the `getSelection` callback.
- [x] Confirm `SelectionCapture` already works for all four body editor surfaces (note/reference/aspect editors use the same `prose-editor` component as fragments). If any surface diverges, fix the divergence here, not later.
- [x] `bun run verify`.
- [x] `git commit` — refactor only, behavior preserved for the shipped fragment slice.

### Phase 2 — Slice 2: extract-to-{note, reference, aspect}

- [x] Add `note:extracted`, `reference:extracted`, `aspect:extracted` to `ActionTypeSchema` and the `LogEntrySchema` discriminated union in `packages/shared/src/schemas/domain/action.ts`. Payload shape is identical to the shipped `fragment:extracted` (`sourceType`, `sourceKey`, `sourceUuid`, `sourceMode`, `navigated`).
- [x] Add API commands `commands/notes/extract-note.ts`, `commands/references/extract-reference.ts`, `commands/aspects/extract-aspect.ts`, each mirroring `extract-fragment.ts` — write the new entity via the appropriate storage service and emit one `<type>:extracted` log entry. Export from `commands/index.ts`.
- [x] Add routes `POST /notes/extract`, `POST /references/extract`, `POST /aspects/extract` mirroring `extractFragmentRoute`, each accepting `{ key, content, sourceFragmentUuid, sourceMode, navigated }` (or the per-source-type equivalent — see next task) and returning `201` + the new entity.
- [x] Decide whether the extract endpoint takes `sourceFragmentUuid` or a generic `sourceUuid` + `sourceType`. The shipped route hardcodes `sourceFragmentUuid` because both source and target were fragments. The destination type now varies, but the source can also be any of the four; pick a name that holds for both axes (`sourceUuid` + `sourceType` is the obvious choice). Update the shipped `extract-fragment` route to match — this is a breaking change to the OpenAPI surface, run `bun run codegen` after.
- [x] Run `bun run codegen` in `packages/frontend`. Confirm `useExtractNote`, `useExtractReference`, `useExtractAspect` hooks generate.
- [x] Frontend: wire up `useEditorExtractTo{Note,Reference,Aspect}Command` in `EntityEditorShell` (and parallel modal state for each target type), reusing the shared dialog wrappers.
- [x] Tests: per-type unit tests for the smallest-unused-suffix logic and validate-extract-key behavior (the existing fragment tests are the template — parameterize by target type if cheap). Integration tests for at least one non-fragment target (e.g. note) covering pre-fill, clash, Confirm payload, success → navigation, server-error surface.
- [x] `bun run verify`.
- [x] `git commit` — slice 2.

### Phase 3 — Slice 3 backend: append/prepend API

- [x] Add 8 action types to `ActionTypeSchema` + `LogEntrySchema`: `fragment:appended`, `note:appended`, `reference:appended`, `aspect:appended`, `fragment:prepended`, `note:prepended`, `reference:prepended`, `aspect:prepended`. Payload shape identical to `*:extracted` (`sourceType`, `sourceKey`, `sourceUuid`, `sourceMode`, `navigated`).
- [x] Add a pure helper `applyInsertion(existingBody, insertedBody, position): string` with the blank-line separator rules from the spec (blank line between sides; suppress separator when existing body is empty/whitespace-only).
- [x] Add API commands `commands/<entity>/insert-<entity>.ts` (4 files, one per entity type with `position: "append" | "prepend"`) — each reads the target entity, applies `applyInsertion`, writes the updated entity via the storage service, and emits one `<type>:appended` or `<type>:prepended` log entry. `cutBodyCommand` handles source-body removal (no log entries emitted — the cut is a downstream effect already covered by the insertion log entry). Exported from `commands/index.ts`.
- [x] Source-mode handling: `sourceMode: keep | cut` accepted (`link` schema-rejected). Target write first (via insert command), then source PATCH (via `cutBodyCommand` which calls storage directly and emits no log entries). Route surfaces `{ sourceCutFailed: boolean }` in response for partial-success.
- [x] Add routes `POST /<entity>/{uuid}/append`, `POST /<entity>/{uuid}/prepend` (8 endpoints). Path uses the target entity's UUID; body carries `{ insertedBody, sourceUuid, sourceType, sourceMode, navigated }`.
- [x] `sourceMode: "link"` rejected at schema validation level (enum is `["keep", "cut"]`).
- [x] Run `bun run codegen` in `packages/frontend`. All 8 hooks generated (`useAppendFragment`, `usePrependFragment`, etc.).

### Phase 4 — Slice 3 frontend: modal + parameterized commands

- [ ] Build the append/prepend modal (`AppendOrPrependModal` or a pair of thin wrappers around a shared core): title naming direction + target (e.g. `Append to note: the-river`), read-only selection preview, source-mode toggle (`Keep / Cut`, `Link` disabled), next-mode toggle (`Switch / Stay`, default `Stay`), Confirm + Cancel. No key field. Confirm always enabled (subject to selection-non-empty).
- [ ] Add session-sticky toggle state for append/prepend, tracked independently from the extract-to-new toggles (per spec). Two pieces of in-memory state survive only the browser session — `useState` in a small context or a Zustand slice; reset on reload.
- [ ] Add 8 parameterized commands `editor.{append,prepend}-to-{fragment,note,reference,aspect}` via `useCommand`. Each declares an `arg` with `items` = the live entities of that target type (drawn from the existing list-query hooks), `getKey`, `getLabel`, `renderItem`. Excludes discarded fragments. Excludes the currently-edited entity from its own argument set.
- [ ] Disabled-with-reason `"Select text first"` when selection is empty/whitespace. Disabled-with-reason `"No <type>s to append to"` / `"No <type>s to prepend to"` when the target type has zero eligible entities. Same `disabledReason` getter pattern as the shipped `editor.extract-to-fragment`.
- [ ] On argument-pick, the command's `run` closes the palette and opens the append/prepend modal with the captured selection text, the target entity, and the direction. The palette → modal handoff pattern from `command-palette.md` and the shipped extract dialog applies unchanged.
- [ ] Wire all 8 commands and the modal into `EntityEditorShell` alongside the slice-2 commands.
- [ ] On Confirm with `Keep`: call `POST /<entity>/{uuid}/{append|prepend}` with `sourceMode: "keep"`. On success: emit log entry server-side; modal closes; navigate or stay per the next-mode toggle.
- [ ] On Confirm with `Cut`: call the same endpoint with `sourceMode: "cut"`. The route patches target then source. On full success: close + navigate/stay. On target failure: surface inline; modal stays open. On source failure after target succeeded: close + show partial-success toast _"Added to `{type}/{key}`. Couldn't update the source body — the selection is still there."_

### Phase 5 — Tests, spec update, finalize

- [ ] Unit tests for `applyInsertion` (append/prepend/empty-target/whitespace-only-target).
- [ ] Unit tests for the append/prepend command catalog hooks: argument set excludes discarded fragments + self, disabled-with-reason for empty-set, command ID conventions, label conventions.
- [ ] Integration tests for at least one append + one prepend flow, covering: argument pick, modal open with correct target named in title, Keep success, Cut success, Cut partial-success (target succeeds, source fails — mock the source PATCH to fail and assert the toast).
- [ ] Update `specifications/extract-selection.md` `**Shipped**:` line with what landed in slices 2 + 3.
- [ ] Set this plan's Status to `Done` (or `In Progress` if partial) and tick all completed tasks with completion dates.
- [ ] `bun run verify`.
- [ ] `git commit`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Key risk surfaces:

- **`applyInsertion`** — small pure helper, but the blank-line-suppression rule against an empty target is the easy thing to get wrong. Cover with table-driven unit tests.
- **Partial-success path** — the only flow that touches two entities. Mock the source PATCH to fail and assert that the target survives and the toast surfaces. Without explicit coverage this regresses silently.
- **Argument-set exclusion rules** — discarded-fragment exclusion and self-exclusion are easy to miss in the closed-set picker. Unit-test the item provider directly.
- **Cross-type contamination** — slice 2 adds three target types; verify a clash check for a note key does not consult the fragment namespace (`_glossary.md` and the spec are clear: cross-type collisions are allowed). The existing per-type list-query hooks already enforce this by construction, but write at least one test that locks it in.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented. ALSO, update the relevant specs `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks here.
