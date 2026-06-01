# Review: Place in sequence

**Date**: 2026-06-01
**Scope**: `packages/frontend/src/components/sequences/PlaceInSequenceModal.tsx`, `packages/frontend/src/components/fragments/fragment-sequence-membership.tsx`, `packages/frontend/src/lib/sequences/stepMove.ts`, `packages/frontend/src/lib/commands/scopes/fragment-editor.ts`, `packages/frontend/src/components/fragments/fragment-editor.tsx`, `packages/frontend/src/pages/OverviewPage/{index,components/TileContent}.tsx`
**Plan**: `references/plans/place-in-sequence.md`
**Spec**: `specifications/sequencer.md`, `specifications/command-palette.md`

---

## Overall

Implementation matches the plan across all five phases. The step-move extraction is a faithful, behavior-preserving lift of the Overview logic; the modal reuses only `TileContent` + `computeStepMoveTarget` and never touches `useSequenceDnD`/`SortableTile`, honoring ADR 0006. Live-commit, query invalidation, command wiring, and the membership sidebar all behave as specified. No correctness bugs found. The fragility items below — a destructive shortcut behind a too-narrow guard, an undocumented position-coordinate contract, and a close-lifecycle that cut Radix's focus restoration — were resolved after review. All items in this document are now **fixed**; `bun run format` + `bun run verify` are green.

---

## Bugs

None.

---

## Design

### 1. Destructive `Backspace`/`Delete` shortcut behind a tag-name denylist — fixed

`PlaceInSequenceModal.tsx` — the modal binds `Backspace`/`Delete` (→ unplace, committed live) at the `DialogContent` level, guarded only by `tagName === INPUT|TEXTAREA|SELECT`. A denylist of three tags is one new focusable widget away from a destructive misfire: a `contentEditable`, a Radix `Combobox` (a `<button role="combobox">`), or any `div[role="textbox"]` would pass the guard, so `Backspace` while interacting with it would silently remove the fragment from the sequence.

A purely positional allowlist (only act when `event.target === event.currentTarget`) was considered and rejected: Radix's `FocusScope` moves focus to a child control on open, so requiring focus on the dialog container would stop the shortcuts firing at all in real use.

Fix: replaced the three-tag check with `isTextEntryTarget`, which suppresses the shortcuts on any text-entry surface — `isContentEditable`, `INPUT`/`TEXTAREA`/`SELECT`, and ARIA `textbox`/`combobox`/`searchbox` roles — while still allowing them from the action buttons and the container. Comment explains why the positional allowlist was not viable.

### 2. `position` carried two coordinate systems with no written contract — fixed

`stepMove.ts`, `PlaceInSequenceModal.tsx` — the same `position` field means a **post-removal** destination index for _move_ (remove-then-insert, which is why a within-section "next" lands at `index + 1`) but a **plain insertion index** for _place_ (append). Correct, but the invariant lived only in the two call sites' behavior; the end-of-section cases that are easiest to eyeball mask any drift, so a future change could reintroduce a mid-section off-by-one undetected.

Fix: documented the move coordinate system on `computeStepMoveTarget` and the contrasting place semantics on `handleAdd`. No behavior change.

### 3. Modal unmounted on close, cutting Radix's focus restoration — fixed

`fragment-editor.tsx` — the dialog was gated `{placeInSequenceId && <… open />}` with `open` hard-coded true, so closing (`onOpenChange(false)` → `setPlaceInSequenceId(null)`) tore the Radix `Dialog` down synchronously. That can pre-empt Radix's close lifecycle, including focus return — risking focus dropping to `<body>` for keyboard users instead of returning to the opener.

Fix: split `open` (`isPlaceInSequenceOpen`) from the mount decision (`placeInSequenceId`). Close now flips `open` to false and leaves the dialog mounted, so Radix runs its own close + focus-restore; the next invocation re-points `placeInSequenceId` and re-opens.

---

## Minor

### 4. "Sequence not found" doubled as the loading state — fixed

`PlaceInSequenceModal.tsx` — `sequence` was `undefined` both while `useListSequences` was in flight and when the id genuinely didn't exist, so a still-loading bundle rendered **"Sequence not found."**. Fix: added an `isBundleLoading` branch ("Loading sequence…") ahead of the not-found branch.

### 5. Membership built an array with an imperative `for...of` + `push` — fixed

`fragment-sequence-membership.tsx` — rewritten as a `flatMap` returning `[]` / `[membership]`, matching the surrounding functional style and dropping the mutable accumulator.

### 6. Modal test gaps versus the plan's Testing list — fixed

`PlaceInSequenceModal.test.tsx` — added a within-section forward-move test (`Move right` → same section, `position: 1`) and a delete-section dispatch test (two sections → first `Delete section` dispatches `deleteSection.mutate` with the right `sectionId`). The active-fragment-falls-to-pool transition remains backend-driven and is not asserted at the unit level.

### 7. Committed test mock failed `eslint --fix` — fixed

`fragment-sequence-membership.test.tsx` — the `Link` mock used `<a href="#">`, which trips `jsx-a11y/anchor-is-valid` and breaks `bun run format`. It slipped through because `bun run verify` does not run eslint (only typecheck + openapi + tests). Changed to `href="/mock"`. **Flagged to the developer**: `verify` not covering lint means committed code can fail `format`; worth aligning the two gates.

---

## Non-issues

- **Within-section "next" target = `index + 1`** — looks like an off-by-one but is correct under remove-then-insert semantics (removal shifts the array); now documented (item 2) and pinned by `stepMove.test.ts`.
- **Nested ternary in the command's `disabled`** — matches the existing `discard`/`restore` commands in the same file; consistent, not drift. Becomes a readability cliff only if a fourth condition is added.
- **Membership link passes only `search={{ sequence }}`** — the overview route's `validateSearch` makes both `sequence` and `density` optional (`router.ts:76-84`), so omitting `density` is valid (TypeScript would catch it if `density` became required). It does silently reset density to default on navigation — accepted.
- **`NO_ASPECT_COLORS` empty map** — deliberate; compact context tiles fall back to a neutral aspect bar rather than recomputing the Overview palette. Relies on `AspectColorBar`'s missing-key fallback and is a deliberate visual divergence from the Overview; documented inline.
