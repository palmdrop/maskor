# Spec: Fragment Split

**Status**: Draft
**Last updated**: 2026-06-13
**Shipped**: _(none yet)_

---

## Outcome

A user working on a fragment that has grown too large can divide it into several fragments in one action. They pick a structural delimiter (a heading level, a thematic break, or a blank-line boundary), preview the resulting pieces, and confirm. The original fragment keeps its identity and becomes the first piece; the remaining pieces become new fragments slotted in right after it wherever the original is placed. This is the multi-output, self-targeting sibling of **Extract** (`specifications/` extract behavior): Extract lifts one selection into one new entity; a **fragment split** divides a whole fragment's prose into many fragments along a delimiter.

---

## Scope

### In scope

- Splitting one existing vault fragment into multiple fragments along a chosen delimiter
- Delimiter types: heading level (H1–H6), thematic break (`---`), blank-line/paragraph boundary
- A read-only **preview** of the resulting pieces (derived keys + excerpts + count) before committing
- Identity-preserving semantics: the original becomes the first piece (see `references/adr/0014-identity-preserving-fragment-split.md`)
- Inserting the new pieces after the original in every sequence the original is placed in
- Surfacing the action from the fragment editor and from Overview / the fragment list
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

1. The user invokes the split command — `fragment-editor:split` for the fragment open in the editor, or a parameterized "Split fragment…" command that picks a fragment from Overview / the fragment list.
2. A dialog opens showing a delimiter selector. The delimiter is a **type**, not a marker the user inserts: the splitter cuts at every existing occurrence of that delimiter in the fragment's body.
   - **Heading level (H1–H6)** — cut before each heading at or above the chosen level (reuses `splitMarkdown`).
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
- **Margin comments.** Anchor markers (`<!--c:ID-->`) on blocks that move into pieces 2…N are stripped from the new pieces. Comments whose block left the original follow the existing orphaned-comment path on the original's Margin. _(Migration of those comments into the new piece's Margin is a deferred phase — see Open questions.)_
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

- **Identity-preserving split**: the original becomes the first piece rather than being replaced by N equal new fragments. Preserves UUID, placements, and links at the cost of Margin-comment orphaning on moved blocks. See `references/adr/0014-identity-preserving-fragment-split.md`.
- **One shared delimiter set**: thematic-break and blank-line modes are added to the shared `@maskor/importer` engine, so import inherits them too — rather than giving the splitter a private split module.
- **Delimiter-type, not inserted markers**: the user picks a delimiter type and the splitter cuts at existing occurrences; the user does not insert cut markers into the prose first.
- **New pieces inherit aspects + references**: treated as continuations of the original, not blank fragments; `readiness` still resets to `0` because splitting implies rework and readiness is user-controlled (`specifications/fragment-model.md`).
- **No undo, no archive**: content is fully preserved across the resulting fragments, so the single `fragment:split` log entry is non-undoable and no source bytes are archived.

---

## Open questions

- [ ] 2026-06-13 — **Margin comment migration**: the target behavior is to move comments whose block lands in pieces 2…N into that piece's Margin and re-anchor them, rather than orphaning them on the original. Designed as a deferred final phase; interim behavior strips the markers and orphans the comments. When does it ship?
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
- Anchor markers on blocks moved into new pieces are stripped from those pieces; the affected comments orphan on the original's Margin (until the migration phase ships).
- Thematic-break and blank-line delimiters added to `@maskor/importer` are available in both the split preview and the import preview.
