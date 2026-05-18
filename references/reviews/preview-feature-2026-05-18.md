# Review: Preview — first slice

**Date**: 2026-05-18
**Scope**: `packages/exporter/`, `packages/api/src/routes/preview.ts`, `packages/api/src/schemas/preview.ts`, `packages/shared/src/schemas/domain/assembled-sequence.ts`, `packages/storage/src/registry/`, `packages/frontend/src/pages/PreviewPage/`, `packages/frontend/src/components/readonly-editor.tsx`
**Plan**: `references/plans/preview-feature.md`
**Spec**: `specifications/preview.md`

---

## Overall

The slice delivers the read + navigate surface as planned: project-scoped `preview` config persisted in `project.json`, a structured `AssembledSequence` payload assembled by `@maskor/exporter`, a backend `preview` router that calls storage directly (correct — read-only), and a frontend page with toolbar, sidebar, and prose. Coverage is reasonable in the storage and exporter layers; thinner on the frontend.

Two issues stand out. The optimistic-toggle path silently strands divergent state on mutation failure, and rendering one full Tiptap editor per fragment is a real perf liability for novel-sized sequences — both worth addressing before this surface gets exercised at scale.

---

## Bugs

### 1. Optimistic toggle never reconciles on mutation failure

`packages/frontend/src/pages/PreviewPage/PreviewPage.tsx:50-62` — `handlePreviewPatch` writes `localOverride` immediately, then calls `updateProject`. `localOverride` is only cleared in `onSuccess`. There is no `onError`, no rollback, and no user-visible failure.

```
user toggles → localOverride set → UI shows new state
mutation fails → onSuccess never fires → localOverride stays
all subsequent renders read stale localOverride over server state
next page load reverts (server never persisted)
```

Fix: add `onError: () => setLocalOverride({})` (or do a per-key rollback if you care about preserving other in-flight toggles), and surface the failure via a toast or inline warning. Optionally, prefer `queryClient.setQueryData(getGetProjectQueryKey(projectId), …)` over `invalidateQueries` to avoid a brief revert-then-reload window between `setLocalOverride({})` and the refetch completing.

### 2. Double-fetch + transient null render on first load

`packages/frontend/src/pages/PreviewPage/PreviewPage.tsx:39, 64-75` — when the page mounts with no `sequence` search param, `activeSequenceUuid` is `null` until `useListSequences` resolves. While `null`, `useGetMainAssembledSequence` is enabled and fires. Once sequences arrive, `activeSequenceUuid` flips to `mainSequence.uuid`, `useGetAssembledSequence` enables and fires a second request for the same content. During the swap, `assembledEnvelope` switches to `assembledEnvelopeById` whose `data` is still `undefined`, so the page returns `null` from `PreviewPage.tsx:88` — a visible flash of empty content followed by the prose.

Fix: pick one path. Either drop `useGetMainAssembledSequence` and always go through `useListSequences` → `useGetAssembledSequence(mainUuid)`, or keep the main endpoint and never switch to byId for the implicit-main case. The current dual-query design pays both costs and gets neither benefit.

---

## Design

### 3. One Tiptap editor per fragment is heavy

`packages/frontend/src/pages/PreviewPage/PreviewProse.tsx:39-53` — every fragment in the assembled payload mounts its own `ReadonlyEditor`, which instantiates a Tiptap editor with `StarterKit`, `Markdown`, and `Typography`. Each editor brings its own keyboard listeners, history stack, ProseMirror schema and `useEffect`-driven content sync (`readonly-editor.tsx:29-32`).

For a novel-sized main sequence (say, 200–500 fragments) this is hundreds of editor instances on a page whose only job is to display prose. The plan's "anchors via per-fragment wrapper" decision (preview-feature.md § Open implementation decisions) requires per-fragment `<div id="fragment-<uuid>">`, but does not require a separate editor per div — a single editor rendering the concatenated content with per-fragment marker divs would honour both the anchor contract and the perf budget.

Either accept this and document the scale at which it starts to hurt, or render fragment content via a markdown-to-HTML pipeline (e.g. `marked` or a shared markdown emitter that lands with export) into static HTML wrapped in the anchor div, reserving Tiptap for actually-editable surfaces.

### 4. Main-sequence endpoint duplicates handler glue without saving a round-trip

`packages/api/src/routes/preview.ts:35-56, 94-113` — `GET /projects/:projectId/preview` exists alongside `GET /projects/:projectId/preview/:sequenceId`. The frontend always also runs `useListSequences` (the picker needs it), so the "skip a round trip" justification doesn't hold — the main-uuid resolution happens client-side anyway. The main endpoint adds a second route, a second OpenAPI declaration, a duplicated handler, and contributes to the double-fetch in issue 2.

Worth questioning whether it earns its keep. Dropping it simplifies the API, the generated client, and the PreviewPage state machine.

### 5. Spec acceptance criterion "byte-identical markdown" is unprovable

`specifications/preview.md:156` says "Preview and export produce byte-identical assembled markdown for the same sequence and toggle state." The implementation deliberately skips markdown emission — preview renders the structured `AssembledSequence` payload directly via React (PreviewProse.tsx) and Tiptap (ReadonlyEditor.tsx). The plan acknowledges the trade-off (preview-feature.md § Open implementation decisions, "No flat-markdown export in this slice") but the spec wasn't updated to reflect it.

Either reword the criterion (e.g. "Preview and export operate on the same assembled payload from `@maskor/exporter`") or commit to building a shared markdown emitter when export lands and keep the byte-identical claim as a forward goal. Leaving it as-is means the spec contradicts the code today.

---

## Minor

### 6. Abbreviated variable names

Coding standard forbids abbreviations outside iterators and standard short forms (`references/CODING_STANDARDS.md` § Naming). Several new sites violate it:

- `packages/exporter/src/assemble.ts:22` — `fragments.map((f) => [f.uuid, f])` → `fragment`
- `packages/frontend/src/pages/PreviewPage/PreviewPage.tsx:38, 77, 91` — `sequences.find((s) => s.isMain)`, `sections.some((s) => …)`, `sections.flatMap((s) => …)` → `sequence` / `section`
- `packages/frontend/src/pages/PreviewPage/PreviewSidebar.tsx:14` — `(sum, s) => sum + s.fragments.length` → `section`
- `packages/frontend/src/pages/PreviewPage/PreviewToolbar.tsx:56, 93` — `sequences.map((seq) => …)`, `(val) => onPatch(...)` → `sequence` / `value`

### 7. `function` keyword where arrow functions are expected

Coding standard prefers arrow functions absent a specific reason (`references/CODING_STANDARDS.md` § Prefer arrow functions). New code uses the keyword form:

- `packages/exporter/src/assemble.ts:18` — `export function assembleSequence(...)`
- `packages/api/src/routes/preview.ts:58` — `async function buildAssembledSequence(...)`

### 8. Weak ReadonlyEditor assertion

`packages/frontend/src/pages/__tests__/PreviewPage.test.tsx:144-150` claims to test that fragment content renders via `ReadonlyEditor` but only checks that a `<main>` element exists. That assertion passes regardless of whether any prose rendered. Either mock the editor and assert content is passed in, or delete the test — it currently provides false confidence.

### 9. Sidebar drops the only section's name

`packages/frontend/src/pages/PreviewPage/PreviewSidebar.tsx:23` hides the section name when `sections.length === 1`. The spec (`specifications/preview.md:79`) says the sidebar "always groups by section, regardless of the section-heading prose toggle." Single-section is still grouping in structure, but the user loses the section label. Minor — but it's a small spec deviation worth noting.

### 10. Unrelated drafting changes bundled into preview commits

Commits `a94ca30` and `99dcddc` touch `references/plans/drafting-first-slice.md` and `specifications/drafting.md` (event-name dot → colon rename) alongside the preview changes. These belong on a separate commit — they're not preview work and they obscure the history of the drafting feature when it lands.

---

## Non-issues

- **Preview routes call `storageService` directly instead of going through a command.** Allowed — `packages/api/CLAUDE.md` permits direct reads for read-only routes; commands are required only for mutations.
- **`storageService.updateProject`'s `editor` type omits `fontSize`/`maxParagraphWidth`** while the registry signature includes them. Pre-existing drift from the editor-typography slice, not introduced here. Worth a separate fix.
- **No SSE stale-content indicator, no out-of-sequence badge, no "Preview this sequence" affordance from sequence editor.** All explicitly deferred per plan § Goal and spec § Out of scope.
- **`PreviewProse` renders one `ReadonlyEditor` per fragment** is also the subject of design item 3 — flagged once there, not here.
