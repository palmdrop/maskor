# Preview — first slice

**Date**: 18-05-2026
**Status**: Done
**Specs**: `specifications/preview.md`, `specifications/export.md`

---

## Goal

A user can navigate to `/projects/$projectId/preview`, see the project's main sequence rendered as continuous read-only prose, switch to any other sequence via a picker, toggle fragment titles / section headings / fragment separator from an inline toolbar (state persisted in `project.json`), and click a fragment in a sidebar to scroll the prose to that fragment. Reloading the page restores both the selected sequence (from URL) and the toggle state (from `project.json`).

> This is the read + navigate slice only. Out of this slice: stale-content SSE indicator + refresh banner, out-of-sequence badge, "Preview this sequence" affordance from the sequence editor, pre-export inspection wiring, and any of the deferred items in `specifications/preview.md` § Out of scope.

---

## Tasks

### Phase 1 — Branch and shared `ReadonlyEditor`

- [x] Create branch `preview-feature` from `main`.
- [x] Extract `ReadonlyEditor` (currently inline at `packages/frontend/src/pages/FragmentImportPage.tsx` lines 63-100) into `packages/frontend/src/components/readonly-editor.tsx`. Props: `content: string`, `fontSize: number`, `maxParagraphWidth: number`.
- [x] Replace the inline definition in `FragmentImportPage.tsx` with an import. Verify the import-page preview still renders identically.
- [x] Add a short Storybook story (or matching pattern used elsewhere in the codebase) so the component has a visible reference outside the import page.
- [x] `git commit` — extract reusable read-only markdown renderer.

### Phase 2 — `@maskor/exporter` package skeleton

- [x] Create `packages/exporter/` mirroring the `packages/importer/` layout: `package.json` (`@maskor/exporter`, depends on `@maskor/shared`), `tsconfig.json`, `src/index.ts`, `src/__tests__/`.
- [x] Register the workspace in the root `bun.lock` flow (run `bun install` from repo root).
- [x] Define the structured assembly payload type in `@maskor/shared` (`AssembledSequence`): `{ sequenceUuid, sequenceName, isMain, sections: [{ uuid, name, fragments: [{ uuid, key, content }] }] }`. Plain TS type — no Zod schema needed since the exporter doesn't validate input. Note: `title` was dropped from Fragment (see migration `20260506_drop_fragment_title.sql`); `key` is the display name.
- [x] Implement `assembleSequence(sequence: SequenceInput, fragments: Fragment[]) => AssembledSequence` in `packages/exporter/src/assemble.ts`. Signature uses `Fragment[]` (has `content`) instead of `IndexedFragment[]` (no `content`). `SequenceInput` is a local structural type matching `IndexedSequence` — keeps exporter free of `@maskor/storage` dependency.
- [x] Export from `packages/exporter/src/index.ts`.
- [x] Tests in `packages/exporter/src/__tests__/assemble.test.ts`: empty sequence, single-section single-fragment, multi-section ordering, position gaps tolerated, missing fragment skipped with a warning, discarded fragment skipped.
- [x] Decision note: the package ships with `assembleSequence` only. The flat-markdown converter for file export comes in a later slice. Preview's frontend renders the structured payload directly — no flat-markdown intermediate.
- [x] `git commit` — add @maskor/exporter package with structured assembly.

### Phase 3 — `project.json` preview field

- [x] Add a `preview` sub-object to `ProjectRecord` in `packages/storage/src/registry/types.ts`.
- [x] Update the registry read/write paths to persist and read these fields. Defaults are applied when the field is absent in the file.
- [x] Extend the `updateProject` storage-service call to accept `preview` in its patch, matching the existing `editor`/`suggestion`/`advanced` pattern.
- [x] Add `preview` fields to shared `ProjectSchema` and `ProjectUpdateSchema` — propagates automatically to the API `ProjectUpdateSchema`.
- [x] No migration needed — defaults apply on the first read of a project that lacks the field.
- [x] Tests: project round-trips with and without the `preview` field; defaults applied correctly when missing.
- [x] `git commit` — add preview config to project record.

### Phase 4 — Backend preview endpoint

- [x] Add `packages/api/src/routes/preview.ts` mounting `previewRouter` (Hono + zod-openapi).
- [x] `GET /projects/:projectId/preview/:sequenceId` → returns `AssembledSequence`. Read-only, calls storageService directly (no command needed).
- [x] Handler reads fragment content individually via `storageService.fragments.read()` (not `readAll()` which returns `IndexedFragment[]` without content). Uses `Promise.allSettled` for resilience against stale-index errors.
- [x] `GET /projects/:projectId/preview` — returns the main sequence assembly directly (no redirect).
- [x] Error responses: `404` if sequence not found, `404` if project not found.
- [x] Mounted in `packages/api/src/app.ts`.
- [x] Frontend client regenerated — generates `useGetAssembledSequence` and `useGetMainAssembledSequence` hooks.
- [x] 5 tests covering happy path, 404, placed-fragment inclusion, and main preview.
- [x] `git commit` — add preview endpoint.

### Phase 5 — Frontend preview page

- [x] Add `packages/frontend/src/pages/PreviewPage/` containing `PreviewPage.tsx`, `PreviewToolbar.tsx`, `PreviewSidebar.tsx`, `PreviewProse.tsx`, and `index.ts`.
- [x] Register route `/preview` under `projectShellLayoutRoute` with `validateSearch` returning `{ sequence?: string }`.
- [x] `PreviewPage` reads `projectId` from params, `sequence` from search, uses `useGetProject` + `useListSequences` + `useGetAssembledSequence`/`useGetMainAssembledSequence`.
- [x] `PreviewToolbar`: sequence picker (hidden if single sequence), fragment titles toggle, section headings toggle (auto-hidden when no named sections), separator picker. Toggle changes call `useUpdateProject` with `preview` patch.
- [x] `PreviewSidebar`: fragments grouped by section, click scrolls via DOM ID.
- [x] `PreviewProse`: renders sections with optional h2, fragments with `id="fragment-<uuid>"` wrappers, optional h3, `ReadonlyEditor` for content, per-fragment separators.
- [x] "Preview" nav link added to `ProjectShellLayout`.
- [x] 6 tests: renders fragment keys, prose area, empty state, 404 state, sidebar scroll, toggle persistence.
- [x] `git commit` — add preview page with sequence picker, toggles, sidebar, and prose rendering.

### Phase 6 — Spec update on completion

- [x] After implementation: update `specifications/preview.md` `Shipped` frontmatter with a one-line entry pointing at this plan. Set plan status to `Done`.
- [x] Spec notes: `assembleSequence` takes `Fragment[]` (not `IndexedFragment[]`) since fragments need `content`. Fragment `title` was dropped — `key` is the display name throughout. The backend reads full fragment content per-fragment, not via `readAll()`.

---

## Open implementation decisions captured here

- **Anchors via per-fragment wrapper, not HTML-in-markdown.** The structured payload (`AssembledSequence`) lets the frontend render each fragment in its own `<div id="fragment-<uuid>">`. This avoids changes to `tiptap-markdown` (still `html: false`), keeps the exporter package free of preview-specific concerns, and removes the `includeAnchors` flag idea entirely. The exporter's job is "produce the ordered, resolved payload"; the frontend's job is "render it with the user's toggle preferences applied."
- **No flat-markdown export in this slice.** The export spec will need a function that takes `AssembledSequence` + the toggle options and produces a flat markdown string. That belongs to the export slice; preview doesn't need it.
- **Toggle changes use the project-update hook directly.** No new preview-specific endpoint. Optimistic UI keeps the experience instant; the server round-trip persists.
- **Sequence-picker hides when only one sequence exists.** Simpler UI for projects that haven't engaged with secondary sequences.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Test coverage targets for this slice:

- `@maskor/exporter`: `assembleSequence` cases (empty, single, multi-section, ordering, drift tolerance).
- `@maskor/storage`: project record round-trip with `preview` field, defaults applied when missing.
- `@maskor/api`: preview endpoint happy path, 404 on missing sequence/project.
- Frontend: `PreviewPage` rendering, sidebar scroll-to-fragment, toggle persistence via `useUpdateProject`, empty/missing states.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented. ALSO, update the relevant specs `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks here.
