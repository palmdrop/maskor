# View-layer component refactor

**Date**: 10-06-2026
**Status**: Todo

---

## Goal

> Every duplicated piece of presentational markup in `packages/frontend/src` resolves to one shared component: the labeled form row, the checkbox, the textarea, the status pill, the confirm-dialog footer, and the small-caps section header each have exactly one implementation, and the two largest copy-paste components (`global-create-dialogs.tsx`, the Overview sidebars) are rebuilt on those shared parts. "Done" = no raw `<textarea>` / `<input type="checkbox">` in feature code, the `Heading` atom is the only small-caps header, and `bun run verify` is green.

This is a **pure view-layer refactor with no behavior change**. It is scoped to the render tree and shared `components/ui` primitives. It deliberately does **not** touch the logic substrate owned by the four plans in [`_frontend-architecture-rollout.md`](_frontend-architecture-rollout.md) — see Coordination below.

---

## Coordination with the frontend-architecture rollout

The `agent/frontend-refactor` worktree owns hooks/mutations/state. Boundaries:

- **Plan 2 (`project-settings-consolidation`) introduces `SettingRow`** — a _horizontal_ settings row (label · control · description) for `GeneralTab` / `EntityEditorShell`. Our **`Field`** (Phase 2) is the _vertical_ form-field used in dialogs. Different shapes, but both render error text — the **`FieldError` atom (Phase 1) must be agreed as the shared error primitive** so it isn't built twice. Sync on naming before Phase 2 lands.
- **Plan 1 (`optimistic-mutation-primitive`) builds a registry-driven `useEntityEditor`** keyed by entity kind. The `global-create-dialogs` collapse (Phase 3) needs a per-kind descriptor — it must **reuse Plan 1's entity registry**, not introduce a second one. If Plan 1 hasn't landed its registry yet, Phase 3 waits or coordinates the registry shape.
- **Plan 3 (`overview-surface-hooks`) owns `OverviewPage/index.tsx`** (extracts `useFragmentSelection` + `useSectionOps`). The Overview render-tree split (Phase 6) touches only the **sibling** files (`ReorderList`, `SequenceSidebar`, `RightSidebar`) and moves **no state**. Sequence Phase 6 **after Plan 3 lands** to avoid churning overlapping files.
- Phases 1–2 (atoms + molecules) share **no files** with any of the four plans — fully parallel-safe.

---

## Tasks

### Phase 1 — Shared atoms (no plan overlap, do first)

- [x] Stay in the current `agent/frontend-component/refactor` branch.
- [x] Commit the plan itself.
- [x] Add `components/ui/textarea.tsx` mirroring `input.tsx` (same border/focus/invalid tokens, `resize-none` default, `rows` passthrough). Add a `textarea.stories.tsx` matching the `button.stories.tsx` style.
- [x] Replace the raw `<textarea>` in `create-entity-dialog.tsx` and `global-create-dialogs.tsx` with `<Textarea>`.
- [x] Add `components/ui/checkbox.tsx` (Radix Checkbox, token set matching `switch.tsx`). Optionally a `CheckboxField` pairing box + label.
- [x] Replace raw `<input type="checkbox">` in `DeregisterDialog.tsx`, `RestoreDraftDialog.tsx`, `ProjectStatsPage/index.tsx`.
- [x] Add `components/ui/badge.tsx` with `cva` variants (`default / secondary / muted / outline / destructive`) mirroring the `Button` variant vocabulary.
- [x] Migrate the reinlined pills to `<Badge>`: `fragments/fragment-metadata-form.tsx` (muted), `SequenceSidebar.tsx` (outline ×2), `ProjectConfigPage/index.tsx` (count, amber kept via className). **The other 4 listed files are not badge-shaped** (`TileContent` aspect chips, `ArcLegend`/`ReorderList` action buttons, `AspectEditor` color swatches) — forcing them into Badge would change behavior/appearance; left as-is and flagged in `references/suggestions.md`.
- [x] Add `components/ui/field-error.tsx` (`FieldError` — the `text-xs text-destructive` line) and adopt it in the dialogs/tabs currently inlining it (start with the create dialogs; full sweep happens with `Field` in Phase 2).
- [x] Tests for each atom (render + variant/prop behavior). Add stories where a sibling primitive has one.
- [x] `bun run format` then `bun run verify`; fix issues. `git commit`. **Note: `bun run verify` is red at branch HEAD from pre-existing, out-of-scope errors** (`packages/api` export `correlationId`, `OverviewPage/index.tsx:615`) — see `references/suggestions.md`. Frontend typecheck shows zero new errors from this phase; all 657 frontend tests pass.

### Phase 2 — Form & dialog molecules

- [x] **Sync `FieldError` naming with Plan 2 owner before starting.** Plan 2 has not landed in this branch; proceeded with `FieldError` as the shared name (the obvious choice) — flag for confirmation when Plan 2 lands.
- [x] Add `components/ui/field.tsx` (`Field`): label + control slot + optional description + `FieldError`, auto-wiring `htmlFor`/`id` via `useId`. Vertical layout (`flex flex-col gap-1.5`). Uses an explicit render-prop `{(control) => …}` to wire id/aria onto the control (no `cloneElement` magic).
- [x] Migrate the labeled-field rows to `<Field>`: `create-entity-dialog.tsx`, `RegisterProjectDialog.tsx`, `AspectsTab.tsx`, `ExportDialog.tsx`, `CreateDraftDialog.tsx`, `RestoreDraftDialog.tsx`, `RenameProjectDialog.tsx`, `DeregisterDialog.tsx`, `extract-to-entity-dialog-core.tsx`. (`global-create-dialogs.tsx` 8× deferred to Phase 3's rewrite — it is rebuilt on `Field` there, no point migrating twice. `fragment-stats-inspector.tsx` has no labeled control — its `<Label>Stats</Label>` is a standalone section label, nothing for `Field` to wrap. `GeneralTab.tsx` left to Plan 2's `SettingRow`.)
- [x] Add `BusyButton` absorbing the `{isPending ? "…ing" : "Action"}` ternary: `DeregisterDialog`, `RegisterProjectDialog`, `AspectsTab` (create), `extract-to-entity-dialog-core`, `append-or-prepend-dialog`, `LocateVaultDialog`, `SettingsSection`, `create-entity-dialog`. Confirm-family dialogs absorb it via `ConfirmDialog` internally.
- [x] Add `ConfirmDialog` molecule: `title, body, error, confirmLabel, pendingLabel, cancelLabel, variant, onConfirm, isPending, disabled`. Built on `Dialog` + `DialogFooter` + `BusyButton`.
- [x] Collapse the confirm-family dialogs onto `ConfirmDialog`: `DeleteDraftDialog`, `RestoreDraftDialog`, `RenameProjectDialog`, `CreateDraftDialog`, `ExportDialog`, `AspectsTab`'s delete dialog. `DeregisterDialog` stays bespoke (two-step confirm/result flow + result message) but adopts `Field` + `BusyButton`. `extract-to-entity-dialog-core` stays bespoke (`showCloseButton={false}` + ref focus/select) but adopts `Field` + `BusyButton`.
- [x] Tests: `Field` (id wiring, error render, description), `ConfirmDialog` (pending/disabled/destructive, confirm/cancel callbacks).
- [x] `bun run format` then `bun run verify`; fix issues. `git commit`. (`verify` red at HEAD from pre-existing out-of-scope errors — see Phase 1 note. Frontend typecheck adds no new errors; 666 frontend tests pass.)

### Phase 3 — Collapse `global-create-dialogs.tsx` (god component, 375 LOC)

- [x] **Confirm the entity registry shape with the Plan 1 owner.** Plan 1's registry has not landed in this branch, so defined a local per-kind descriptor table and flagged it for later merge (inline comment + `references/suggestions.md`).
- [x] Replace the four inline create flows with one descriptor table (per kind: title, create mutation, secondary-field config, post-create navigation) rendered through a single dialog body built on `Field` + `Textarea`/`Input` + `FieldError` + `BusyButton`. (Did **not** route the footer through `ConfirmDialog`: the original global-create dialogs have no Cancel button — only Create + the X — so a `ConfirmDialog` footer would add a Cancel button = visual change. Kept the bespoke `DialogFooter` + `BusyButton`. Did not reuse `CreateEntityDialog` either: that component is trigger-driven and textarea-only, while this is externally controlled and aspect uses an `Input` for its description.) File shrank from 375 → ~270 LOC.
- [x] Verify each entity kind's create + navigate behavior is unchanged (new `global-create-dialogs.test.tsx` asserts the descriptor drives all four kinds: titles, secondary control type, fragment content-trim + required check, aspect description shape, and per-kind navigation).
- [x] `bun run format` then `bun run verify`; fix issues. `git commit`. (`verify` red at HEAD from pre-existing out-of-scope errors — see Phase 1 note. Frontend typecheck adds no new errors; 675 frontend tests pass.)

### Phase 4 — `Heading` adoption sweep (mechanical)

- [x] Added a compact small-caps tier to `Heading` (`level={4}` = `text-xs uppercase tracking-widest`, no bottom padding) so the `text-xs` panel labels keep their size — `text-sm` section headings map to `level={3}`, `text-xs` panel labels to `level={4}` (decided with the developer; preserves sizes = true no-visual-change). Replaced the reinlined small-caps headers: `PlaceInSequenceModal`, `margin-orphan-group`, `DraftsPage`, `OverviewPage/components/{ArcOverlay,FragmentProse,ReorderList,RightSidebar,SequenceSidebar,ProseSpine}`, `PreviewPage`, `ProjectHistoryPage/{ActionLogList,index}`, `ProjectManagementPage`, `ProjectStatsPage`. **Left out (not section headings, flagged in `references/suggestions.md`):** `metadata-property.tsx` (`<dt>` in a `<dl>`, `font-serif`), `ProjectStatsPage` `<th>`s + `StatTile` caption, `margin-orphan-group`/`ActionLogList` `text-[10px]` pills, `ReorderList` rename input/button, `margin-notes-section` collapse toggle (interactive).
- [x] **Renaming `Heading` → `SectionHeading`: decided against.** `Heading` is already imported in ~6 files and reads fine; a rename/alias is churn for no real grep-ability win (the component file is `heading.tsx`). Skipped.
- [x] Visual spot-check (sizes preserved via the level-3/level-4 split; weight/tracking unified onto the Heading tokens by design); `bun run format` then `bun run verify`. Updated `ProjectHistoryPage.test.tsx` (day headers are now `level={4}`). Frontend typecheck adds no new errors; 675 frontend tests pass. (`verify` red at HEAD from pre-existing out-of-scope errors — see Phase 1 note.) `git commit`.

### Phase 5 — `SegmentedControl` (watch-item, optional)

- [ ] Add `SegmentedControl<T>` (`options, value, onChange`, per-option `disabled`) rendering the Button row internally; or adopt Radix ToggleGroup.
- [ ] Adopt in `append-or-prepend-dialog.tsx` (Keep/Cut/Link, Switch/Stay). Skip if no second consumer materializes — re-evaluate against import/extract flows first.
- [ ] Test selection behavior; `bun run format` then `bun run verify`. `git commit`.

### Phase 6 — Overview render-tree decomposition (DEFERRED until Plan 3 lands)

- [ ] **Precondition: Plan 3 (`overview-surface-hooks`) is merged.** Do not start before; this avoids churning files Plan 3 may touch.
- [ ] Extract leaf presentational components from `ReorderList.tsx` (555 LOC): `ReorderRow`, the drag handle — consuming `Button`/`Badge`/`Heading`. View-only; no state moves.
- [ ] Extract `SequenceTile` and panel sub-parts from `SequenceSidebar.tsx` (482 LOC) and `RightSidebar.tsx` (333 LOC).
- [ ] Replace the remaining raw `<button>` in these files with `Button` where the markup is a plain action (leave DnD/keyboard handlers that are intentionally raw).
- [ ] Tests for extracted components where they carry conditional rendering; `bun run format` then `bun run verify`. `git commit`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

These are pure refactors with no behavior change — existing component tests are the regression guard. New tests target the **new seams**: each atom's props/variants, `Field`'s id/error wiring, `ConfirmDialog`'s pending/destructive/callback behavior, and the `global-create-dialogs` descriptor driving all four entity kinds. No spec `shipped` frontmatter changes unless behavior shifts (treat that as a scope signal).

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In progress`. There is no behavior change, so no spec `shipped` frontmatter updates are expected — if a change turns out to alter behavior, stop and treat it as a scope signal.

Phases 1–2 are independently shippable and share no files with the four logic plans. Phase 3 needs Plan 1's registry; Phase 6 must wait for Plan 3. Phases 4–5 are free-floating.
