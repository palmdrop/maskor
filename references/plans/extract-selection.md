# Plan: Extract Selection — First Slice

**Date**: 21-05-2026
**Status**: Done
**Specs**: `specifications/extract-selection.md`

---

## Goal

A writer can select text inside the fragment editor body, run `Extract to fragment…` from the command palette, accept the pre-filled key, and land on the new fragment's editor route — with a new vault fragment containing exactly the selected text. The source fragment is untouched.

---

## Slice scope

The full spec has four target types × three source modes × two next-modes × four source surfaces. This slice picks the smallest combination that is still useful and ships it end-to-end.

**In this slice:**

- Target type: fragment only.
- Source surface: fragment body editor only (rich, raw, vim — all three, because they share the same selection-capture surface).
- Source mode: `Keep` only (no modification of the source body).
- Next mode: `Switch` only (always navigate to the new fragment; no toggle).
- Modal: key field, Confirm, Cancel. No source-mode or next-mode toggles in the UI yet.
- Pre-fill `unnamed-fragment-<n>`, smallest unused `n`, pre-selected on open.
- Live per-type key validation; discarded fragments count as clashes.
- One `extract` entry written to the action log.

**Deferred to follow-up slices:**

- Other target types (note, reference, aspect).
- Other source surfaces (note, reference, aspect body editors).
- `Cut` source mode (touches source body — needs save coupling and partial-success handling).
- `Link` source mode (depends on `document-links.md`).
- `Stay` next mode and the source-mode / next-mode toggles in the modal.
- Session-sticky toggles.
- SSE-aware selection re-find (only matters once `Cut` exists).

Rationale for the cut: `Keep + Switch + fragment target` is the smallest combination that requires no source-body mutation, no atomicity reasoning across two entities, no toggles, and no inter-spec dependency on `document-links.md`. It is also the highest-value first move — fragments are the dominant entity type and "lift this passage into its own fragment" is the canonical refactor.

---

## Tasks

### Phase 1 — Foundation

- [x] Create branch `feature/extract-selection-first-slice`.
- [x] Audit existing fragment-create validation: locate the validator, confirm it covers empty key, illegal characters, live clash against `fragments/` and `fragments/discarded/`.
- [x] If validation is duplicated across packages or routes, extract a single shared validator. If a shared validator already exists, take a dependency on it. No new rules invented.
- [x] Audit existing fragment-create endpoint and storage write path: confirm it returns the same error shape (`KEY_TAKEN` or equivalent) that the modal will surface.

### Phase 2 — Selection capture

- [x] Add a selection-capture helper for the fragment body editor that returns `{ text, isEmpty }` from the editor's authoritative state.
  - Tiptap: serialize the selection slice with the editor's existing markdown serializer.
  - CodeMirror (raw + vim): substring from `view.state.selection.main`.
- [x] Trim leading/trailing whitespace; treat trim-empty as `isEmpty: true`.
- [x] Browser selection (`window.getSelection`) is not used.

### Phase 3 — Extraction modal

- [x] Build the extraction modal component: title `Extract to fragment`, read-only selection preview (truncated), key textbox, Confirm + Cancel.
- [x] Focus the key textbox on open with its pre-filled value pre-selected.
- [x] Pre-fill computes `unnamed-fragment-<n>` where `n` is the smallest positive integer such that no live or discarded fragment uses that key. Source: the per-vault DB index.
- [x] Live key validation: debounced lookup against the DB index; Confirm disabled while the key is empty, invalid, or clashing. Specific reason text on clash with a discarded fragment matches the spec.
- [x] Esc closes the modal and returns focus to the editor at its prior selection.

### Phase 4 — Command registration

- [x] Register `editor.extract-to-fragment` via `useCommand` inside the shared fragment body editor component. Palette label: `Extract to fragment…`. Scope label in the palette: `Editor`.
- [x] Disabled-with-reason `"Select text first"` when the selection is empty or whitespace-only.
- [x] The command's `run` reads the captured selection, closes the palette, opens the extraction modal handing the captured selection text in as the body. The palette → modal handoff is the precedent established in `command-palette.md`.

### Phase 5 — Server flow, navigation, action log

- [x] On Confirm: call the extraction endpoint with `{ key, content, sourceFragmentUuid, sourceMode: "keep" }`. Modal shows a spinner; no optimistic creation.
- [x] On success: emit one `fragment:extracted` entry to the project action log with `sourceMode: "keep"`, `navigated: true`, source/target entity identifiers.
- [x] On success: close modal and route to the new fragment's editor.
- [x] On failure: surface the server error message in the modal; modal stays open.

### Phase 6 — Tests + spec update

- [x] Unit tests for the `unnamed-fragment-<n>` smallest-unused computation, including the discarded-fragment case.
- [x] Unit tests for `validateExtractKey` (key validation), including discarded-fragment clash message.
- [x] Integration test: pre-fill, clash (live + discarded), Confirm payload, onSuccess, server-error surface, Cancel.
- [x] Update `specifications/extract-selection.md` Shipped frontmatter with the slice scope and this plan path.
- [x] `bun run verify`.
- [x] `git commit`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The cross-editor-mode selection-capture helper is the riskiest piece; unit-test it directly with both editor families. Modal behavior (validation, pre-fill, Confirm-gating) is best covered by integration tests against the rendered modal.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented. ALSO, update the relevant specs `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks here.
