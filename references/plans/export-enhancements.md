# Export annotations: references as footnotes, Margin as comments/footnotes

**Date**: 11-07-2026
**Status**: Done
**Closed**: 12-07-2026
**Specs**: `specifications/export.md`, `specifications/margins.md`, `specifications/references.md`

---

## Goal

Exporting a sequence can include the writer's References and Margin annotations: references render as footnotes (GFM in `.md`/`.txt`, real Word footnotes in `.docx`), Margin comments and notes render as footnotes in `.md`/`.txt` and as Word comments in `.docx`, controlled by two per-project toggles in the Export dialog (both default on), with a warning when orphaned comments are skipped.

---

## Design decisions (grill session 11-07-2026)

- **Two toggles**: `includeReferences` and `includeMarginAnnotations` (notes + comments travel together). Persisted per project in a new `export` config block. **Both default on.**
- **References**: footnote markers appended at the **end of the fragment body's last line**, in frontmatter attachment order. Footnote content = `key — body` (empty body degrades to key only). **Deduped**: one footnote definition per reference; every attaching fragment's marker points at it (md: shared label; docx: shared footnote id — repeated marks on one footnote are valid OOXML).
- **Markdown labels**: references get the slugified key (`[^mrs-dalloway]`; deterministic `-2` suffix on slug collision). Margin annotations get one shared sequential counter in document order (`[^c1]`, `[^c2]`…, notes and comments interleaved). Definitions emitted at the end of the document in first-reference order.
- **Margin comments**: md/txt — marker replaces the `<!--c:ID-->` position (end of the anchored block); content = comment **body only**, bare (no excerpt, no prefix). docx — a Word comment whose range spans the **entire anchored paragraph**.
- **Margin notes**: anchor at the fragment head — the title line when titles are shown (`### Title[^c1]` / Word comment range on the title text); the fragment's **first block** when titles are off.
- **Orphaned comments are skipped**, but the export **warns**, listing affected fragments (only when the margin toggle is on). Surfaced in the Export dialog alongside the existing warning treatment.
- **`.txt` mirrors `.md`** (txt is already byte-identical markdown today — divergence from spec logged in `references/suggestions.md`).
- **Preview untouched**: preview always assembles with annotations off; the "byte-identical for the same options" criterion holds.
- **Config asymmetry accepted**: titles/section-headings/separator stay inherited from `preview` config; the new `export` block holds only the two toggles.
- Inert markers (marker in content, no matching comment) are stripped as today. Discarded-fragment dump is not implemented; this design applies to it whenever it is built.

### docx pipeline

The assembled markdown string cannot carry Word-comment semantics, so the docx path gets a side-channel:

- References are emitted as GFM footnote syntax in the docx-bound markdown; `markdownToDocx` parses it (`micromark-extension-gfm-footnote` + `mdast-util-gfm-footnote`) and lowers footnote references/definitions to real Word footnotes (`docx` lib `footnotes` + `FootnoteReferenceRun`).
- Comment markers are **kept** in the docx-bound markdown (not stripped); notes get a synthetic marker on the title/first block. `markdownToDocx` receives a `{ markerId → comment body }` map, detects trailing inline-HTML marker nodes in each paragraph, wraps that paragraph in `CommentRangeStart`/`CommentRangeEnd` + `CommentReference`, and drops the marker node.
- md/txt never see markers (replaced by footnote refs); docx-bound markdown is an internal intermediate, never written to disk.

---

## Tasks

### Phase 1 — Config

- [x] Work happens on the existing `agent/export-enhancements` branch/worktree. (2026-07-12)
- [x] Add `export: { includeReferences: boolean, includeMarginAnnotations: boolean }` to `ProjectSchema` + `ProjectUpdateSchema` (`packages/shared/src/schemas/domain/project.ts`), defaults `true`/`true` where the manifest is loaded/normalized (missing block on existing manifests must not fail parsing). (2026-07-12)
- [x] Wire the update path (project update command/route already generic over config blocks — verified: `updateProjectCommand` passes `patch` through, API `ProjectUpdateSchema` extends the domain schema; only `registry.updateProject`'s explicit block enumeration + `CONFIG_SECTION_KEYS` needed the `export` entry). (2026-07-12)
- [x] Tests: manifest default injection, update round-trip. (2026-07-12)
- [x] Commit. (2026-07-12)

### Phase 2 — Exporter core (md/txt)

- [x] (2026-07-12) Extend the assembly input with per-fragment annotation data: attached references (`key`, `body`) and the Margin (`notes`, `comments[{ markerId, body }]`). New `assembleSequenceForExport` carrying `SequenceAnnotations`; annotations ride the body block (`BlockAnnotations`), toggles ride `AssemblyOptions`.
- [x] (2026-07-12) Footnote rendering: replace each bound `<!--c:ID-->` with its sequential `[^cN]` ref; insert the notes ref on the title line or first block; append reference refs to the body's last line; collect definitions and emit at document end. Reference label slugging (reuse `packages/shared/src/utils/slugify.ts`) + collision suffixing.
- [x] (2026-07-12) Orphan detection during assembly (margin comment whose marker is absent from the body) → returned as structured `{ fragmentKey, count }` warnings, not rendered.
- [x] (2026-07-12) Preview call sites pass annotations off; assembled output without toggles is byte-identical to today (`assembleSequence`/`assemblePieces` unchanged; verified by test).
- [x] (2026-07-12) Tests: labels + counter order, dedupe across fragments, slug collision, empty reference body, titles on/off anchor placement, orphan exclusion + warning, inert marker stripping, no-annotation byte-identity.
- [x] (2026-07-12) Commit.

### Phase 3 — Exporter docx

- [x] (2026-07-12) Add `micromark-extension-gfm-footnote` + `mdast-util-gfm-footnote` to `@maskor/exporter`; parse footnote syntax in `markdown-to-docx.ts`; lower to Word footnotes (deduped refs share one footnote id).
- [x] (2026-07-12) docx-bound assembly variant: keep comment markers, add synthetic notes markers; `markdownToDocx(markdown, { commentBodies })` wraps marked paragraphs/headings in Word comment ranges (comment author "Maskor", constant).
- [x] (2026-07-12) Tests: produced docx contains footnote part + comment part with expected text/anchors (unzip-level assertions via `jszip`).
- [x] (2026-07-12) Commit.

### Phase 4 — API

- [x] (2026-07-12) `export-sequence` command: read the `export` config block; accept per-export overrides from the request body (dialog state); when toggles on, read each fragment's Margin and resolve attached reference keys to bodies via the storage service; pass annotations into assembly; collect orphan warnings into the result. Effective toggle state added to the `sequence:exported` action-log payload.
- [x] (2026-07-12) Route: surface warnings on the binary response (JSON in an `X-Maskor-Export-Warnings` header, URI-encoded) — the response body stays a file download.
- [x] (2026-07-12) Toggle changes persist via the existing project-update route (Phase 1 wiring; exercised from the dialog in Phase 5).
- [x] (2026-07-12) Tests: command with toggles on/off, margins/references actually fetched, warnings populated + header surfaced, body override beats config, missing Margin / unresolvable reference key handled, action-log payload includes the toggle state.
- [x] (2026-07-12) Commit.

### Phase 5 — Frontend

- [x] (2026-07-12) `ExportDialog.tsx`: two checkboxes seeded from project `export` config, persisted on change via the project update mutation; export request sends the current toggle state.
- [x] (2026-07-12) Read the warnings header from the download response; show orphaned-comment warnings (fragment key + count) via a `toast.warning` — the same non-fatal treatment SplitFragmentDialog uses.
- [x] (2026-07-12) `bun run codegen` after schema/route changes.
- [x] (2026-07-12) Tests: dialog toggle rendering + persistence, export request carries toggle state, warning display. (Also fixed a Phase 1 fallout: `PreviewPage.test.tsx`'s Project mock was missing the new `export` block.)
- [x] (2026-07-12) Commit.

### Phase 6 — Docs & wrap-up

- [x] `specifications/export.md`: annotation behavior section + Shipped entry; note txt = markdown bytes reality. (2026-07-12)
- [x] `specifications/margins.md`: amend the "export strips markers" constraint (strip in preview always; in export markers are consumed to place annotations when the toggle is on) + Shipped entry. (2026-07-12)
- [x] `references/suggestions.md`: txt spec/impl divergence entry. (2026-07-12)
- [x] Check off the two items in `references/TODO.md`. (2026-07-12)
- [x] `bun run format` + `bun run verify`; fix fallout (two lint errors: an unused test helper, an inline `import()` type annotation). (2026-07-12)
- [x] Commit; set plan Status. (2026-07-12)

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Highest-risk areas: byte-identity of annotation-free assembly (preview regression), marker↔footnote replacement on bodies with multiple/adjacent markers, and docx validity with both footnotes and comments present (open the artifact in Word-compatible software at least once manually).

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, proceed on the `agent/export-enhancements` branch (already checked out in this worktree).

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
