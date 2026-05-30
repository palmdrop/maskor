# Preview/import shared Tiptap renderer + exporter assembler core (Scope A)

**Date**: 30-05-2026
**Status**: Done
**Specs**: `specifications/preview.md`, `specifications/export.md`, `specifications/import-pipeline.md`
**Closed**: 30-05-2026 — Scope A shipped. Preview and import render through one shared read-only Tiptap renderer fed by `@maskor/exporter`'s assembled markdown; both endpoints return `{ markdown, sections }`; anchors work via exporter sentinels → `id="fragment-<id>"`; toggles apply server-side; `StaticMarkdown`/`ReadonlyEditor`/`buildPreviewMarkdown`/`scrollToPiece` removed. Novel-scale (100k+ word) live-render validation deferred — no app run in the build environment; risk + static-HTML fallback tracked in `references/suggestions.md` and the preview spec open question.

---

## Goal

> Preview and import render through **one** read-only Tiptap component fed by a complete assembled-markdown string from `@maskor/exporter`, with sidebar navigation driven by exporter-emitted anchor sentinels — `StaticMarkdown`/`dangerouslySetInnerHTML`, `ReadonlyEditor`, `buildPreviewMarkdown`, and the `<strong>`-text-matching `scrollToPiece` are all gone, and `html` stays `false` everywhere. No user-facing file export ships (Scope A).

Done = preview and import both use the shared renderer, both endpoints return `{ markdown, sections }`, anchors work via `id="fragment-<id>"`, toggles apply server-side, and `bun run verify` passes.

---

## Background

Design was settled in a grill session. Read before implementing:

- `references/adr/0003-preview-anchor-sentinels.md` — why anchors are sentinel tokens + a schema-modeled Tiptap node, not `html:true`/raw HTML.
- `specifications/preview.md` — the "Rendering refactor (2026-05-30, in progress)" note and the novel-scale open question.
- `references/suggestions.md` — novel-scale single-instance rendering risk + the static-HTML-from-same-schema fallback (deferred, do **not** build now).

Key invariants:

- The exporter stays a **pure, stateless** function — no disk I/O, no cache. Callers own I/O.
- Fragment content is assembled **verbatim** — no shifting of fragment-internal headings.
- Toggle options are passed **explicitly per request**; the server never reads `project.json`.
- Anchors are **optional** (`includeAnchors`): off for file export, on for preview/import.

---

## Tasks

### Phase 1 — Branch + exporter assembler core

- [x] Create branch `preview-import-shared-renderer` based on this plan.
- [x] Define the neutral block model in `@maskor/exporter`: an ordered list of blocks (section heading, fragment/piece title, body, separator) where each body-bearing block carries a stable `anchorId`. This model is the single source of heading levels, separator handling, and sentinel format.
- [x] Define the assembly options type as the **export superset**: separator ∈ `none | blank-line | horizontal-rule | page-break | custom-string`, plus `showTitles`, `showSectionHeadings`, `includeAnchors`. (Preview only ever passes the first three separators; the type still models all five for future file export.)
- [x] Implement `assembleMarkdown(blocks, options) → string`: section name → `##`, title → `###`, separators between bodies (not trailing), bodies emitted verbatim. When `includeAnchors`, prefix each body block with a collision-safe sentinel token encoding its `anchorId`.
- [x] Decide and document the sentinel token syntax in code: must be collision-safe against arbitrary user markdown (or escape collisions). One definition, reused by every adapter.
- [x] Refactor `assembleSequence` to map a sequence + fragments → blocks → `assembleMarkdown` (keep the existing `AssembledSequence` structure available internally for the lean nav payload; see Phase 2). Preserve existing skip rules (missing fragment, discarded fragment).
- [x] Tests: heading levels; separators (each variant, none-after-last); verbatim internal headings; anchors on/off; empty section/sequence; discarded/missing fragment skipping; sentinel collision-safety against content that resembles a sentinel.
- [x] `git commit`.

### Phase 2 — Preview API: `{ markdown, sections }` payload

- [x] Change the preview response schema (`packages/api/src/schemas/preview.ts`) to `{ markdown: string, sections: [{ uuid, name, fragments: [{ uuid, key }] }] }` — lean nav structure, **no** fragment content.
- [x] Update the preview route (`packages/api/src/routes/preview.ts`) to accept toggle options (`showTitles`, `showSectionHeadings`, `separator`) as explicit request params and call the assembler with `includeAnchors: true`. Build the lean `sections` from the sequence structure. Server must not read `project.json`.
- [x] Keep the route read-only (no writes, no action-log entries) — preserve the existing constraint.
- [x] `bun run codegen` (refresh OpenAPI snapshot + orval client).
- [x] Tests: route returns markdown + lean sections; options drive output; 404 on missing sequence; empty sequence; anchors present in markdown.
- [x] `git commit`.

### Phase 3 — Import-preview API: same core, same shape

- [x] Update the import-preview route (`packages/api/src/routes/import-preview.ts`) to map pieces → blocks (one unnamed section; `anchorId = pieceIndex`; title = `"<pieceIndex>. <derivedKey>"`; fixed presentation — `horizontal-rule` separator, titles shown, no section heading) → `assembleMarkdown` with `includeAnchors: true`.
- [x] Change the import-preview response to the same `{ markdown, sections }` shape (single section listing pieces as `{ uuid: <pieceIndex-as-string>, key: derivedKey }`). Preserve the existing piece count / conversion-error behavior.
- [x] `bun run codegen`.
- [x] Tests: import-preview returns markdown + single-section nav; anchors per piece; delimiter/heading-level changes reflected; empty/no-match cases.
- [x] `git commit`.

### Phase 4 — Shared read-only Tiptap renderer

- [x] Extract a shared Tiptap config module: the extension list (`StarterKit` + `Markdown({ html: false })` + `Typography`) and the `prose` class string, consumed by both the editable `ProseEditor` and the new read-only renderer so they cannot drift. Refactor `ProseEditor` to import from it (no behavior change).
- [x] Implement the anchor mechanism: a custom markdown-it rule recognizing the sentinel + a schema-modeled, invisible Tiptap anchor node rendering `id="fragment-<id>"`. `html` stays `false`.
- [x] Build the read-only renderer: one Tiptap instance, `editable: false`, no toolbar/vim/raw/cursor/command machinery, shares the config module + the anchor extension, applies font-size/paragraph-width settings (settings parity with `ProseEditor`, not full-shell reuse).
- [x] Tests: renders markdown; anchor sentinel produces `id="fragment-<id>"` in the DOM and does not render visible text; `html:false` escapes raw HTML in content.
- [x] `git commit`.

### Phase 5 — Rewire preview + import pages, delete dead code

- [x] `PreviewPage`/`PreviewProse`: consume `{ markdown, sections }`; render markdown via the shared renderer; move toggles to refetch (options sent to the endpoint) instead of JSX-applied presentation; sidebar scrolls via `getElementById('fragment-<uuid>')` (already the case in `PreviewSidebar`).
- [x] `FragmentImportPage`: consume `{ markdown, sections }`; render via the shared renderer; replace `scrollToPiece` `<strong>`-matching with `getElementById('fragment-<pieceIndex>')`.
- [x] Delete `StaticMarkdown`, `ReadonlyEditor`, `buildPreviewMarkdown`, and the old `scrollToPiece` text-matching helper. Confirm no remaining importers.
- [x] Tests: preview toggles refetch and re-render; sidebar click scrolls to anchor; import sidebar click scrolls to piece anchor; no `dangerouslySetInnerHTML` remains in these surfaces.
- [x] `git commit`.

### Phase 6 — Docs + verify

- [x] Update `specifications/preview.md`: reconcile Assembly/Constraints/Prior-decisions/Acceptance with the shipped reality (markdown-string payload, shared Tiptap renderer, sentinel anchors); add to `Shipped`. Resolve the now-outdated `StaticMarkdown` constraint.
- [x] Update `specifications/export.md` `Shipped`: the `@maskor/exporter` markdown assembler core landed (no file-export UI).
- [x] Note in `specifications/import-pipeline.md` that import preview now renders via the shared renderer with real anchors (scrollToPiece hack removed).
- [x] Regenerate `references/CODEBASE_SNAPSHOT.md` via `bun run snapshot` if symbols moved.
- [x] `bun run verify` — fix any type/test/openapi-drift failures before stopping.
- [x] `git commit`.

---

## Out of scope

- User-facing file export (format picker, output path, write/download, discarded-fragment dump) — separate work; open questions remain in `specifications/export.md`.
- Novel-scale rendering optimization (static HTML from the same Tiptap schema) — deferred; tracked in `references/suggestions.md` and the preview spec open question. Validate rendering at 100k+ words during Phase 5 but only switch if it stutters.
- Import per-piece edit operations (merge/discard/retitle) — already deferred in `import-pipeline.md`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Particular attention: assembler-core unit tests (the single source of assembly truth), sentinel collision-safety, anchor node rendering (`id` present, no visible text, `html:false` still escapes), and toggle-driven refetch on the preview page.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`. ALSO update the relevant frontmatter of the relevant specs — add an item to the `Shipped` property with the features implemented. Do not include implementation details or granular tasks.

Run `bun run codegen` after any API route/schema change; run `bun run verify` before stopping.
