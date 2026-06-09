# Export feature — first iteration (Markdown / Text / Word)

**Date**: 08-06-2026
**Status**: Done
**Closed**: 09-06-2026
**Specs**: `specifications/export.md`, `specifications/preview.md`

---

## Goal

A user can open an Export modal — from the preview-page toolbar or a global "Export…" command — pick a sequence and a format (`.md`, `.txt`, or `.docx`), and receive a single assembled file as a browser download. The same bytes are archived under `.maskor/exports/` and a `sequence:exported` action-log entry is recorded. Assembly uses the project's existing preview options (titles / section headings / separator).

---

## Scope

In scope (this iteration):

- Formats: `.md`, `.txt`, `.docx`. (`.pdf` deferred — `export.md` out of scope.)
- Raw convert for `.docx`: structural mapping only (headings, paragraphs, emphasis, lists, blockquote, rule, code). No styling, themes, or page placement. User cleans up downstream.
- `.md` / `.txt`: UTF-8 bytes of the assembled markdown string, byte-identical to preview minus anchor sentinels (`includeAnchors: false`).
- Browser download + byte-for-byte archive under `.maskor/exports/`.
- One `sequence:exported` action-log entry per export.
- Assembly options inherited from `project.preview` (not re-exposed in the modal).
- Modal exposes only: sequence picker (default main / active preview sequence) + format select.

Out of scope (this iteration — tracked in `specifications/export.md`):

- Discarded-fragment dump.
- `.pdf` export.
- Page-break / custom separators in the export UI.
- Out-of-sequence warning surfaced in the export flow (preview already shows the badge).
- A configurable output path / filesystem picker (the spec's open question stays open; browser download sidesteps it).

---

## Decisions baked in

- **`docx` lib + mdast mapper** for Word. The importer's mammoth+turndown is docx→markdown only and cannot reverse. `docx` is pure-JS (no native binary), `mdast-util-from-markdown` already exists in the monorepo. Deterministic, local-first friendly.
- **Browser download AND `.maskor/exports/` archive.** Mirrors `storageService.imports.archive` (writes to `.maskor/imports/`, watcher-ignored). The endpoint returns the bytes; the frontend triggers the download; the archive is the durable record.
- **Export is a logged, state-changing operation.** Because it writes the archive, it goes through a command (`export-sequence`) per `packages/api/CLAUDE.md`, and emits a `sequence:exported` action-log entry.
- **Assembly options inherited from `project.preview`.** Export stays byte-aligned with what the user previewed; the modal stays minimal.

---

## Tasks

### Phase 0 — Branch

- [ ] Create branch `agent/export-feature` (or continue on current `agent/export`) based on this plan.

### Phase 1 — `@maskor/exporter`: Word generation + format dispatch

- [ ] Add deps to `packages/exporter/package.json`: `docx`, `mdast-util-from-markdown` (+ gfm extension `mdast-util-gfm` / `micromark-extension-gfm` if lists/strikethrough need it — confirm during impl).
- [ ] `src/markdown-to-docx.ts`: `markdownToDocx(markdown: string): Promise<Uint8Array>`. Parse markdown → mdast → `docx` `Document`/`Paragraph`/`TextRun`. Map: headings h1–h6 → `HeadingLevel`, paragraph, strong/emphasis (and nesting), unordered/ordered list, blockquote, thematicBreak, inlineCode/code. Unknown nodes fall back to their text content (raw convert — never throw).
- [ ] `src/render-export.ts`: `ExportFormat = "md" | "txt" | "docx"`; `renderExport(markdown, format): Promise<{ bytes: Uint8Array; mimeType: string; extension: string }>`. `md`/`txt` = UTF-8 of the string; `docx` = `markdownToDocx`.
- [ ] Export the new symbols from `src/index.ts`.
- [ ] Tests: docx output is a valid zip containing `word/document.xml` and the fragment text; `md`/`txt` pass the string through unchanged.

### Phase 2 — `@maskor/storage`: export archive

- [ ] Add `exports.archive(context, archiveFileName, bytes): Promise<string>` to `storage-service.ts`, mirroring `imports.archive` — writes to `.maskor/exports/`, wrapped in `withVaultWriteLock`, returns the repo-relative path.
- [ ] Test: archive writes bytes under `.maskor/exports/` and returns the relative path; `.maskor/` stays watcher-ignored.

### Phase 3 — shared: action type

- [ ] Add `sequence:exported` to `ActionTypeSchema` and a `LogEntrySchema` entry (payload: `{ sequenceName, format, fileName, archivePath, fragmentCount }`) in `packages/shared/src/schemas/domain/action.ts`. Target type `sequence`.
- [ ] Test: schema accepts a valid `sequence:exported` entry.

### Phase 4 — API: export command + route

- [ ] `src/commands/exports/export-sequence.ts`: read the sequence + fragments, `assembleSequence(..., { includeAnchors: false, ...previewOptions })`, `renderExport`, `exports.archive`, append `sequence:exported`. Returns `{ bytes, mimeType, fileName, archivePath }`.
- [ ] Export it from `src/commands/index.ts`.
- [ ] Route `POST /projects/:projectId/export/{sequenceId}` (POST — non-idempotent: writes archive + log). Body: `{ format }`. Assembly options read server-side from `project.preview`. Response: binary body with `Content-Type` + `Content-Disposition: attachment; filename=...`. Declare the response as binary in the OpenAPI schema so orval generates a Blob-returning hook. Filename: `<sequenceName>-<YYYYMMDD-HHmmss>.<ext>`.
- [ ] `bun run generate-openapi` to refresh the snapshot.
- [ ] Tests: route returns correct bytes + headers per format; archive file appears under `.maskor/exports/`; one `sequence:exported` log entry; vault/DB otherwise unchanged.

### Phase 5 — Frontend: modal + entry points

- [ ] `bun run codegen` (root) to regenerate the orval client. Verify the export hook returns a Blob; if orval mishandles the binary response, fall back to a thin typed fetch helper (note the divergence from `frontend/CLAUDE.md` and keep it isolated).
- [ ] `ExportDialog` component: sequence picker (default = active preview sequence, else main) + format select (`.md` / `.txt` / `.docx`) + Export button → call the export endpoint → trigger browser download from the returned Blob.
- [ ] Mount the dialog at a level reachable from both entry points (project-shell), opened via shared state/command.
- [ ] Global command `export…` (category `project`) opens the dialog defaulting to the main sequence — appears in the command palette.
- [ ] Preview-toolbar **Export** button → `preview:export` scope command opening the dialog preselected to the active sequence. Register in the `preview`/relevant scope barrel.
- [ ] Tests: dialog renders formats + sequences; selecting a format and confirming dispatches the export; command palette exposes `Export…`; preview toolbar button dispatches the scoped command.

### Phase 6 — Wrap-up

- [ ] `bun run format` then `bun run verify`; fix lint/test/openapi-drift.
- [ ] Update `specifications/export.md` `Shipped` frontmatter (md/txt/docx export, modal, archive, log) and `specifications/preview.md` (the toolbar export entry point — closes the "export flow (future)" note).
- [ ] Set this plan's status to `Done`.
- [ ] `git commit` per phase; final commit summarizing the feature.

---

## Open questions / risks

- **orval + binary response.** Main integration risk. If the generated hook does not return a usable Blob, fall back to a thin typed fetch helper for this one endpoint and keep it isolated.
- **gfm extension need.** Confirm whether `mdast-util-from-markdown` needs the gfm extension for the list/strikethrough cases the assembler can emit; add only if a test fails without it.
- **Filename collisions in `.maskor/exports/`.** The timestamp suffix makes collisions unlikely; if two exports land in the same second, append a numeric suffix (mirror the import archive's collision handling if present).

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Acceptance checks drawn from `specifications/export.md`:

- N fragments → one file with all N bodies in sequence order, per format.
- `.docx` opens as a valid Word document (zip with `word/document.xml`).
- `.md`/`.txt` with no separator and no headings → one continuous block.
- Export and preview assemble byte-identically for the same sequence + options (sole diff: anchor sentinels, off for export).
- Vault and DB unchanged except the `.maskor/exports/` archive and the single `sequence:exported` log entry.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`. ALSO update the relevant frontmatter of the relevant specs — add an item to the `Shipped` frontmatter with the features implemented. Do not include implementation details or granular tasks.
