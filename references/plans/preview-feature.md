# Preview — first slice

**Date**: 18-05-2026
**Status**: Todo
**Specs**: `specifications/preview.md`, `specifications/export.md`

---

## Goal

A user can navigate to `/projects/$projectId/preview`, see the project's main sequence rendered as continuous read-only prose, switch to any other sequence via a picker, toggle fragment titles / section headings / fragment separator from an inline toolbar (state persisted in `project.json`), and click a fragment in a sidebar to scroll the prose to that fragment. Reloading the page restores both the selected sequence (from URL) and the toggle state (from `project.json`).

> This is the read + navigate slice only. Out of this slice: stale-content SSE indicator + refresh banner, out-of-sequence badge, "Preview this sequence" affordance from the sequence editor, pre-export inspection wiring, and any of the deferred items in `specifications/preview.md` § Out of scope.

---

## Tasks

### Phase 1 — Branch and shared `ReadonlyEditor`

- [ ] Create branch `preview-feature` from `main`.
- [ ] Extract `ReadonlyEditor` (currently inline at `packages/frontend/src/pages/FragmentImportPage.tsx` lines 63-100) into `packages/frontend/src/components/readonly-editor.tsx`. Props: `content: string`, `fontSize: number`, `maxParagraphWidth: number`.
- [ ] Replace the inline definition in `FragmentImportPage.tsx` with an import. Verify the import-page preview still renders identically.
- [ ] Add a short Storybook story (or matching pattern used elsewhere in the codebase) so the component has a visible reference outside the import page.
- [ ] `git commit` — extract reusable read-only markdown renderer.

### Phase 2 — `@maskor/exporter` package skeleton

- [ ] Create `packages/exporter/` mirroring the `packages/importer/` layout: `package.json` (`@maskor/exporter`, depends on `@maskor/shared`), `tsconfig.json`, `src/index.ts`, `src/__tests__/`.
- [ ] Register the workspace in the root `bun.lock` flow (run `bun install` from repo root).
- [ ] Define the structured assembly payload type in `@maskor/shared` (`AssembledSequence`): `{ sequenceUuid, sequenceName, isMain, sections: [{ uuid, name, fragments: [{ uuid, key, title, content }] }] }`. Export from `packages/shared/src/schemas/domain/index.ts` if a Zod schema is wanted; otherwise plain TS type for now.
- [ ] Implement `assembleSequence(sequence: IndexedSequence, fragments: IndexedFragment[]) => AssembledSequence` in `packages/exporter/src/assemble.ts`. Walk sections in order, walk fragment positions in order, resolve each `fragmentUuid` against the fragments array, omit any fragment that is discarded or missing (the missing case is a structural drift that should surface as a warning — log via `Logger` if available, but do not throw; assembly is best-effort).
- [ ] Export from `packages/exporter/src/index.ts`.
- [ ] Tests in `packages/exporter/src/__tests__/assemble.test.ts`: empty sequence, single-section single-fragment, multi-section ordering, position gaps tolerated, missing fragment skipped with a warning.
- [ ] Decision note in the plan: the package ships with `assembleSequence` only. The flat-markdown converter for file export comes in a later slice. Preview's frontend renders the structured payload directly — no flat-markdown intermediate.
- [ ] `git commit` — add @maskor/exporter package with structured assembly.

### Phase 3 — `project.json` preview field

- [ ] Add a `preview` sub-object to `ProjectRecord` in `packages/storage/src/registry/types.ts`:
  ```
  preview: {
    showTitles: boolean       // default false
    showSectionHeadings: boolean  // default true
    separator: "blank-line" | "horizontal-rule" | "none"  // default "blank-line"
  }
  ```
- [ ] Update the registry read/write paths to persist and read these fields. Defaults are applied when the field is absent in the file.
- [ ] Extend the `updateProject` storage-service call (`packages/storage/src/service/storage-service.ts` line 418-430) to accept `preview` in its patch, matching the existing `editor`/`suggestion`/`advanced` pattern.
- [ ] Add `UpdateProjectBody` schema fields in `packages/api/src/schemas/` (or wherever the OpenAPI body schema lives) so the API surface accepts the new patch fields.
- [ ] No migration needed — defaults apply on the first read of a project that lacks the field.
- [ ] Tests: project round-trips with and without the `preview` field; defaults applied correctly when missing.
- [ ] `git commit` — add preview config to project record.

### Phase 4 — Backend preview endpoint

- [ ] Add `packages/api/src/routes/preview.ts` mounting `previewRouter` (Hono + zod-openapi).
- [ ] One route: `GET /api/projects/:projectId/preview/:sequenceUuid` → returns `AssembledSequence`. Per `packages/api/CLAUDE.md`, this is a read-only operation and can call `storageService` directly (no command needed).
- [ ] Handler steps: resolve project context → load sequence via `storageService.sequences.read(ctx, sequenceUuid)` → load all fragments via `storageService.fragments.readAll(ctx)` → call `assembleSequence(sequence, fragments)` from `@maskor/exporter` → return the result.
- [ ] Add a sibling helper route `GET /api/projects/:projectId/preview` that resolves the main sequence and 302-redirects to the specific route (or simply returns the main assembly — pick whichever matches existing patterns in the codebase).
- [ ] Error responses: `404` if sequence not found, `404` if project not found. No partial assembly.
- [ ] Mount the router in `packages/api/src/app.ts` (or wherever routers are wired).
- [ ] Regenerate the frontend client: from `packages/frontend`, `bun run codegen` (with the API running per `packages/frontend/CLAUDE.md`).
- [ ] Tests in `packages/api/src/__tests__/` exercising both happy path and 404 cases.
- [ ] `git commit` — add preview endpoint.

### Phase 5 — Frontend preview page

- [ ] Add `packages/frontend/src/pages/PreviewPage/` containing `PreviewPage.tsx`, `PreviewToolbar.tsx`, `PreviewSidebar.tsx`, `PreviewProse.tsx`, and an `index.ts`.
- [ ] Register the route in `packages/frontend/src/router.ts`: `path: "/preview"` under `projectShellLayoutRoute`, with `validateSearch` returning `{ sequence?: string }` (matches the overview-route pattern).
- [ ] `PreviewPage` reads `projectId` from params, `sequence` from search, fetches the project (for preview config + the `useProjectEditorConfig` typography settings), determines the active sequence UUID (search param > main sequence from `useListSequences` (or equivalent) > undefined → empty state).
- [ ] Fetch the assembled sequence via the generated hook (`usePreview…` or similar — exact name comes from codegen).
- [ ] `PreviewToolbar`:
  - Sequence picker (shadcn `Select`), hidden if only one sequence exists.
  - Three toggles: fragment titles, section headings (auto-hidden if the assembled sequence has zero named sections), separator picker.
  - Toggle changes call `useUpdateProject` (orval-generated) with a `preview` patch. On success, the project query re-fetches; the toggle state re-hydrates.
  - Optimistic local state for instant UI feedback before the server round-trip lands. Keep this minimal; the source of truth is the project record.
- [ ] `PreviewSidebar`:
  - Lists fragments grouped by section, in order.
  - Each fragment renders as a button with the fragment's title (or key as fallback). Section names are group headers.
  - Click handler: `document.getElementById('fragment-' + uuid)?.scrollIntoView({ behavior: 'instant', block: 'start' })`.
  - Sidebar always groups by section regardless of the section-heading prose toggle.
- [ ] `PreviewProse`:
  - Receives the `AssembledSequence` + current toggles + project typography.
  - Renders each section as: optional `<h2>` (if `showSectionHeadings`) with the section name, followed by the section's fragments.
  - Renders each fragment as a `<div id={'fragment-' + fragment.uuid}>` wrapper containing: optional `<h3>` (if `showTitles`) with the fragment title, followed by the markdown body rendered via `ReadonlyEditor`.
  - Between fragments within a section: a `<hr>` element for `horizontal-rule`, nothing for `none`, an empty `<div className="h-4" />` (or equivalent) for `blank-line`. Between sections, always insert a heading-level break.
  - Anchors are real DOM IDs on the wrappers — no HTML-in-markdown, no `tiptap-markdown` html flag changes, no anchor-emission flag on the exporter. The structured payload + per-fragment wrapper makes the whole problem disappear.
- [ ] Wire into project navigation: add a "Preview" item to the `ProjectShellLayout` nav (wherever the existing items like Fragments, Overview, etc. are defined) pointing at `/projects/$projectId/preview`.
- [ ] Tests: `PreviewPage` renders given a mocked assembled payload; sidebar click scrolls to the corresponding fragment; toggle changes call `useUpdateProject` with the right patch; empty sequence shows `Sequence empty.`; missing sequence (404 from preview endpoint) shows `This sequence no longer exists.`
- [ ] `git commit` — add preview page with sequence picker, toggles, sidebar, and prose rendering.

### Phase 6 — Spec update on completion

- [ ] After implementation: update `specifications/preview.md` `Shipped` frontmatter with a one-line entry pointing at this plan. Set plan status to `Done`.
- [ ] If anything in the spec turned out wrong during implementation, update the spec — don't leave stale claims.

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
