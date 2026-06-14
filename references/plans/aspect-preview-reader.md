# Aspect Preview / Reader

**Date**: 14-06-2026
**Status**: Done <!-- Todo | In progress | Done -->
**Specs**: `specifications/fragment-editor.md`, `specifications/aspect-arc-model.md`
**Closed**: 14-06-2026

---

## Goal

> While editing a fragment, the user can read its aspects' descriptions and notes without leaving the editor: the Margin gutter gains an **Aspect** tab that lists the fragment's attached aspects, each expandable to show the aspect's description (read-only) and notes. Done = the tab renders, expands one aspect at a time, and can be opened+focused on a specific aspect by clicking that aspect's chip in the metadata sidebar.

---

## Context

The only surface that shows an aspect's `description`/`notes` today is the dedicated `AspectEditorPage`. In the fragment editor an aspect is just a chip + weight slider in `fragment-metadata-form.tsx` — no way to read what it means while writing. This plan adds an in-place reader.

Building blocks that already exist (reuse, do not rebuild):

- `useGetAspect` (`@api/generated/aspects/aspects`) — single-get returning the full aspect including `description` (the list endpoint omits it; description is vault-only).
- `readonly-prose.tsx` — reusable read-only markdown renderer (used by Overview/Preview).
- `ui/tabs.tsx` — Radix tabs primitive.
- `EntityTag` / the aspect-row markup + `resolveAspectColor` already in `fragment-metadata-form.tsx`.
- The command system + `fragmentEditorScope` (`lib/commands/scopes/fragment-editor.ts`).

Key structural facts:

- The Margin gutter is `EntityEditorShell`'s `rightPanel`, supplied by `fragment-editor.tsx` as `<MarginColumn>` only when `showMargin` is true.
- Inline Overview/Preview editing mounts with `showMargin={false}` → no gutter. The Aspect tab therefore appears only on the dedicated `FragmentPage` (including focus mode, where the gutter still renders). This is accepted, not a defect.

---

## Scope

In scope: the standalone `<AspectPreview>` component + the fragment-editor Aspect tab and its selection wiring.

Out of scope (deferred to a follow-up): wiring `<AspectPreview>` into other views (Overview arc legend, aspect tags elsewhere) via a popover or other container; aspect auto-linking / bare-word "aspect mentions" (separate, larger feature — belongs with `specifications/document-links.md`); any inline editing of the aspect from the preview.

---

## Tasks

### Phase 1 — `<AspectPreview>` standalone component

- [x] Create branch `aspect-preview-reader` from the current base. _(2026-06-14)_
- [x] Add `AspectPreview` component. Resolves uuid via the cached aspect list, fetches via `useGetAspect`; renders `description` through `readonly-prose`, the `notes` list, and a deep-link to the aspect editor. Read-only. Loading + not-found + empty-description states. _(2026-06-14)_
- [x] Tests: description markdown, notes, deep-link, empty description, missing aspect. _(2026-06-14)_

### Phase 2 — Tabbed Margin gutter with the Aspect reader list

- [x] Restructure the gutter `rightPanel` into a tabbed container `[Margin] [Aspect]`. Margin is force-mounted + hidden when inactive (holds draft + scroll-sync state, geometry driven by the always-visible editor); default active tab is Margin. _(2026-06-14)_
- [x] Build the Aspect tab body (`AspectReaderTab`): reader list of attached aspects (color dot + key + weight), single-expand accordion revealing `<AspectPreview>`. _(2026-06-14)_
- [x] Orphaned aspect rows render muted with a "Create aspect" affordance instead of a preview. _(2026-06-14)_
- [x] Empty state when the fragment has no aspects: "No aspects on this fragment." _(2026-06-14)_
- [x] Lift the selection/expansion + active-tab state into `fragment-editor.tsx`; row headers toggle directly. _(2026-06-14)_
- [x] Tests: list renders attached aspects; single-expand; orphaned row; empty state; header toggle. _(2026-06-14)_

### Phase 3 — Sidebar-chip selection via the command system

- [x] Add the parameterized `fragment-editor:preview-aspect` command (local-UI, palette-discoverable from the attached aspect keys). `fragment-editor.tsx` publishes `previewAspect(aspectKey)` + `attachedAspectKeys`. _(2026-06-14)_
- [x] Make the aspect name/dot in `fragment-metadata-form.tsx` dispatch that command on click; weight slider and × detach unchanged. _(2026-06-14)_
- [x] Tests: command previews the chosen aspect and disables with no aspects (scope smoke). _(2026-06-14)_

### Phase 4 — Close-out

- [x] `bun run format`, then `bun run verify` — 822 tests pass; typecheck + lint + snapshot clean. _(2026-06-14)_
- [x] Update `specifications/fragment-editor.md` Shipped section. No model changes. _(2026-06-14)_
- [x] Final `git commit`. _(2026-06-14)_

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Component tests use the existing React Testing Library + `CommandsProvider` setup (Phase 3 commands require the provider wrapper, per `packages/frontend/CLAUDE.md`).

## Notes

Commit at the end of each phase (or sensible batch).

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`. ALSO update the relevant frontmatter of the relevant specs: add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
