# Extract Selection — 4-command redesign

**Date**: 22-05-2026
**Status**: Todo
**Specs**: `specifications/extract-selection.md`, `specifications/command-palette.md`

---

## Goal

Replace `extract-selection.md`'s 12 view-scoped commands with **4** view-scoped commands — `Extract to {fragment, note, reference, aspect}` — that combine target-pick and create-new into a single argument-picker step. The picker shows existing entities of the chosen type matching the user's typed name; when no exact match exists, a sentinel `Create new "<typed>"…` row appears at the bottom. Selecting an existing target opens an append/prepend modal; selecting the sentinel opens an extract-to-new modal. Action-log entry types stay as the existing 12 (`<type>:{extracted, appended, prepended}`) — only the user-facing command shape changes.

Done = palette shows exactly 4 extract commands while a body editor is focused, the full flow works in all three editor modes (rich, raw, vim), `specifications/extract-selection.md` reflects the new design, and the previous 12 commands plus their UI plumbing are removed.

---

## Tasks

### Phase 1 — Spec and branch

- [ ] Create branch `extract-selection-3`
- [ ] Rewrite `specifications/extract-selection.md` to reflect the 4-command design. Specifically:
  - Replace the "Twelve commands" tables and copy with the 4-command catalog.
  - Document the picker step: existing-target rows first, sentinel `Create new "<typed>"…` row at the bottom shown only when no exact match exists.
  - Document the three modal variants:
    - **Existing target** — toggles: `Append` / `Prepend` (default `Append`, session-sticky), `Keep` / `Cut` (default `Cut`), `Switch` / `Stay` (default `Stay`).
    - **New target via typed name** — toggles: `Keep` / `Cut`, `Switch` / `Stay` (default `Switch`). No key field — already entered in the picker.
    - **New target via sentinel-without-name** (i.e. user typed nothing then picked the sentinel) — key field pre-filled `unnamed-{type}-{n}`, plus the two toggles. Behaves like the previous extract-to-new modal.
  - Document key validation reuse (extract-to-new path only), unchanged.
  - Document discarded-fragment exclusion from the picker (still applies to append/prepend targets).
  - Document self-target exclusion (the currently-edited entity is filtered out of its own picker).
  - Retain the existing 12 action-log types — the user-facing command count and the action-type count are intentionally decoupled. Each operation still emits exactly one entry with the appropriate `<type>:{extracted, appended, prepended}` action.
  - Keep the existing `Shipped:` log untouched; the 12-command implementation shipped and is the historical record.
  - Add a `Shipped:` entry for this redesign at completion (last task of plan).
- [ ] Update `specifications/command-palette.md` if the picker-with-sentinel pattern warrants a first-class mention under "Parameterized commands" (optional — only if the pattern looks reusable for future commands).
- [ ] Commit (`git commit`) the spec edits before any code changes.

### Phase 2 — Implementation

- [ ] Reduce the 12 `useCommand` registrations in the body editor down to 4: `editor.extract-to-fragment`, `editor.extract-to-note`, `editor.extract-to-reference`, `editor.extract-to-aspect`. Delete the 8 append/prepend command registrations.
- [ ] Implement the picker step for the 4 commands:
  - Items: every live entity of the target type in the current project, filtered by the user's typed query.
  - Sentinel: when no exact-match item is present, append a `Create new "<typed>"…` row at the bottom; selecting it dispatches the extract-to-new flow with the typed name pre-filled.
  - Discarded fragments excluded; the currently-edited entity excluded.
- [ ] Implement / refactor the three modal variants:
  - **Existing target modal**: combines the previous append/prepend modal with an `Append` / `Prepend` toggle.
  - **New target with typed name**: extract-to-new modal minus the key field.
  - **New target with empty name (sentinel-without-name)**: existing extract-to-new modal, unchanged.
- [ ] Wire all three modals through the existing partial-success and order-of-operations rules (create-first / target-first; source body update treated as save). No behaviour change here — only the UI route changes.
- [ ] Keep the existing 12 action-log type emissions. Map the new UI paths back to the correct action type per operation.
- [ ] Update / extend tests:
  - Picker shows existing entities; sentinel row appears when no exact match.
  - Selecting an existing entity opens the existing-target modal with Append/Prepend toggle.
  - Selecting the sentinel opens the new-target modal pre-filled with the typed name.
  - Action-log entries continue to use the existing 12 types and payload shape.
  - Discarded fragments and self-target are excluded from the picker.
- [ ] Commit each logical chunk (registrations / picker / modals / tests) as separate `git commit`s.

### Phase 3 — Cleanup and verification

- [ ] Remove dead code from the old 12-command flow: unused command IDs, modal variants that no longer have an entry point, helper functions exclusive to the old shape.
- [ ] `bun run verify` — fix any failures before stopping.
- [ ] Add the `Shipped:` entry to `specifications/extract-selection.md` describing the slice.
- [ ] Final `git commit`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Specifically: extend the existing extract-selection test suite to cover the picker-with-sentinel flow and the three modal variants. Verify action-log entries still use the existing 12 types.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch `extract-selection-3` based on this plan, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented. ALSO, update `specifications/extract-selection.md`'s `Shipped:` log with a one-bullet description of the slice (date + summary + this plan path).

Greenfield project — no users to migrate. Rip-and-replace is fine; do not keep the 12-command shape behind a flag.
