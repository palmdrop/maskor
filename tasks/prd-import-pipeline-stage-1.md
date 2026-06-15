# PRD: Import Pipeline — Stage 1

## Introduction

Enable users to import external documents into a Maskor project as fragments. Stage 1 covers three source formats: Markdown (split on headings), plain text (split on a custom delimiter), and Word documents (.docx, split on headings). The importer splits the document into pieces and immediately creates one Fragment per piece — no intermediate review step.

**Source Specifications:**

- `specifications/import-pipeline.md`

> **Stage 1 scope cut:** The source spec mandates a user review step between split and commit. Stage 1 intentionally skips it and ships fire-and-forget. The review step is deferred to a later stage. The spec is currently out of sync with this decision and should be annotated or updated as a follow-up.

> **Terminology:** Fragments are identified by `key`, not `title`. Throughout this PRD, "key" refers to the value written to `Fragment.key` and validated via `validateEntityKey` (`/^[a-zA-Z0-9 _-]+$/`, case-insensitive collision check in storage). The importer-internal `Piece` type uses a `title` field as a transient label until it is sanitized into a key by `deriveKey`.

---

## Goals

- Users can import `.md`, `.txt`, and `.docx` files from the frontend
- Each file is split into pieces according to a user-chosen delimiter
- One Fragment is created per piece immediately on import (fire-and-forget)
- Conflicting keys are resolved automatically via numeric suffix
- Failed individual piece creations are logged but do not abort the remaining batch

---

## User Stories

### US-001: Core splitting logic in importer package

**Description:** As a developer, I need a splitting library in the `importer` package so that all format-specific parsing is isolated and testable independently of the API.

**Acceptance Criteria:**

- [ ] `packages/importer/src/index.ts` exports a `splitMarkdown(content: string, maxHeadingLevel: HeadingLevel): Piece[]` function
- [ ] `splitMarkdown` splits at any heading whose level is ≤ `maxHeadingLevel` (e.g. level 3 → split on H1, H2, H3; ignore H4–H6)
- [ ] `splitMarkdown` uses a real markdown tokenizer (mdast/micromark or equivalent) — it must NOT treat `#` lines inside fenced or indented code blocks as headings
- [ ] A piece contains the heading's body **plus all sub-headings below the split level**, verbatim as markdown
- [ ] Content before the first heading becomes a piece if non-empty (title falls through to "first non-empty content line" priority in `deriveKey`)
- [ ] `packages/importer/src/index.ts` exports a `splitPlainText(content: string, delimiter: string): Piece[]` function
- [ ] `splitPlainText` splits the content at every occurrence of the exact delimiter string
- [ ] `Piece` type is `{ title?: string; content: string }` — `title` is the raw heading text when present (markdown/docx); undefined for plaintext
- [ ] Content of each markdown piece excludes the heading line that introduced it
- [ ] For plaintext, the first non-empty line is **not** stripped — it remains in `content` even if used to derive the key later
- [ ] Empty pieces (no content after stripping the delimiter/heading) are not emitted by the splitter and are silently discarded — they are **not** reported as errors (an empty piece is nothing to import, and the user reviews the resulting fragments in the import preview before committing)
- [ ] `type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6` is defined locally in the importer package
- [ ] Unit tests cover: single heading level, mixed heading levels, heading inside fenced code block (must not split), pre-first-heading content, delimiter at start/end, delimiter not present, empty input
- [ ] Typecheck passes

### US-002: Converter interface and DOCX implementation

**Description:** As a developer, I need a `DocumentConverter` interface and a mammoth+turndown implementation of it so that the DOCX conversion backend can be swapped in the future without changing the splitting or API layer.

**Acceptance Criteria:**

- [ ] **First step:** Bun compatibility smoke test for mammoth + turndown. Install both, run a minimal `.docx` through them under `bun`, confirm the output. If turndown's DOM dependency breaks under Bun, escalate before continuing.
- [ ] `packages/importer/src/index.ts` exports a `DocumentConverter` interface: `{ toMarkdown(input: Uint8Array): Promise<string> }`
- [ ] `packages/importer/src/index.ts` exports a `MammothConverter` class that implements `DocumentConverter` using mammoth + turndown
- [ ] `MammothConverter.toMarkdown` converts Word heading styles (Heading 1–6) to the corresponding ATX markdown headings (`#`–`######`)
- [ ] Body text is preserved as plain markdown paragraphs
- [ ] **Images are stripped** in Stage 1 — configure mammoth to ignore inline images. Image/attachment support is future work.
- [ ] The `importCommand` in the API accepts a `DocumentConverter` instance as a dependency (constructor or parameter injection) — it does not instantiate `MammothConverter` itself
- [ ] Unit tests cover a minimal `.docx` fixture with at least two heading levels and body text
- [ ] Typecheck passes

### US-003: Key derivation and deduplication

**Description:** As a developer, I need a canonical key-derivation function so that every piece always gets a valid, non-conflicting fragment key.

**Acceptance Criteria:**

- [ ] `packages/importer/src/index.ts` exports a `deriveKey(piece: RawPiece, existingKeys: Set<string>): string` function where `RawPiece` is `{ headingText?: string; content: string }`
- [ ] Priority order: heading text → first non-empty line of content → `fragment-<uuid>`
- [ ] Each candidate is **sanitized** through the same rules `validateEntityKey` enforces: strip characters outside `[a-zA-Z0-9 _-]`, collapse whitespace, trim. If the sanitized result is empty, fall through to the next priority.
- [ ] Collision detection is **case-insensitive** — the `existingKeys` set stores lowercased keys; the function returns the key with original casing preserved
- [ ] If the derived key collides (case-insensitive) with `existingKeys`, append `_1`, `_2`, … until unique
- [ ] The returned key's lowercased form is added to `existingKeys` before returning (mutation, caller-managed set)
- [ ] Unit tests cover all three fallback levels, sanitization (punctuation, unicode, leading/trailing whitespace), case-insensitive collisions, and collision chains up to `_3`
- [ ] Typecheck passes

### US-004: Import API endpoint

**Description:** As a developer, I need a `POST /projects/:projectId/import` endpoint so that the frontend can send a file and receive the list of created fragment IDs.

**Acceptance Criteria:**

- [ ] Route accepts `multipart/form-data` with a `file` field (binary) plus a JSON-encoded `options` field (or equivalent form fields) whose schema is a **zod discriminated union on `format`**:
  - `{ format: "markdown"; headingLevel: 1|2|3|4|5|6 }`
  - `{ format: "docx"; headingLevel: 1|2|3|4|5|6 }`
  - `{ format: "plaintext"; delimiter: string }`
- [ ] Route is implemented via a new composite `importCommand` in `packages/api/src/commands/`; no direct storage calls in the route handler (per `packages/api/CLAUDE.md`)
- [ ] `importCommand` is a `Command<ImportInput, ImportResult>` that:
  1. Fetches existing fragment summaries and seeds the case-insensitive `existingKeys` set with **non-discarded** keys only
  2. Converts the input to markdown (if docx) or uses the raw content
  3. Calls the appropriate splitter
  4. For each piece: derives the key, builds a Fragment draft, calls `createFragmentCommand.execute(ctx, draft)`
  5. Catches per-piece errors — including storage `KEY_CONFLICT` from race conditions with concurrent writes — and appends them to `errors[]`
  6. Empty pieces (no content after split-trim) are discarded by the splitter, so they never reach the importCommand — they are neither written nor reported as errors
- [ ] Response: `{ created: FragmentUUID[]; errors: { pieceIndex: number; pieceKey?: string; error: string }[] }` — `pieceIndex` is always present (1-based position in split output); `pieceKey` is included when key derivation succeeded before the failure
- [ ] A piece that fails to create is logged and added to `errors`; remaining pieces proceed
- [ ] Per-fragment `fragment:created` log entries are emitted as normal by `createFragmentCommand`; no separate batch entry is introduced
- [ ] The endpoint is registered in the OpenAPI spec with request/response schemas; the Orval client is regenerated
- [ ] Route-level integration tests cover: markdown import, plaintext import, docx import, key collision (existing fragment with same key), partial failure (one piece fails, others succeed), empty-piece discard (produces no fragment and no error)
- [ ] Typecheck passes

### US-005: Frontend import dialog

**Description:** As a user, I want an "Import" action on the fragment list so that I can bring external documents into my project without leaving the app.

**Acceptance Criteria:**

- [ ] An "Import" button is present on `FragmentListPage`, placed next to the existing create-fragment action in the page header
- [ ] Clicking it opens a modal/dialog with: a **single-file** picker (accepts `.md`, `.txt`, `.docx`), a format-specific option field (heading level selector H1–H6 for `.md`/`.docx`, defaulting to **H1**; delimiter text input for `.txt`), and an "Import" submit button
- [ ] Selecting a `.md` or `.docx` file auto-selects the heading-level UI; selecting `.txt` auto-selects the delimiter UI
- [ ] On submit: disable the submit button, show a spinner, dialog stays open until the response arrives. This prevents double-submit; the server-side `KEY_CONFLICT` catch in US-004 is a defense-in-depth fallback.
- [ ] On success: close the dialog, invalidate the fragment-list query so the new fragments appear, show a toast/inline summary of how many fragments were created (and how many failed, if any)
- [ ] On network or validation error: re-enable submit, show an inline error message; the dialog stays open
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

## Functional Requirements

- FR-1: Splitting on heading level N must also split on all heading levels 1 through N–1
- FR-2: Heading text used as the section boundary in markdown/docx is stripped from the piece body; it becomes the raw `title` on the `Piece` (later sanitized into a `key` by `deriveKey`)
- FR-3: Plain-text delimiter string is stripped from piece content on split; empty pieces (delimiter with no content between, or markdown headings with no body) are discarded from the splitter output and are **not** reported as errors — an empty piece is nothing to import, and the user inspects the resulting fragments before committing
- FR-4: Key derivation priority: heading text → first non-empty content line → `fragment-<uuid>`, each candidate sanitized to match `validateEntityKey` rules before use
- FR-5: Duplicate key resolution: append `_1`, `_2`, … (checked **case-insensitively** against all keys already created in this import batch plus non-discarded keys in the vault)
- FR-6: Import is fire-and-forget — fragments are created immediately; no preview or confirmation step (the review step in the source spec is deferred to a later stage)
- FR-7: Per-piece failures are collected and returned in the response; they do not abort the batch. Failures include: key sanitization failures and storage `KEY_CONFLICT` from concurrent writes. (Empty pieces are not failures — they are silently discarded by the splitter.)
- FR-8: The importer package contains only pure splitting/conversion logic; it has no HTTP or storage dependencies
- FR-9: The import route accepts `multipart/form-data`; file size limits follow the existing API server / Hono / runtime configuration — no Stage 1 cap
- FR-10: All mutations go through `importCommand` in `packages/api/src/commands/`; the route handler is read-only except for invoking the command
- FR-11: Markdown splitting uses a real tokenizer and respects fenced/indented code blocks — `#` lines inside code are never treated as headings
- FR-12: For plaintext, the first non-empty line used to derive the key is not stripped from `content`

---

## Non-Goals

- No user review or preview step before fragments are created (deferred — see Stage 1 scope cut at top)
- No folder import (out of scope for Stage 1)
- No `.pdf`, `.rtf`, or `.txt` formats beyond what is listed — `.txt` is treated as plain text only
- No fragment metadata (aspect weights, notes, references) set during import
- No source file archival in the vault after import
- No undo/revert for a batch import
- No subdirectory traversal
- No multi-file selection in the import dialog
- No image/attachment extraction from DOCX (images are stripped during conversion; attachment support is future work)
- No per-project import serialization or batch locking — concurrent imports rely on the storage layer's `KEY_CONFLICT` check

---

## Technical Considerations

- **Spec divergence:** `specifications/import-pipeline.md` (marked Stable, last updated 2026-04-26) requires a review step that Stage 1 is intentionally cutting. Per the project CLAUDE.md, this must be flagged. Follow-up task: update the spec to reflect that review is deferred to a later stage, or annotate it inline.
- **Domain model — key, not title:** `Fragment.key` is the only user-visible identifier on a fragment in the current model. `validateEntityKey` restricts it to `[a-zA-Z0-9 _-]+`. The storage layer (`storage-service.ts:497-510`) does **case-insensitive** collision detection. All importer key-derivation logic must match these constraints.
- **DOCX conversion library:** Use a two-step pipeline: `mammoth` (DOCX → HTML) + `turndown` (HTML → Markdown). Mammoth maps Word heading styles (`Heading 1`–`Heading 6`) to `<h1>`–`<h6>` by default; turndown converts those to ATX markdown headings (`#`–`######`). Mammoth's own markdown output is deprecated by its maintainer — the HTML path is the supported route. Both are pure JS with no native binary dependencies. **Bun compatibility risk:** turndown uses a DOM (in Node it pulls `@mixmark-io/domino`); Bun behavior is not explicitly documented. US-002's first step is a smoke test; if it fails, escalate to consider a swap (e.g. `node-html-markdown`, or a small in-house `<h1-6>`/`<p>` mapper covering the Stage 1 surface). Pandoc is ruled out: it requires a host-installed binary, incompatible with the API-server deployment model.
- **Converter interface:** The `DocumentConverter` interface (`{ toMarkdown(input: Uint8Array): Promise<string> }`) is the designed seam for future backends (e.g. a Pandoc sidecar). Stage 1 ships one implementation (`MammothConverter`). The API server constructs and injects it — the importer package itself has no wiring logic, keeping future backend additions to a new class + a wiring change at the call site only.
- **Importer package isolation:** The `importer` package must not import from `@maskor/api` or `@maskor/storage`. The API consumes it as a pure utility.
- **Heading level type:** `type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6` lives locally in the importer package. Promote to `@maskor/shared` only if a second consumer appears.
- **Markdown tokenizer:** Required for fenced-code awareness and reliable heading detection. `mdast-util-from-markdown` / `micromark` are the natural choices; pick one and stick with it across the splitter.
- **Key deduplication scope and casing:** `importCommand` queries existing non-discarded fragment summaries before starting the batch. The set stores **lowercased** keys; collisions are checked case-insensitively to match storage. Discarded fragments are excluded so users can reuse keys of trashed work; restoring a discarded fragment whose key has since been taken will still fail at restore-time via the existing `storage-service.ts:638` check — acceptable for Stage 1.
- **Concurrency:** No serialization. Concurrent imports that derive the same final key will race; the loser receives a `KEY_CONFLICT` from `createFragmentCommand`, which `importCommand` catches and appends to `errors[]`.
- **Action log:** Per-piece `fragment:created` entries (emitted by `createFragmentCommand`) are kept. No new batch-level event type is introduced in Stage 1.
- **Frontend API client:** The frontend uses an Orval-generated client (`orval.config.ts`). Adding the new import endpoint to the OpenAPI spec will require regenerating the client.
- **File upload in Hono:** Hono supports `multipart/form-data` via `c.req.formData()`. Ensure the body parser is not restricted to JSON for the import route.
- **Request schema:** zod `discriminatedUnion("format", [...])` for the options payload, so the generated client and server validation both enforce that `headingLevel` is present for markdown/docx and `delimiter` is present for plaintext.

---

## Success Metrics

- A `.md` file with N headings at or above the chosen level produces exactly N fragments after import (modulo empty-piece discards, which are silent)
- A `.docx` file with Word heading styles produces the same result as the equivalent markdown file (images excluded)
- A `.txt` file with K delimiter occurrences produces K+1 fragments (or fewer if empty pieces are discarded)
- A key collision within a batch or against the vault resolves to a `_N`-suffixed key without error or abort
- Per-piece failures (sanitization failure, `KEY_CONFLICT` race) surface in the response without blocking the rest of the batch; empty pieces are silently discarded, not surfaced
- Headings inside fenced code blocks do not produce extra pieces

---

## Open Questions

_All previously open questions resolved during the grilling pass on 2026-05-15:_

- ~~mammoth + turndown Bun compatibility~~ → Committed to the stack; US-002 begins with a Bun smoke test as its first acceptance step. Fallback plan documented in Technical Considerations.
- ~~Heading-level default in the UI~~ → Default to **H1** on `.md`/`.docx` selection.
- ~~Max file size~~ → No Stage 1 cap; inherit Hono/runtime defaults (FR-9).
- ~~Spec out-of-sync (review step)~~ → Acknowledged at top of PRD as a Stage 1 scope cut; follow-up task to update `specifications/import-pipeline.md`.

---

## Issues found

- Import does not show action log events
-
