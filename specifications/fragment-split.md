# Spec: Fragment Split

**Status**: Stable
**Last updated**: 2026-06-13
**Shipped**:

- 2026-06-19 — Split dialog polish: (1) **smart delimiter auto-select** — on open the dialog requests a preview with no delimiter and the server picks one from the content (the shallowest heading level that actually splits → thematic break; never blank-line), returned as `appliedDelimiter` and used to seed the controls; falls back to a no-op heading default when nothing would split. (2) **rename pieces before committing** — the new pieces (2…N) render as editable key inputs seeded with the derived keys (piece 1 keeps the original's key, read-only); the split request carries optional `pieceKeys` overrides, validated server-side (malformed → `SplitKeyInvalidError` / 400 `SPLIT_KEY_INVALID`; collision with an existing fragment or another piece → `SplitKeyConflictError` / 400 `SPLIT_KEY_CONFLICT`) with in-modal validation for empty/duplicate/malformed keys. `detectSplitDelimiter` added to the shared `@maskor/importer` engine.
- 2026-06-18 — Split dialog no longer reports a bogus "Split failed" after a successful split. The post-split cache invalidations (refetches of the fragment list/summaries/sequences and the source fragment + Margin) were inside the same try/catch as the split mutation, so a refetch rejection surfaced as a split failure even though the split had committed server-side (observed on a `---` thematic-break split). The mutation and the best-effort invalidations are now separated: only a failed split shows the error; a refetch failure is swallowed and the dialog closes normally.
- 2026-06-13 — Identity-preserving fragment split. A fragment can be divided into multiple fragments along a chosen delimiter (heading level, thematic break, or blank-line). A dialog previews the resulting pieces (keys + excerpts + count) before committing; Confirm is disabled for a single-piece (no-op) split and a non-blocking warning appears past 10 pieces. The original keeps its identity as the first piece (UUID, key, aspects, readiness, references, sequence placements); the remaining pieces become new fragments inheriting the original's aspects + references (readiness 0), inserted immediately after it in every sequence it is placed in. Heading lines are retained in piece content so a split never drops prose, and the source prose is fully preserved across piece 1 + the new pieces. Margin comments follow their block: a comment whose block (including a heading line) moves into a new piece migrates into that piece's Margin (re-anchored), while one anchored to a block that stays in piece 1 is untouched; the orphaned-comment freeze remains as a safety net for a marker that lands in no piece. Recorded as a single non-undoable `fragment:split` action-log entry. Surfaced as "Split fragment" in the fragment editor (the open fragment) and "Split selected fragment" in Overview (the selected spine fragment). Derived keys are the heading or the first few words of the first line, with anchor markers and special symbols stripped, suffixed on collision against existing + just-minted keys. The thematic-break and blank-line delimiter modes were added to the shared `@maskor/importer` engine and are available in the import preview too.

---

## Outcome

A user working on a fragment that has grown too large can divide it into several fragments in one action. They pick a structural delimiter (a heading level, a thematic break, or a blank-line boundary), preview the resulting pieces, and confirm. The original fragment keeps its identity and becomes the first piece; the remaining pieces become new fragments slotted in right after it wherever the original is placed. This is the multi-output, self-targeting sibling of **Extract** (`specifications/` extract behavior): Extract lifts one selection into one new entity; a **fragment split** divides a whole fragment's prose into many fragments along a delimiter.

---

## Scope

### In scope

- Renaming the new pieces (2…N) in the preview before committing; the original (piece 1) keeps its key
- Splitting one existing vault fragment into multiple fragments along a chosen delimiter
- Delimiter types: heading level (H1–H6), thematic break (`---`), blank-line/paragraph boundary
- **Smart delimiter auto-selection** when the dialog opens: the server picks a delimiter from the content (shallowest heading level that splits → thematic break; never blank-line), which seeds the controls
- A **preview** of the resulting pieces (keys + excerpts + count) before committing; the new pieces' keys are **editable** in the preview (piece 1 keeps the original's key)
- Identity-preserving semantics: the original becomes the first piece (see `references/adr/0014-identity-preserving-fragment-split.md`)
- Inserting the new pieces after the original in every sequence the original is placed in
- Surfacing the action from the fragment editor (the open fragment) and from Overview (the selected spine fragment)
- Reusing and extending the shared split engine in `@maskor/importer`

### Out of scope

- Splitting on arbitrary custom delimiter strings (the importer's plaintext path is for external `.txt`; fragment bodies split on structural markers only)
- Manual, per-cut adjustment of split points in the preview (delimiter choice only)
- Merging fragments (the inverse operation)
- Aspect-weight redistribution across pieces — new pieces inherit the original's weights verbatim; the user re-tunes afterward
- Splitting notes, references, or aspects (fragments only)

---

## Behavior

### Trigger and delimiter

1. The user invokes the split command on a fragment they are already focused on — `fragment-editor:split` ("Split fragment") for the fragment open in the editor, or `overview:split-fragment` ("Split selected fragment") for the selected fragment in the Overview spine. There is no fragment-picker variant: splitting a fragment you are not viewing is not a meaningful action.
2. A dialog opens showing a delimiter selector. The delimiter is a **type**, not a marker the user inserts: the splitter cuts at every existing occurrence of that delimiter in the fragment's body.
   - **Heading level (H1–H6)** — cut before each heading at or above the chosen level (reuses `splitMarkdown` with `retainHeadingInContent`). The heading line stays in the piece it introduces — a split never drops prose. (Import, by contrast, lifts the heading into the new entity's title and drops it from the body.)
   - **Thematic break (`---`)** — cut at each markdown horizontal rule. A `---` in the body is a thematic break, never the YAML frontmatter fence (already stripped from `content`).
   - **Blank-line / paragraph** — cut at each blank-line boundary. Aggressive for prose; offered but not the default.

### Preview

3. The dialog shows the resulting pieces live as the delimiter changes: each piece's key (piece 1 shows the original's key, which it keeps; pieces 2…N show their `deriveKey`-derived key), a first-line excerpt, and the total count. The preview is read-only — no per-cut editing.
4. The preview is computed by a `split-preview` command run through the commands pipeline (`executeCommand`, empty `logEntries` — read-derivation, no action-log entry), exactly as `preview-import` is wired. It takes the `fragmentId` + delimiter config, loads the fragment, runs the shared engine, and returns the lean piece list (`pieceIndex`, `derivedKey`, excerpt) + count. It writes nothing. Unlike `preview-import` it does not assemble a full `{ markdown, sections }` document — the dialog renders a list, not a rendered manuscript.
5. If the delimiter yields a single piece (no occurrence in the body), Confirm is disabled with a "1 piece — nothing to split" message.
6. A split is always allowed regardless of piece count, but when it would produce **more than 10 fragments** the dialog shows a non-blocking warning (e.g. "This will create N fragments") so an over-aggressive blank-line split is a deliberate choice, not a surprise.

### Commit

On confirm, the split runs as one command:

- **Piece 1 is the original.** The original fragment is truncated to the first piece's content. Its UUID, key, aspects, readiness, references, unmanaged frontmatter, and all sequence placements are untouched.
- **Pieces 2…N are new fragments.** Each is created with a `deriveKey`-derived key (heading text or first non-empty line, `_N` suffix on conflict against existing keys and keys minted earlier in the same split). Each **inherits the original's aspects and references**; `readiness` defaults to `0`; `isDiscarded` is `false`.
- **Placement.** In every sequence/section where the original is placed, the new pieces are inserted immediately after it, in order, pushing later fragments down (composed from `placeFragment`). Where the original is unplaced, the new pieces are unplaced too.
- **Margin comments.** Each anchored comment follows its block. Comments whose block stays in piece 1 are untouched on the original's Margin. Comments whose block moves into a piece 2…N migrate into that piece's Margin and are re-anchored — the `<!--c:ID-->` marker rides along on the moved block (not stripped). A comment anchored to a heading line follows that heading into whichever piece it introduces (the heading line is retained, not dropped). Margin **notes** stay on the original (they annotate the whole fragment, not a block). Because the split preserves all prose, every marker lands in some resulting piece, so the current delimiters never strand a comment. The orphaned-comment path remains as a safety net: a comment whose marker lands in no resulting piece would freeze on the original's Margin (the existing orphaned-comment behavior).
- **Action log.** A single `fragment:split` entry is recorded with `{ sourceFragmentUuid, delimiter, createdCount, createdUuids }`. Individual `fragment:created` entries are **not** emitted for the new pieces, mirroring `fragment:imported`. The entry is not undoable.

### Shared engine

The split functions live in `@maskor/importer` and are shared with the import pipeline. Extending them with thematic-break and blank-line modes (currently only heading level and custom-string exist) makes those delimiters available to **both** the fragment splitter and the import flow. See `specifications/import-pipeline.md`.

---

## Constraints

- A split never loses content: the source prose is fully preserved across piece 1 + the new pieces. No source archive is written (unlike import — `specifications/import-pipeline.md`).
- The new pieces are real, independent fragments — there is no "split" entity type and no snapshot sequence is created (unlike the import-sequence).
- Fragment identity is UUID-based; the original's UUID never changes across a split (`specifications/fragment-model.md`).
- `deriveKey`, `splitMarkdown`, `splitPlainText`, and `placeFragment` are reused — the splitter introduces no parallel split or placement logic.
- The split is a fragment operation; do not conflate with **section split** (`splitSectionAtFragment`), which divides a sequence section.

---

## Prior decisions

- **Identity-preserving split**: the original becomes the first piece rather than being replaced by N equal new fragments. Preserves UUID, placements, and links. Margin comments anchored to moved blocks migrate into the new piece's Margin (re-anchored). See `references/adr/0014-identity-preserving-fragment-split.md`.
- **One shared delimiter set**: thematic-break and blank-line modes are added to the shared `@maskor/importer` engine, so import inherits them too — rather than giving the splitter a private split module.
- **Delimiter-type, not inserted markers**: the user picks a delimiter type and the splitter cuts at existing occurrences; the user does not insert cut markers into the prose first.
- **New pieces inherit aspects + references**: treated as continuations of the original, not blank fragments; `readiness` still resets to `0` because splitting implies rework and readiness is user-controlled (`specifications/fragment-model.md`).
- **No undo, no archive**: content is fully preserved across the resulting fragments, so the single `fragment:split` log entry is non-undoable and no source bytes are archived.

---

## Open questions

- [x] 2026-06-13 — **Margin comment migration**: the target behavior is to move comments whose block lands in pieces 2…N into that piece's Margin and re-anchor them, rather than orphaning them on the original. **Resolved 2026-06-13:** shipped. A moved block keeps its `<!--c:ID-->` marker and its comment migrates into the new piece's Margin. **Amended 2026-06-13:** heading lines are now retained in piece content (a split loses no prose), so a heading-anchored comment follows its heading into its piece rather than orphaning. With all prose preserved, the current delimiters never strand a comment; the orphaned-comment path stays as a safety net for a marker that lands in no piece.
- [x] 2026-06-13 — **Blank-line split default**: blank-line/paragraph splitting is offered but aggressive. Should it be hidden behind a confirm, or carry a warning when it would produce more than some threshold of pieces? **Resolved 2026-06-13:** always allowed regardless of count; the dialog shows a non-blocking warning when the split would create more than 10 fragments.

---

## Acceptance criteria

- Splitting a fragment on a heading level produces one piece per heading occurrence, previewed (derived keys + count) before any write.
- After a split, the original fragment retains its UUID, key, aspects, readiness, references, and every sequence placement, with content equal to the first piece.
- Each new piece is a fragment carrying the original's aspects and references, `readiness: 0`, `isDiscarded: false`, and a `deriveKey`-derived key with `_N` suffixing on conflict.
- In every sequence the original was placed in, the new pieces appear in order immediately after the original; fragments that followed are pushed down. Where the original was unplaced, the new pieces are unplaced.
- A delimiter that yields a single piece disables Confirm and writes nothing.
- A split that would produce more than 10 fragments is still permitted, and the dialog surfaces a non-blocking warning of the resulting count before the user confirms.
- A successful split records exactly one non-undoable `fragment:split` action-log entry with `sourceFragmentUuid`, `delimiter`, `createdCount`, and `createdUuids`; no `fragment:created` entries are emitted for the new pieces.
- A Margin comment whose block moves into a new piece is migrated into that piece's Margin and re-anchored (the marker rides along); a comment whose block stays in piece 1 is untouched. Heading lines are retained, so a heading-anchored comment follows its heading into its piece; with all prose preserved no comment is stranded, and the orphaned-comment path (freeze on the original) remains only as a safety net for a marker that lands in no resulting piece.
- Thematic-break and blank-line delimiters added to `@maskor/importer` are available in both the split preview and the import preview.
