# Spec: Fragment Split

**Status**: Stable
**Last updated**: 2026-07-15
**Shipped**:

- 2026-07-15 — Piece 1's key is editable in the preview. The split dialog's piece-1 row is now an editable key input like pieces 2…N (annotated "(original)" / "(original, renamed)"); editing it renames the original as part of the split. `pieceKeys` accepts `pieceIndex: 1`; a piece-1 override takes precedence over the automatic rename to a stripped heading, resubmitting the original's own key is not a collision (no rename), and the rename reuses the same cascade (file + Margin rename, `[[fragments/oldKey]]` link rewrite) and is reported via the existing `originalKeyRenamedTo` result/action-log field.
- 2026-07-15 — Strip heading on split (default). The split dialog gains a "Keep heading in the body" checkbox (heading splits only, default **off**). By default a heading that starts a piece is now stripped from that piece's body and becomes the piece's key — the heading no longer appears both as the fragment's key and at the top of its body. This includes **piece 1**: when the original's body starts with a heading, the original is renamed to that heading (the service cascades the file + Margin rename and rewrites `[[fragments/oldKey]]` links). Where piece 1 has no leading heading (leading prose), it keeps its key. The preview reflects the stripped bodies and the (possibly renamed) piece-1 key, flagging it via `renamedOriginal`. Ticking the box restores the previous behavior (headings kept in the body, original keeps its key). Wired through `keepHeadingInBody` on the split + preview requests (maps to the importer's `retainHeadingInContent`); the `fragment:split` action-log entry gains an optional `originalKeyRenamedTo`.
- 2026-07-14 — Split into a new sequence. The split dialog gains an opt-in "Add pieces to a new sequence" checkbox (default off) revealing an editable name input pre-filled with the original fragment's key. When checked, the split also creates a plain user-authored secondary sequence holding all resulting pieces in split order — piece 1 (the original) first, then pieces 2…N — in a single "Main" section (`isMain: false`, `active: true`, no `origin`, so the user can edit it afterward). The name is validated (trim, non-empty; shared `validateSequenceName` helper, also enforced command-level on sequence create/rename → 400 `SEQUENCE_NAME_INVALID`) before any write, so a blank name rejects the whole split; sequence creation runs as a Phase C follow-up, so a write failure degrades to a warning on the 200 result rather than failing the split. Folded into the single `fragment:split` action-log entry via optional `createdSequenceUuid`/`createdSequenceName` fields (no separate `sequence:created` entry). A success toast names the created sequence. (plan: references/plans/split-into-sequence.md)
- 2026-07-04 — Split partial-failure honesty. All validation (including piece-key resolution) now runs before the first write, so a rejected split leaves nothing on disk. Once the split's core writes commit (new pieces + truncated original), follow-up failures — sequence placement, Margin comment migration — no longer fail the request: they return as `warnings` on the 200 result (logged server-side) and the dialog surfaces them as warning toasts while closing as a success. A committed split can no longer surface as "Split failed". (plan: references/plans/discard-and-split-integrity.md, Phase 3)
- 2026-06-25 — Save-before-split. Invoking **Split fragment** on the open fragment now persists it first (a no-op when clean) before opening the dialog, so the preview and the commit both operate on what the user sees rather than the pre-edit vault content. Splitting a fragment with unsaved edits previously divided its stale server content and left the editor buffer diverged — the "split out of sync / claims to fail" report. A failed pre-split save aborts the split and surfaces a toast. (plan: references/plans/never-lose-writing.md, Phase 6)
- 2026-06-19 — Split dialog polish: (1) **smart delimiter auto-select** — on open the dialog requests a preview with no delimiter and the server picks one from the content (the shallowest heading level that actually splits → thematic break; never blank-line), returned as `appliedDelimiter` and used to seed the controls; falls back to a no-op heading default when nothing would split. (2) **rename pieces before committing** — the new pieces (2…N) render as editable key inputs seeded with the derived keys (piece 1 keeps the original's key, read-only); the split request carries optional `pieceKeys` overrides, validated server-side (malformed → `SplitKeyInvalidError` / 400 `SPLIT_KEY_INVALID`; collision with an existing fragment or another piece → `SplitKeyConflictError` / 400 `SPLIT_KEY_CONFLICT`) with in-modal validation for empty/duplicate/malformed keys. `detectSplitDelimiter` added to the shared `@maskor/importer` engine.
- 2026-06-18 — Split dialog no longer reports a bogus "Split failed" after a successful split. The post-split cache invalidations (refetches of the fragment list/summaries/sequences and the source fragment + Margin) were inside the same try/catch as the split mutation, so a refetch rejection surfaced as a split failure even though the split had committed server-side (observed on a `---` thematic-break split). The mutation and the best-effort invalidations are now separated: only a failed split shows the error; a refetch failure is swallowed and the dialog closes normally.
- 2026-06-13 — Identity-preserving fragment split. A fragment can be divided into multiple fragments along a chosen delimiter (heading level, thematic break, or blank-line). A dialog previews the resulting pieces (keys + excerpts + count) before committing; Confirm is disabled for a single-piece (no-op) split and a non-blocking warning appears past 10 pieces. The original keeps its identity as the first piece (UUID, key, aspects, readiness, references, sequence placements); the remaining pieces become new fragments inheriting the original's aspects + references (readiness 0), inserted immediately after it in every sequence it is placed in. Heading lines are retained in piece content so a split never drops prose, and the source prose is fully preserved across piece 1 + the new pieces. Margin comments follow their block: a comment whose block (including a heading line) moves into a new piece migrates into that piece's Margin (re-anchored), while one anchored to a block that stays in piece 1 is untouched; the orphaned-comment freeze remains as a safety net for a marker that lands in no piece. Recorded as a single non-undoable `fragment:split` action-log entry. Surfaced as "Split fragment" in the fragment editor (the open fragment) and "Split selected fragment" in Overview (the selected spine fragment). Derived keys are the heading or the first few words of the first line, with anchor markers and special symbols stripped, suffixed on collision against existing + just-minted keys. The thematic-break and blank-line delimiter modes were added to the shared `@maskor/importer` engine and are available in the import preview too.

---

## Outcome

A user working on a fragment that has grown too large can divide it into several fragments in one action. They pick a structural delimiter (a heading level, a thematic break, or a blank-line boundary), preview the resulting pieces, and confirm. The original fragment keeps its identity and becomes the first piece; the remaining pieces become new fragments slotted in right after it wherever the original is placed. This is the multi-output, self-targeting sibling of **Extract** (`specifications/` extract behavior): Extract lifts one selection into one new entity; a **fragment split** divides a whole fragment's prose into many fragments along a delimiter.

---

## Scope

### In scope

- Renaming every piece in the preview before committing — pieces 2…N choose the new fragments' keys; editing piece 1's key renames the original. Left untouched, piece 1 keeps its key unless the heading is stripped and its body starts with one (then it is renamed to that heading)
- **Stripping the heading from each piece's body** (default) so a heading becomes only the piece's key, not repeated at the top of the body; a "Keep heading in the body" toggle opts back into retaining it
- Opt-in **splitting into a new sequence**: creating a plain user-authored secondary sequence holding all resulting pieces in split order (original first, then pieces 2…N) as an ordering constraint, in the same action
- Splitting one existing vault fragment into multiple fragments along a chosen delimiter
- Delimiter types: heading level (H1–H6), thematic break (`---`), blank-line/paragraph boundary
- **Smart delimiter auto-selection** when the dialog opens: the server picks a delimiter from the content (shallowest heading level that splits → thematic break; never blank-line), which seeds the controls
- A **preview** of the resulting pieces (keys + excerpts + count) before committing; every piece's key is **editable** in the preview (piece 1 is the original — annotated as such, and flagged when it will be renamed, by an edit or to its stripped heading)
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

3. The dialog shows the resulting pieces live as the delimiter changes: each piece's key (piece 1 shows the original's — possibly heading-renamed — key; pieces 2…N show their `deriveKey`-derived key), a first-line excerpt, and the total count. Every key is editable; the split points themselves are not (no per-cut editing).
4. The preview is computed by a `split-preview` command run through the commands pipeline (`executeCommand`, empty `logEntries` — read-derivation, no action-log entry), exactly as `preview-import` is wired. It takes the `fragmentId` + delimiter config, loads the fragment, runs the shared engine, and returns the lean piece list (`pieceIndex`, `derivedKey`, excerpt) + count. It writes nothing. Unlike `preview-import` it does not assemble a full `{ markdown, sections }` document — the dialog renders a list, not a rendered manuscript.
5. If the delimiter yields a single piece (no occurrence in the body), Confirm is disabled with a "1 piece — nothing to split" message.
6. A split is always allowed regardless of piece count, but when it would produce **more than 10 fragments** the dialog shows a non-blocking warning (e.g. "This will create N fragments") so an over-aggressive blank-line split is a deliberate choice, not a surprise.

### Commit

On confirm, the split runs as one command:

- **Heading stripping (default).** By default (`keepHeadingInBody` false) a heading line that starts a piece is stripped from that piece's body — the heading becomes only the piece's key, not repeated at the top of the body. Ticking **"Keep heading in the body"** (heading splits only) retains the heading line in the body instead. The other delimiters (thematic break, blank-line) carry no heading, so the toggle does not apply to them.
- **Piece 1 is the original.** The original fragment is truncated to the first piece's content, keeping its UUID, aspects, readiness, references, unmanaged frontmatter, and all sequence placements. Its **key** is untouched too — except when the user edits piece 1's key in the preview (a `pieceKeys` override with `pieceIndex: 1`, which renames the original and takes precedence over the automatic case), or when the heading is stripped (the default) and the original's body starts with a heading: then the original is renamed to that heading's derived key. Either rename cascades through the storage service (file + Margin rename, `[[fragments/oldKey]]` link rewrite). Leading prose before the first heading has no heading to strip, so an untouched original keeps its key. A collision on the derived key is suffixed like any other; a user-chosen key that collides rejects the split (`SPLIT_KEY_CONFLICT`). The original's own old key is not a false collision (it is freed by the rename) — resubmitting it as a piece-1 override is a no-op, not a rename.
- **Pieces 2…N are new fragments.** Each is created with a `deriveKey`-derived key (heading text or first non-empty line, `_N` suffix on conflict against existing keys and keys minted earlier in the same split), with the heading stripped from its body by default. Each **inherits the original's aspects and references**; `readiness` defaults to `0`; `isDiscarded` is `false`.
- **Placement.** In every sequence/section where the original is placed, the new pieces are inserted immediately after it, in order, pushing later fragments down (composed from `placeFragment`). Where the original is unplaced, the new pieces are unplaced too.
- **Margin comments.** Each anchored comment follows its block. Comments whose block stays in piece 1 are untouched on the original's Margin. Comments whose block moves into a piece 2…N migrate into that piece's Margin and are re-anchored — the `<!--c:ID-->` marker rides along on the moved block. Margin **notes** stay on the original (they annotate the whole fragment, not a block). A comment anchored to a heading **line** follows that heading only when the heading is kept in the body; with the default heading-stripping the heading line (and any marker on it) is dropped, so such a comment freezes on the original's Margin via the orphaned-comment path. Comments anchored elsewhere in a piece's prose are unaffected by stripping. The orphaned-comment freeze remains the safety net for any marker that lands in no resulting piece.
- **Into a new sequence (opt-in).** When the user checks "Add pieces to a new sequence" and supplies a name, the split also creates a plain user-authored **secondary sequence** holding all resulting pieces in split order — piece 1 (the original) first, then pieces 2…N — in a single "Main" section. It is `isMain: false`, `active: true` (a user-requested ordering constraint, satisfied by construction since the split inserts the pieces contiguously after the original everywhere), and carries no `origin` (an origin would make it read-only per ADR 0014 — the user can edit this sequence afterward). The name is validated (trim, non-empty) before any write, so a blank name rejects the whole split. The sequence write is a follow-up (see Commit ordering below): a failure degrades to a warning on the 200 result rather than failing the committed split. This is separate from the placement of the pieces into the original's _existing_ sequences, which always happens.
- **Action log.** A single `fragment:split` entry is recorded with `{ sourceFragmentUuid, delimiter, createdCount, createdUuids }`, plus optional `createdSequenceUuid`/`createdSequenceName` when the opt-in new sequence was created and optional `originalKeyRenamedTo` when the original was renamed — to its stripped heading or a user-chosen piece-1 key (its pre-rename key is on `target.key`). Individual `fragment:created` entries are **not** emitted for the new pieces, mirroring `fragment:imported`; no separate `sequence:created` or `fragment:renamed` entry is emitted. The entry is not undoable.

### Shared engine

The split functions live in `@maskor/importer` and are shared with the import pipeline. Extending them with thematic-break and blank-line modes (currently only heading level and custom-string exist) makes those delimiters available to **both** the fragment splitter and the import flow. See `specifications/import-pipeline.md`.

---

## Constraints

- A split never loses body prose: it is fully preserved across piece 1 + the new pieces. With the default heading-stripping, each stripped heading is relocated into its piece's key rather than dropped (piece 1 → the original's key; pieces 2…N → their derived keys). The narrow exception is a heading that sanitizes to an empty key (symbols only): it derives a fallback key and its heading text is not retained — keep the heading in the body to preserve it verbatim (see `references/suggestions.md`). No source archive is written (unlike import — `specifications/import-pipeline.md`).
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
- After a split, the original fragment retains its UUID, aspects, readiness, references, and every sequence placement, with content equal to the first piece. It keeps its key too, unless the user edited piece 1's key (an explicit rename, which wins over the automatic case) or the heading is stripped (the default) and its body starts with a heading — then it is renamed and `originalKeyRenamedTo` records the new key. A piece-1 override equal to the original's key is not a rename; one colliding with an existing fragment rejects the split.
- Each new piece is a fragment carrying the original's aspects and references, `readiness: 0`, `isDiscarded: false`, and a `deriveKey`-derived key with `_N` suffixing on conflict.
- In every sequence the original was placed in, the new pieces appear in order immediately after the original; fragments that followed are pushed down. Where the original was unplaced, the new pieces are unplaced.
- A delimiter that yields a single piece disables Confirm and writes nothing.
- A split that would produce more than 10 fragments is still permitted, and the dialog surfaces a non-blocking warning of the resulting count before the user confirms.
- A successful split records exactly one non-undoable `fragment:split` action-log entry with `sourceFragmentUuid`, `delimiter`, `createdCount`, and `createdUuids`; no `fragment:created` entries are emitted for the new pieces.
- A Margin comment whose block moves into a new piece is migrated into that piece's Margin and re-anchored (the marker rides along); a comment whose block stays in piece 1 is untouched. With headings kept in the body, a heading-anchored comment follows its heading into its piece; with the default heading-stripping the heading line (and any marker on it) is dropped, so a comment anchored to a heading line freezes on the original via the orphaned-comment path. Comments anchored to prose are unaffected.
- By default a heading split strips the heading from each piece's body: each new piece's content excludes its heading line and its key is the heading's derived key; the preview reflects this and flags piece 1 with `renamedOriginal` when the original will be renamed. Ticking "Keep heading in the body" retains the heading line in every piece and leaves the original's key unchanged (unless the user edited piece 1's key).
- The "Keep heading in the body" toggle appears only for heading splits and defaults to off.
- Thematic-break and blank-line delimiters added to `@maskor/importer` are available in both the split preview and the import preview.
- With "Add pieces to a new sequence" checked and a non-empty name, the split creates a secondary sequence (`isMain: false`, `active: true`, no `origin`) with a single "Main" section holding piece 1 (the original) first then pieces 2…N in split order; omitting the option creates no sequence.
- A blank sequence name (opted in) rejects the split with nothing written; a failure of the sequence write after the split committed surfaces as a warning rather than failing the split.
- The `fragment:split` entry carries `createdSequenceUuid`/`createdSequenceName` when the new sequence was created, and no separate `sequence:created` entry is emitted.
