# Fragment editor: navigation, focus mode, and inline-editing rework

**Date**: 11-06-2026
**Status**: Todo
**Specs**: `specifications/fragment-editor.md` (primary), `specifications/navigation.md`, `specifications/overview.md`, `specifications/preview.md`, `specifications/prompting.md`

---

## Goal

> The fragment editor is navigable (view-supplied Prev/Next), can hide all chrome but the navbar via an explicit persisted **focus mode**, and is the single editing surface everywhere — including Overview/Preview, where it mounts as a center-replacing overlay (no more markdown split), returning the reader to the top of the last-edited fragment on exit.

Design is fully resolved (grilling session, 2026-06-11). ADR: `references/adr/0013-inline-editing-as-center-replacing-overlay.md`. Glossary term **Focus mode** already added. This plan is three threads (A navigation, B inline rework, C focus) sequenced to de-risk: build the navigation capability, prove it on the simplest consumers, add focus, then do the invasive Overview/Preview rework.

Three conceptually distinct features, one plan — keep them distinct: **inline editing is not focus mode**; opening the overlay does not hide chrome.

---

## Tasks

### Phase 0 — Plan

- [ ] Stay on the **current worktree branch** (this is a dedicated worktree — do **not** create or switch branches; whatever branch is checked out is the working branch). Confirm a clean-ish tree, then proceed.
- [ ] Commit this plan.

### Phase 1 — Navigation capability + Suggestion migration (Thread A)

- [ ] Add a structured `navigation` prop to `FragmentEditor` (`{ onNext, onPrevious, hasNext, hasPrevious, isNavigating }`, all optional). The editor renders consistent Prev/Next buttons in its action area and owns the `⌘↵`→next hotkey (dispatches `onNext`). Editor stays a dumb slot-provider — it never decides the ordering or performs the advance.
- [ ] Migrate `SuggestionModePage` off its bespoke `customizeExtraActions` Prev/Next markup onto the new `navigation` prop. `onNext`/`onPrevious` keep dispatching the existing `suggestion:next` / `suggestion:previous` commands; avoidance/cooldown/nudge/save-error logic stays local to the suggestion scope. `hasPrevious` = `router.history.canGoBack()`; suggestion never disables Next. `customizeExtraActions` keeps only the suggestion save-error banner.
- [ ] Tests: editor renders Prev/Next only when `navigation` is provided; `⌘↵` dispatches `onNext`; disabled states reflect `hasNext`/`hasPrevious`/`isNavigating`; suggestion Prev/Next still drive their commands (wrap in `CommandsProvider`).
- [ ] `bun run format` → `bun run verify`; fix; `git commit`.

### Phase 2 — Fragment list Prev/Next (Thread A, route-nav consumer)

- [ ] Wire `fragments:next` / `fragments:previous` commands owned by `FragmentListPage` (it holds the filter + show-discarded state, so it owns the ordering). Traversal set = the currently-rendered `filtered` list; Next/Prev step by uuid (compute index each render); disable at first/last; if the active uuid is no longer in `filtered`, disable both.
- [ ] Surface the list page's ordering to the editor rendered in its `<Outlet/>` (FragmentPage) so the editor's `navigation` prop can dispatch the commands and read `hasNext`/`hasPrevious`. Decide the wiring (a `FragmentListPage`-published command scope read by `FragmentPage`, or a small context provider) — must respect the live filter state, not a re-derived order.
- [ ] Next saves the current fragment first (route nav away already prompts on unsaved per `navigation.md`); honor the existing unsaved-changes guard.
- [ ] Tests: filtered list traversal + boundary disable + clamp-on-removal; Next respects the unsaved guard. Wrap in `CommandsProvider`.
- [ ] `bun run format` → `bun run verify`; fix; `git commit`.

### Phase 3 — Focus mode (Thread C)

- [ ] Add an editor-internal focus toggle: a button in the editor action area + a per-project `usePersistedBoolean` (default off, honored-when-on, **never auto-forced**). Register palette command(s) for it. Independent of the metadata-sidebar collapse.
- [ ] When focus is on, the editor presents as a fixed full-viewport overlay below the navbar, covering host chrome without host cooperation (no shared store, no per-page respect logic). Navbar always stays.
- [ ] **CRITICAL — no remount.** Toggling focus must not remount the editor (would drop the unsaved buffer + cursor). Mount the editor once; change only presentation. Prefer `position: fixed` toggled via CSS over a true React portal *if* it avoids remount. **Risk:** transformed ancestors (dnd-kit in Overview) break `position: fixed`; verify the editor's container is not inside a transformed subtree, or fall back to a portal target that the editor renders into unconditionally (so the React tree position is stable). This is the main technical risk — resolve it before wiring the inline overlay (Phase 4/5).
- [ ] Confirm focus works in the surfaces that exist today: dedicated `FragmentPage`, `FragmentListPage` outlet (hides the `aside` list), `SuggestionModePage`.
- [ ] Tests: toggling focus does not remount (editor buffer + cursor preserved across a toggle — assert on a dirty buffer surviving); persisted flag honored on mount; navbar stays.
- [ ] `bun run format` → `bun run verify`; fix; `git commit`.

### Phase 4 — Inline rework: Overview (Thread B, part 1)

- [ ] Replace the Overview spine's in-place editing with a center-replacing overlay: when a fragment is opened for edit, the host (`OverviewPage`) unmounts the prose spine in the center column and mounts the full `FragmentEditor` (`showMargin={false}` — new prop suppressing the Margin column; metadata sidebar collapsible). The reorder list + detail panel sidebars stay.
- [ ] Strip `FragmentProse` of all internal edit state (`isEditing`, `isSaving`, `beginEditing`, `handleSave`, the `InlineFragmentEditor` branch, the `hasSelection` selection-affordance logic). Replace the `onSaveContent` prop with `onEdit(fragmentUuid)`; double-click + the pencil call `onEdit`; the host opens the overlay. Keep the `fragment-<uuid>` anchor id.
- [ ] Wire `overview:next` / `overview:previous`: traversal set = placed fragments in spine order, **excluding the unassigned pool + discarded**; step by uuid; disable at ends; clamp on removal. Save-then-go for Next; dirty-guard on Prev.
- [ ] Selecting a different fragment in a host sidebar while the overlay is open retargets the overlay (subject to dirty-guard).
- [ ] Exit: Close/Done affordance + `Cmd+Escape` (not bare Escape — vim). Save does not auto-exit. On exit, scroll the spine to the **top of the last-shown fragment** via the existing `fragment-<uuid>` anchor; remove the bespoke split scroll-restoration. Cursor-precision restoration deferred.
- [ ] Tests: open/retarget/exit overlay; `overview:next` traversal excludes pool/discarded + boundary/clamp; scroll-to-top-of-last-shown on exit; `showMargin={false}` hides the Margin; dirty-guard on exit/Next.
- [ ] `bun run format` → `bun run verify`; fix; `git commit`.

### Phase 5 — Inline rework: Preview (Thread B, part 2)

- [ ] Replace the Preview split-markdown editing with the same center-replacing overlay in `PreviewPage`: on double-click → resolve fragment uuid (keep existing nearest-anchor resolution) → unmount the assembled `PreviewProse`, mount `FragmentEditor` (`showMargin={false}`) in the center; the `FragmentNavSidebar` stays.
- [ ] Wire `preview:next` / `preview:previous`: traversal = assembled `allFragments` order; step by uuid; disable at ends; clamp. Save-then-go for Next; dirty-guard on Prev. Sidebar selection retargets the overlay.
- [ ] Exit: Close/Done + `Cmd+Escape`. On exit, scroll `main` to the top of the last-shown fragment (`fragment-<uuid>` anchor / `useFragmentAnchor`). Remove `editSplit` / two-`ReadonlyProse`-flanking rendering and the post-save `pendingScrollUuid` re-scroll machinery; keep plain scroll persistence on navigation.
- [ ] Delete `splitAroundFragment` (`lib/preview/split-around-fragment`) + its usage and tests. **Keep** the anchor sentinels (`fragment-anchor` / `anchorSentinel`) — still used for nav/scroll.
- [ ] Tests: open/retarget/exit overlay; `preview:next` traversal + boundary/clamp; scroll-to-top on exit; margin-anchor round-trip still lossless through the full editor (the Phase 4 margins-safety guarantee now rides the real editor).
- [ ] `bun run format` → `bun run verify`; fix; `git commit`.

### Phase 6 — Dead-code removal, specs, docs

- [ ] Delete `components/inline-fragment-editor.tsx` + its test (last consumer removed after Phases 4–5). Grep for stragglers.
- [ ] Update specs (`Shipped` + Scope/Behavior; no implementation detail):
  - `fragment-editor.md` — add navigation capability + focus mode to Scope/Behavior; resolve the "Focus toggle shortcut" open question framing; add Shipped entries.
  - `navigation.md` — resolve the open prev/next question (prev/next exists, ordering is view-supplied).
  - `overview.md`, `preview.md` — reverse the in-place-split language; point to ADR 0013; note the center-replacing overlay + scroll-to-top-of-fragment on exit.
  - `prompting.md` — note suggestion rides the shared editor navigation capability.
- [ ] `bun run snapshot` (codebase snapshot refresh). No API routes changed → no `bun run codegen` expected; run it only if a route changes.
- [ ] `bun run format` → `bun run verify`; fix; `git commit`. Set plan Status → Done, add `Closed` date.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Key risk areas: focus toggle must not remount the editor (assert a dirty buffer + cursor survive a toggle); navigation traversal correctness per view (filters respected, pool/discarded excluded in Overview, boundary disable, clamp-on-removal); scroll-to-top-of-last-shown-fragment on inline exit; margin-anchor lossless round-trip now that the full editor edits inline; `showMargin={false}` suppression. Command-system tests wrap in `CommandsProvider`.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

This runs in a dedicated worktree: stay on the current branch. Do **not** create or switch branches — proceed on whatever branch is checked out.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`. ALSO update the relevant spec frontmatter — add `Shipped` items for the features implemented (no implementation detail or granular tasks).
