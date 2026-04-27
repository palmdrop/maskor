# Spec: Import Pipeline

**Status**: Stable
**Last updated**: 2026-04-26

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

- The `<vault>/pieces/` drop zone — this is a manual filesystem bypass, not part of the importer
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
4. User sees a preview: proposed pieces with titles and content, adjustable split points
5. User can merge, discard, or retitle individual pieces before confirming
6. On confirm — importer creates a Fragment for each piece via the API

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

### Piece transience

- Pieces are transient in-memory intermediaries — no UUID, no aspect properties, no frontmatter
- A piece is discarded immediately after the corresponding fragment is successfully created
- If creation fails, the error is logged and the piece is not silently dropped

---

## Constraints

- The importer is instantiated in the API server — it is not a standalone service
- The importer is called from the existing frontend; no separate UI shell

---

## Prior decisions

- **Piece is transient**: Pieces are in-memory intermediaries only. Not written to disk by the importer.
- **No metadata on import**: Pieces carry only `title` and `content`. Aspect assignment happens post-import.
- **Delimiter configured during import**: The user picks the delimiter in the import UI, not in project config.
- **Title conflict resolution**: Numeric suffix appended to avoid collisions — no error, no abort.

---

## Open questions

- [ ] 2026-04-26 — What file formats does the importer support at launch? `.docx` confirmed, `.md` confirmed. Plain `.txt`? `.rtf`?
- [ ] 2026-04-26 — What delimiter options are available? H1 only? Any heading level? Custom separator string? All of the above?
- [ ] 2026-04-26 — For folder import: are subdirectories traversed, or is it a flat folder only?
- [ ] 2026-04-26 — Should the original source file be archived somewhere in the vault after import, or silently discarded?

---

## Acceptance criteria

- A `.docx` file imported via the importer produces one piece per chosen delimiter, shown in a user-reviewable preview before any fragment is created
- A folder import produces one piece per file in the folder, shown in preview before any fragment is created
- Confirming the preview creates a Fragment for each piece; no intermediate files are written
- A title that conflicts with an existing fragment gets a numeric suffix — `fragment_1`, `fragment_2`, etc. — and is not rejected
- Creation failures are logged per-piece; the remaining pieces in the batch still proceed
- No fragment metadata is set during import; all aspect weights, notes, and references default to empty
