# Spec: Import Pipeline

**Status**: Stable
**Last updated**: 2026-05-31
**Shipped**:

- 2026-05-16 — Import Pipeline Stage 1 - Import .md, .txt, and .docx files into a project as fragments, splitting on headings (markdown/docx) or a custom delimiter (plaintext). Fire-and-forget: one Fragment created per piece, no review step. (plan: `scripts/ralph/archive/2026-05-16-import-pipeline-stage-1/`)
- 2026-05-16 — Import Pipeline Stage 2 - Preview and review step. After picking a .md/.txt/.docx file, the user lands on a new full-page preview that shows the converted document split into pieces, the count and derived keys of fragments-to-be-created, and live updates as heading level (md/docx) or delimiter (txt) changes. Pressing Import commits via the existing Stage 1 endpoint. Preview is read-only; per-piece edit (merge/discard/retitle/adjustable splits) remains deferred. (plan: `scripts/ralph/archive/2026-05-16-import-pipeline-stage-2/`)
- 2026-05-28 — Import action log entry. Confirming an import commits a single `fragment:imported` action-log entry with `sourceFileName`, `fragmentCount`, `format`, and `delimiter`/`headingLevel`. Individual `fragment:created` entries are not emitted for imported pieces. (plan: `scripts/ralph/archive/2026-05-28-small-improvements/`)
- 2026-05-28 — Piece removal + full-frontmatter adoption. The `pieces/` staging folder has been removed; raw `.md` dropped into `fragments/` is now the sole external-edit adoption path, and the watcher writes back a complete canonical frontmatter (uuid, updatedAt, readiness, notes, references) on first detection. (plan: `references/plans/remove-piece-concept-and-vault-warnings.md`)
- 2026-05-30 — Import preview rendering unified with sequence preview. The import-preview endpoint now returns the shared `{ markdown, sections }` shape (pieces assembled via `@maskor/exporter` into one markdown string with per-piece anchors), and the page renders through the shared read-only Tiptap renderer. Sidebar navigation scrolls via real `id="fragment-<pieceIndex>"` anchors — the old `<strong>`-text-matching `scrollToPiece` hack is gone. (plan: `references/plans/preview-import-shared-renderer.md`)
- 2026-06-19 — Import preview shows the active piece's key in its sticky header via the shared `ActiveFragmentLabel` (the same "you are here" indicator the sequence preview uses), driven by the existing scroll-spy.
- 2026-05-31 — Import preview now uses the shared `FragmentNavSidebar` + `useFragmentAnchor` hook (the inline sidebar `<aside>` and `scrollToPiece` are removed). Clicking a piece sets the `#fragment-<pieceIndex>` URL hash and scrolls; the active piece is highlighted. (Import remains reachable only via router state, so the hash is in-session navigation, not a shareable deep link.) (plan: `references/plans/preview-import-shared-renderer.md`)
- 2026-05-31 — Import-sequence + source archival. Each import now (a) archives the original uploaded file byte-for-byte under `.maskor/imports/` and (b) creates one inactive, non-main "import-sequence" recording the created fragments in their original import order, with an `origin` pointing at the archive. The import-sequence is a normal editable `Sequence`; being inactive, it does not constrain the main sequence until the user activates it. Re-importing a file of the same name is allowed but surfaces a non-blocking warning in the preview. (plan: `references/plans/import-sequence.md`)

> **Stage 1 scope note (2026-05-15):** The first implementation pass (`tasks/prd-import-pipeline-stage-1.md`) ships **fire-and-forget**: the importer splits the document and creates fragments immediately, with no user review or preview step. The review behavior described below remains the long-term target and is deferred to a later stage. Other open questions in this spec were resolved during PRD work: `.txt` is in scope, delimiter is heading-level (H1–H6) or a custom string for plain text, and folder import is out of Stage 1. (The original "source files are not archived" stance was **reversed on 2026-05-31** — see the import-sequence behavior and prior-decision notes below.)

> **Stage 2 scope note (2026-05-16):** The second implementation pass ships a **read-only preview**: after picking a file, the user sees a full-page preview of how the document will be split into pieces (with derived keys), can adjust the heading level (md/docx) or delimiter (txt), and then presses Import to commit via the existing `/import` endpoint. The preview is read-only — per-piece edit operations (merge, discard individual pieces, retitle, adjustable split points) remain deferred to a future stage.

---

## Outcome

A user can take an existing document — a Word file, a markdown file, or a folder of files — and import it into a Maskor project. The importer splits the document into pieces using a delimiter chosen by the user. The user reviews the proposed split before committing. Each confirmed piece becomes a Fragment in the vault, ready for processing in the fragment editor.

---

## Scope

### In scope

- Accepting external documents for import (`.docx`, `.md` — exact format list TBD)
- Accepting a folder of files as a collection of pieces (one piece per file, no splitting)
- User-configured delimiter, chosen during import
- User review step: inspect proposed pieces before committing
- Title conflict resolution via numeric suffix

### Out of scope

- Fragment metadata assignment during import — aspect weights, notes, and references are set post-import in the fragment editor
- OCR and image-based import
- PDF import
- Multi-vault import
- Merging fragments from another Maskor project
- Cloud or remote import sources
- Auto-commit for multi-piece documents without user review

---

## Behavior

### Single-file import

1. User selects a file and picks a delimiter (e.g. heading level)
2. Importer converts the file to markdown if needed
3. Importer splits the markdown into pieces at each delimiter occurrence
4. User sees a preview: proposed pieces with titles and content, adjustable split points _(deferred — not in Stage 1)_
5. User can merge, discard, or retitle individual pieces before confirming _(deferred — not in Stage 1)_
6. On confirm — importer creates a Fragment for each piece via the API _(Stage 1: creation is immediate after step 3, no confirmation)_

### Folder import

1. User selects a folder
2. Each file in the folder becomes one piece — no splitting; the file's content is taken as-is
3. User sees a preview of all pieces (one per file) with their derived titles
4. User can discard individual files before confirming
5. On confirm — importer creates a Fragment for each piece via the API

### Title derivation

- If the piece was split on a heading, use the heading text as title
- Otherwise, use the first non-empty line of content
- Fallback: `fragment-<uuid>`

### Title conflicts

If a fragment with the derived title already exists, a numeric suffix is appended: `fragment`, `fragment_1`, `fragment_2`, etc.

### Fragment adoption via raw file drop

A raw `.md` file dropped directly into `fragments/` is auto-adopted by the watcher on first detection:

- A UUID is minted and written back along with complete canonical frontmatter (`updatedAt`, `readiness`, `notes`, `references`)
- Any fields already present in the file (e.g. `readiness: 0.5`) are preserved; only missing fields are defaulted
- The key is derived from the filename (stem, without `.md`)
- This is the only external-edit adoption path; the `pieces/` staging folder no longer exists

### Shared split engine

The split functions (`splitMarkdown`, `splitPlainText`, `deriveKey`) in `@maskor/importer` are shared with the **fragment splitter** (`specifications/fragment-split.md`), which divides an existing vault fragment into multiple fragments along a delimiter. The fragment splitter extends this engine with **thematic-break (`---`) and blank-line** delimiter modes; those modes are consequently available in the import preview too. The engine is the single place split behavior is defined for both features. Heading-mode takes a `retainHeadingInContent` option: import leaves it **off** (the heading is lifted into the new entity's title and dropped from the body), while the fragment splitter turns it **on** (the heading line stays in the piece so a split loses no prose).

### In-memory pieces (importer only)

Within the import pipeline, the importer's internal `Piece`/`RawPiece` types represent transient in-memory split results:

- No UUID, no aspect properties, no frontmatter — purely an in-memory intermediary
- A piece is discarded immediately after the corresponding fragment is successfully created via `createFragmentCommand`
- If creation fails, the error is logged and the piece is not silently dropped

### Import-sequence and source archival

A successful import (at least one fragment created) also captures the import's order and preserves the original file:

- **Source archive.** The original uploaded file is stored byte-for-byte under `.maskor/imports/`, keyed by the import-sequence UUID. `.maskor/` is Maskor-managed and watcher-ignored, so the archived file (including binary `.docx`) is never adopted as a fragment and does not affect the all-markdown convention of the entity folders.
- **Import-sequence.** One non-main `Sequence` is created with a single section holding the created fragments in import order. It is created **inactive** (`active: false`), so it does not constrain the main sequence until the user activates it (see `sequencer.md`). Its name defaults to `Import: <fileName>` with a numeric suffix on collision. It carries an `origin` (`{ fileName, archivePath, format, importedAt }`) pointing at the archive.
- The import-sequence is a normal, editable sequence — there is no special "import" entity type. The archive, not the live sequence, is the durable snapshot of imported content (fragments drift as the user edits them).
- The main sequence is **not** seeded by import; newly created fragments remain unplaced in the main sequence's pool as before. The single `fragment:imported` action-log entry records the created `importSequenceUuid`.
- **Re-import.** Importing a file whose name matches an existing sequence's `origin.fileName` is allowed; the preview surfaces a non-blocking `priorImport` warning. A second import creates a second, separate import-sequence and archive.

---

## Constraints

- The importer is instantiated in the API server — it is not a standalone service
- The importer is called from the existing frontend; no separate UI shell

---

## Prior decisions

- **Pieces are in-memory only**: The importer's `Piece`/`RawPiece` types are transient split results; they are never written to disk. The `pieces/` staging folder has been removed; raw `.md` dropped into `fragments/` is the only external-edit adoption path and is handled entirely by the watcher.
- **No metadata on import**: Pieces carry only `title` and `content`. Aspect assignment happens post-import.
- **Delimiter configured during import**: The user picks the delimiter in the import UI, not in project config.
- **Title conflict resolution**: Numeric suffix appended to avoid collisions — no error, no abort.
- **Source is archived, not discarded (2026-05-31, reverses the 2026-05-15 decision)**: The original uploaded file is kept byte-for-byte under `.maskor/imports/` and referenced by the import-sequence's `origin`. Binary in the vault is accepted because it lives only in Maskor-managed `.maskor/`, not the user-authored entity folders. See `references/adr/0005-archive-original-import-bytes.md`.
- **Import order is captured in an inactive import-sequence**: Rather than a bespoke entity, import order is recorded as a normal non-main `Sequence` created inactive (opt-in as a constraint). See `references/adr/0004-active-gated-sequence-constraints.md`.

---

## Open questions

- [x] 2026-04-26 — What file formats does the importer support at launch? **Resolved 2026-05-15:** `.md`, `.txt`, `.docx`. `.rtf` and `.pdf` remain out of scope.
- [x] 2026-04-26 — What delimiter options are available? **Resolved 2026-05-15:** any heading level (H1–H6) for `.md` and `.docx`; arbitrary custom string for `.txt`.
- [x] 2026-04-26 — For folder import: are subdirectories traversed, or is it a flat folder only? **Resolved 2026-05-15:** Folder import is deferred entirely; not in Stage 1.
- [x] 2026-04-26 — Should the original source file be archived somewhere in the vault after import, or silently discarded? **Resolved 2026-05-15:** Discarded. ~~Archival is not in Stage 1.~~ **Re-resolved 2026-05-31:** Archived byte-for-byte under `.maskor/imports/`, referenced by the import-sequence's `origin`. (ADR-0005.)

---

## Acceptance criteria

- A `.docx` file imported via the importer produces one piece per chosen delimiter, shown in a user-reviewable preview before any fragment is created _(Stage 2: read-only preview shipped; per-piece edits — merge, discard individual pieces, retitle, adjustable split points — remain deferred)_
- A folder import produces one piece per file in the folder, shown in preview before any fragment is created _(folder import deferred — out of Stage 1 and Stage 2 entirely)_
- Confirming the preview creates a Fragment for each piece; no intermediate files are written _(Stage 2: user reviews preview then presses Import to commit; no intermediate files)_
- A title that conflicts with an existing fragment gets a numeric suffix — `fragment_1`, `fragment_2`, etc. — and is not rejected
- A successful import creates one inactive, non-main import-sequence whose section lists the created fragments in import order, with an `origin` referencing the archived original under `.maskor/imports/`
- Re-importing a file of the same name is permitted and the preview reports a `priorImport` warning; the import still proceeds
- Creation failures are logged per-piece; the remaining pieces in the batch still proceed
- No fragment metadata is set during import; all aspect weights, notes, and references default to empty
