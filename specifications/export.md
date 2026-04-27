# Spec: Export

**Status**: Draft
**Last updated**: 2026-04-27

---

## Outcome

The user can take their main sequence and export it to a single document in a format of their choosing. They control how fragments are assembled — with or without separators, section headings, fragment titles — down to a single continuous block of text if they want. The exported file is saved to their filesystem. Maskor's job ends when the file is written. Sequences other than the main one can also be exported, but the "main" sequence is the default.

---

## Scope

### In scope

- Exporting a sequence (main sequence is the default) to a single file
- Supported output formats: Markdown (`.md`) at launch; `.txt`, `.docx`, and `.pdf` as future additions
- User-configurable assembly options:
  - Fragment separator: none, blank line, horizontal rule, page break, or custom string
  - Whether fragment titles are included as headings
  - Whether section names are included as higher-level headings
  - Whether to strip all headings and produce one continuous block of text
- Export is triggered on demand
- Output file is saved to a user-chosen path on disk

### Out of scope

- Exporting individual fragments in isolation
- Modifying fragment content during export (no rewriting, reformatting, or enrichment)
- Styled templates, themes, or typesetting for PDF or Word output
- Publishing, cloud sharing, or distributing the exported file
- Tracking or versioning export history
- Exporting project configuration, arcs, aspects, or metadata
- Images or other embedded assets in fragment content (not supported; behaviour is undefined)
- Choice of conversion tool for `.docx` and `.pdf` (not decided — out of scope for this spec)

> Export is the end of Maskor's responsibility. What the user does with the file — typesetting, publishing, further editing — is out of scope.

---

## Behavior

1. Exporting the main sequence is always possible, but Maskor will warn the user if some fragments are not part of the sequence.
2. Other sequences can be exported too, but the main sequence is the default.
3. The user selects an output format and configures assembly options.
4. Maskor assembles fragment bodies in main sequence order, section by section, applying the chosen options.
5. The assembled document is written to the user-specified output path.

### Assembly order

- Fragments are written in sequence order: sections in section order, fragments within each section in fragment order.
- If section headings are enabled, each section name is emitted as a heading before its fragments.
- If fragment titles are enabled, each fragment title is emitted as a sub-heading before its body.
- Separators (if configured) are inserted between fragments, not after the last one.

### Format conversion

- `.md`: assembled directly from fragment markdown bodies. No conversion needed.
- `.txt`: strip markdown syntax; output plain text.
- `.docx` and `.pdf`: require a conversion step. Tool choice is not decided.

### Preview

The exporter can produce a quick Markdown assembly held in server memory (no file written) and returned to the frontend for display. This doubles as the in-app preview: the frontend renders the Markdown as a read-only view before the user commits to saving a file. No separate preview pipeline is needed.

---

## Constraints

- Export is read-only. It never modifies vault files or DB state.
- Fragment content is used exactly as stored (the markdown body). No transformation beyond what is structurally necessary for the output format.
- Export lives in a dedicated `@maskor/exporter` package. It has no HTTP layer; the API calls into it.
- Export reads a sequence (most often the "main" sequence) via the API. It does not access vault files or the DB directly.
- The output path is configured by the user in the web UI (not a file system picker — a text field or default directory setting).
- Images and other embedded assets in fragment content are not supported. Output behaviour for such content is undefined.

---

## Prior decisions

- **Maskor is not a publishing tool**: Complex formatting, typesetting, and styling are the job of other software. Maskor produces clean, readable output — not a final typeset document.
- **`@maskor/exporter` package**: Export logic lives in its own package, mirroring the pattern of `@maskor/importer`. The API calls into it; the package has no HTTP layer.
- **Markdown at launch**: The first working export produces a `.md` file. Binary formats (`.docx`, `.pdf`) are deferred — they require a conversion tool that has not been chosen yet.

---

## Open questions

- [ ] 2026-04-27 — Which conversion tool should be used for `.docx` and `.pdf`? Pandoc is used by the importer but is not required here. Decide before implementing binary format support.
- [ ] 2026-04-27 — Should the output path be a plain text field in the UI, a default export directory set in project config, or both?
- [ ] 2026-04-27 — Are there metadata fields (e.g. project title, author name) that should be injected into the document header? Relevant for `.docx` and `.pdf` document properties.

---

## Acceptance criteria

- Given a main sequence with N fragments, export produces a single file containing all N fragment bodies in main sequence order.
- The export process will produce warnings if some fragments are not placed in the main sequence.
- Exporting with section headings enabled produces a section-level heading above each group of fragments.
- Exporting with fragment titles enabled produces a heading before each fragment body.
- Exporting with no separator and no headings produces a single continuous block of text with no gaps.
- The vault and DB are unchanged after a successful export.
- The preview endpoint returns an assembled Markdown string without writing any file.
- A `.docx` export produces a valid Word document that can be opened by standard Word-compatible software.
- A `.pdf` export produces a valid PDF file.
