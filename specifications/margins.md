# Spec: Margins (fragment notes & anchored comments)

**Status**: Stable
**Last updated**: 2026-06-01

**Shipped**:

- 2026-06-01 — Margin storage (backend): a fragment's Margin is a vault markdown file at `margins/<fragment-key>.md` (`fragmentUuid` + timestamps; `## Notes` + `## Comments` body; comments serialized as `<!--c:ID-->` + `> excerpt` + body). Lazily created, persists when emptied, follows the fragment through rename/discard/delete. Shared `<!--c:ID-->` marker build/extract/strip helpers. (plan: references/plans/margins.md, Phase 1)
- 2026-06-01 — Margin DB index, watcher sync & API (backend): per-comment DB rows + a margin row, kept in sync by rebuild and the watcher; comment orphan state derived from the fragment's markers and recomputed on fragment edits; `margin:synced`/`margin:deleted` events; API routes to read/replace a Margin, CRUD comments, and list orphaned comments. (plan: references/plans/margins.md, Phase 2)
- 2026-06-02 — Orphan handling end-to-end: the panel derives orphan state live from the open fragment buffer — a stored comment whose `<!--c:ID-->` marker is absent renders in the orphaned group (deleting the block or stripping the marker orphans it); re-adding the marker (undo / re-typing it) rebinds the comment to the anchored list. Self-healing desync confirmed: a fragment marker with no matching comment is inert (never surfaced); a comment with no marker is an orphan. (Live derivation is more responsive than the persisted backend orphan flag, which continues to serve cross-fragment/persisted queries via `listOrphanedComments`.) (plan: references/plans/margins.md, Phase 7)
- 2026-06-02 — Comment-creation gesture (fragment side): "Comment this block" is one command (`margin:comment-block`) reachable from the command palette, a `⌘⇧M` hotkey (the vim binding — intercepted before the editor, no double-trigger), and a "+ Comment" button on the Margin panel. It injects a trailing `<!--c:ID-->` marker on the fragment block at the cursor, seeds a bound comment stub in the Margin with the block excerpt, and moves focus to the Margin panel. Coordinated buffer edits only — the marker persists on the next fragment save and the stub on the next Margin save (no force-flush). (plan: references/plans/margins.md, Phase 4)
- 2026-06-02 — Side-by-side Margin panel (UI): the fragment editor renders its Margin as a self-contained panel beside the prose editor — a notes prose editor plus a linear comment list bound to fragment blocks. Comments order by block position; comments whose marker is gone render in an orphaned group at the foot with their last-known excerpt and a user-only remove. Per-section collapse toggles (notes, comments) and a global compact/expanded toggle, all persisted; clicking a comment reveals its block in the fragment editor. The Margin holds an explicit-save buffer (its own Save button / `margin:save` command), mirroring the fragment's no-auto-save model. (plan: references/plans/margins.md, Phase 6)

---

## Outcome

Every fragment can carry a **Margin** — a companion document holding the writer's own thinking about that fragment. The Margin has two parts: free-form **notes** about the whole fragment (structure, character, things to rewrite) and **comments** anchored to specific blocks of the fragment. The fragment and its Margin are read and edited **side-by-side**: comments sit beside the lines they annotate, collapse to compact markers when not in use, and expand with alignment padding when the writer wants to read them in place. This replaces the old "attach a whole vault note to a fragment" model, which was clumsy and added little.

The Margin concept is defined generally — a companion annotation document for any **annotatable entity** — so that sequences (and later aspects/arcs) can gain Margins later without reworking the model. Fragments are the first and currently only host.

---

## Scope

### In scope

- The **Margin** document: one per fragment, lazily created, two sections (notes, comments).
- **Notes section**: unanchored, whole-fragment free prose.
- **Comments section**: comments anchored to a fragment **block** (line/paragraph), each with a body and a stored excerpt.
- **Block-level anchoring**: a trailing marker written into the fragment block, plus a stored excerpt in the Margin. Anchor follows the text through edits.
- **Orphaned comments**: graceful degradation when an anchor can no longer resolve — never auto-deleted.
- **Side-by-side surface**: collapsed/expanded layout, alignment padding, per-section and global toggle; embedded beside the fragment editor and reusable as a self-contained unit.
- **Comment creation gesture**: from the fragment side (command palette / vim binding / button); injects the marker, creates the stub, moves focus to the Margin.
- **Margin lifecycle**: lazy create; rename cascade with the fragment; discard/delete follow the fragment.
- **Linked swap pair**: the fragment and its Margin share the swap/restore behaviour as a linked pair.
- **Generalised model**: Margin defined for an annotatable entity declaring its anchor unit; fragment surface ships first.
- **Removal of the fragment `notes:` attachment list** (the old per-fragment vault-note attachment).

### Out of scope

- **Word / span-level anchoring** — comments anchor to whole blocks only. Sub-block precision is deferred (better suited to a word processor).
- **Sequence Margins, aspect Margins, arc Margins** — the model supports them; no UI or anchor logic is built here.
- **Graph / canvas view** — the side-by-side pair is designed to drop into it later, but the canvas itself is out of scope.
- **Project-scope vault Notes themselves** — they continue to exist per `notes.md`; only their _fragment-attachment_ mechanism changes (handled here + in `document-links.md`).
- **References** — unchanged; references stay an attached structured frontmatter list (`attachments.md`).
- **Inline `[[document-links]]` syntax and machinery** — owned by `document-links.md`; this spec only changes the notes auto-sync consequence.
- **Comments as a linkable `[[type/key]]` target** — comments are not vault files and are not document-link targets (see ADR 0007).

---

## Behavior

### The Margin document

- A Margin is a markdown vault file at `margins/<fragment-key>.md`. Its filename stem mirrors the fragment's `key`; its frontmatter carries `fragmentUuid` (the stable join) plus Maskor-managed `createdAt`/`updatedAt`.
- The body has two sections, in order: a notes section and a comments section, separated by a fixed separator the frontend recognises (e.g. `## Notes` / `## Comments` headings). The notes section is free prose. The comments section is a sequence of comment blocks.
- A Margin is **lazily created**: no file exists until the user writes the first note or comment. Once created it **persists even when both sections are emptied** — it is not auto-removed.
- The Margin is **Obsidian-visible and human-readable**: it round-trips through external editing like any other vault document.

### Notes section

- Free-form markdown about the whole fragment. No schema, no anchoring.
- This is the home for "thoughts on structure, character, things to rewrite" — the general thinking that used to be scattered across attached vault notes.

### Comments section and anchoring

- A **comment** is bound to a single fragment **block** (a line/paragraph as the markdown/editor sees it).
- The binding is carried by a **trailing marker** written into that fragment block. The marker is the durable anchor: because it lives inside the block, it follows the text through edits, reordering, and rewrites.
- Each comment **also stores a short excerpt** of the block it annotates. The excerpt is used for side-by-side display and as orphan context; it is not the authoritative anchor.
- Multiple comments may bind to the same block.
- Because vim/markdown treats a whole paragraph as one block, a long paragraph accepts only one anchor point. This is an accepted limitation of block-level anchoring and a gentle nudge toward shorter blocks. (Revisit only if word-level anchoring is later built.)

### Orphaned comments

- A comment is **orphaned** when its anchor can no longer be resolved to a fragment block (the block was deleted, or an external edit stripped the marker).
- Orphaned comments are **never auto-deleted**. In the file they stay in authoring order; the UI groups them into an "orphaned" group at the foot of the comments section, each displaying its last-known excerpt so the writer has context. (Orphan status is derived — the `<!--c:ID-->` marker is absent from the fragment — not a stored reorder.)
- Only the user removes an orphaned comment.

### Editing model

- The Margin is edited as **one linear markdown document** in the same editor stack as fragments — rich (TipTap) mode and raw/vim (CM6) mode both.
- The notes section and comment bodies are free prose. Anchor binding is structural metadata, not hand-typed.
- A comment is **created by a gesture** from the fragment side — available via the command palette, a vim binding, and a button. The gesture:
  1. Injects/ensures a trailing marker on the fragment block at the cursor.
  2. Creates a bound comment stub in the Margin's comments section, seeded with the block excerpt.
  3. Moves focus to the Margin panel beside the fragment editor so the writer can type immediately.

### Save and swap

- The fragment and its Margin **save explicitly** (Save button / `:w`), prose-style. No auto-save (consistent with the fragment editor; auto-save remains gated on optimistic locking).
- The comment gesture makes **coordinated buffer edits** in both panels (marker into the fragment buffer, stub into the Margin buffer). Neither buffer is force-flushed; each persists on its own save.
- The fragment and Margin are a **linked swap pair**: unsaved edits to either are mirrored to `.maskor/swap/` and, on reopen, restored **together** under a single banner (the same restore/revert UX as today's per-entity swap). The pair is never restored half-and-half.
- **Transient desync self-heals**: a fragment marker with no saved comment is inert and cleanable; a comment whose marker was never saved is simply an orphaned comment. No cross-file atomic write is required.

### Side-by-side surface

- The fragment and its Margin render as a **self-contained pair**, embedded beside the fragment editor and reusable as a single unit (a future graph-canvas node).
- **Collapsed (default)**: comments are compact markers/badges beside their annotated blocks; the two columns stay tight and aligned.
- **Expanded**: the shorter side gains alignment padding so each block and its comments sit vertically beside each other ("expand sections that do not fit").
- The collapsed/expanded state is toggleable **per section** and there is a **global default-state toggle** for the Margin view.
- Scrolling the two columns stays in correspondence.

### Lifecycle coupling with the fragment

- **Rename**: renaming the fragment cascades to the Margin filename (stem follows `key`).
- **Discard**: discarding the fragment moves the Margin to `margins/discarded/<key>.md`.
- **Delete**: deleting the fragment moves the Margin to trash alongside the fragment.
- The `fragmentUuid` in frontmatter is the stable join across all of these.

### Generalisation (designed, not built)

- A Margin belongs to an **annotatable entity** that declares its **anchor unit** (the sub-part a comment binds to). A fragment's anchor unit is a **block**; a sequence's would be a **section**.
- Only fragments are wired as hosts in this iteration. The storage shape, DB index, and glossary are defined generally so sequences/aspects/arcs plug in later without migration.

### Consequence for the old notes attachment

- The fragment `notes:` frontmatter list is **removed**. Fragment-level thinking now lives in the Margin.
- Project-scope vault **Notes** still exist (`notes.md`) and are surfaced/connected via `[[document-links]]` and backlinks — not via a per-fragment attachment list.
- **References** are unchanged: they remain an attached structured frontmatter list.

---

## Constraints

- **Storage is markdown vault files; the vault is authoritative.** The DB holds a derived index of margins/comments for sync, orphan detection, and future queries (e.g. graph view).
- **Maskor may edit fragment prose as a side-effect of a user authoring a comment.** This loosens, but does not abandon, the `fragment-model.md` "never edits fragment content" rule: anchor markup is a permitted, user-initiated edit. Maskor still never rewrites fragment prose unprompted.
- **The anchor marker must survive an editor round-trip in both modes.** In CM6/vim, a decoration renders the marker subtly and reveals raw syntax only when the cursor enters it (Obsidian live-preview style); in TipTap, the marker is a node attribute with a matching serializer. A naive marker (HTML comment, bare `^id`) would not survive TipTap's markdown→ProseMirror→markdown round-trip — a custom treatment in each editor is required.
- **The Margin and fragment are a linked swap pair** built on the existing `.maskor/swap/` mechanism (`fragment-editor.md`, shipped 2026-05-19).
- **Comments are not vault files and not document-link targets** (ADR 0007).
- **Block-granular only.** No word/span anchoring in this iteration.
- **Export/preview strip markers.** The assembly path shared by `export.md` and `preview.md` must remove `<!--c:ID-->` markers from output.

---

## Prior decisions

- **Margin = one document per fragment, two sections (notes + comments)**: A single linear markdown document, not a swarm of files. Matches the writer's "flat document, some lines attached" mental model and gives one editable surface. (Session 2026-06-01.)
- **Comments are anchored Margin blocks, not files or links**: Overturns `document-links.md`'s "comments are file-based, not anchor-scoped" decision. Anchoring is the point of commenting. See ADR 0007.
- **Block-level anchoring, word-level deferred**: Word/span precision is better served by a word processor; block granularity covers structural/character/rewrite commenting and keeps the marker out of mid-text (no rendering gaps). (Session 2026-06-01.)
- **Hybrid anchor: trailing marker (durable) + stored excerpt (display/orphan)**: The marker follows the text through edits; the excerpt provides side-by-side display and orphan context. Pure fuzzy quote-matching was rejected as too brittle to the heavy editing fragments see early in life.
- **Orphans are never auto-deleted**: They sink to the foot of the comments section with their excerpt; only the user removes them. Loss-averse by design.
- **Fragment `notes:` attachment list dropped; vault Notes survive via links**: The old "attach a whole vault note to a fragment" model was clumsy and unhelpful. Fragment-level thinking moves into the Margin; project-scope Notes remain, surfaced via `[[document-links]]`. (Session 2026-06-01.)
- **References unchanged**: References are external sources, not the writer's thinking, so they stay an attached structured frontmatter list. Only notes-attachment is removed.
- **Lazy creation; Margin follows the fragment**: No empty margin files; rename cascades the filename; discard/delete follow the fragment. `fragmentUuid` is the stable join.
- **Explicit save for both; linked swap pair**: Margin saves like prose (no auto-save). The fragment↔Margin pair shares one swap/restore so they never diverge across a crash/reopen.
- **Marker insert is a buffer edit, not an instant structural write**: You cannot persist just the marker without writing the whole (possibly dirty) fragment buffer, so the marker lands on the next fragment save. Desync is tolerated by the orphan/cleanup model.
- **Margin defined generally over annotatable entities**: Fragment surface first; sequences/aspects/arcs plug in later by declaring their anchor unit, without model rework. (Session 2026-06-01.)
- **Anchor marker syntax is a namespaced HTML comment `<!--c:ID-->`**: Trailing the fragment block. Invisible in all rendered markdown (Obsidian preview, GitHub, export), Maskor-owned via the `c:` namespace, no collision with prose or genuine Obsidian block-refs. Maskor owns parse/serialize in both editors. Chosen over Obsidian `^block-id` (collides with real block-refs; semantically "a reference target") and `%%comment%%` (Obsidian-only, renders literally elsewhere). (Session 2026-06-01.)
- **Comment serialization: `<!--c:ID-->` + `> excerpt` + body prose**: Each comment in the Margin's comments section opens with its id-comment, then the anchored block's excerpt as a blockquote (human context, visible in Obsidian), then free-prose body, blank-line separated. The parser splits on the id-comment lines. (Session 2026-06-01.)
- **Orphan grouping is a render concern, not a file layout**: The Margin file keeps comments in authoring order. Orphan status is derived (the `<!--c:ID-->` marker is absent from the fragment); the UI groups orphans at the foot. This avoids rewriting/reordering the file every time an anchor breaks. (Session 2026-06-01.)
- **Empty Margins are not auto-removed**: A Margin is lazily created on first annotation, but once it exists it persists even when both sections are emptied — no create/delete churn, no transient-buffer deletion risk. (Session 2026-06-01.)
- **DB index is per-comment rows**: A row per comment (`fragment_uuid`, `marker_id`, excerpt, resolved/orphan flag, ordinal) plus a margin row, rather than a per-margin blob. Makes orphan detection a query and serves the future graph view without re-parsing files. Vault authoritative; watcher-rebuilt; same contract as notes/references. (Session 2026-06-01.)
- **CM6/vim marker rendering: hide + gutter cue + reveal-on-block-cursor**: A zero-width `Decoration.replace` hides the whole `<!--c:ID-->` (no gap); a subtle gutter dot / line-end glyph marks blocks that carry a comment; the raw marker is revealed only when the cursor enters that block (per-block, Obsidian live-preview style). The side panel does the surfacing; the in-editor cue is a quiet locator. (Session 2026-06-01.)
- **Export strips anchor markers**: Because markers live in the fragment body, the export/assembly path (`export.md`, shared with `preview.md`) must strip `<!--c:ID-->` markers from assembled output. They are already invisible in rendered markdown, but plain-text/Word/PDF assembly removes them explicitly. (Session 2026-06-01.)

---

## Open questions

- [ ] 2026-06-01 — **Sequence anchor unit**: section vs. placement when sequence Margins are eventually built. Out of scope now; flagged so the general model anticipates it.
- [x] 2026-06-01 — **Existing `notes:` migration**: how to handle fragments that already carry a `notes:` attachment list when it is removed. **Resolved (2026-06-02)**: silent drop on the next Maskor write (greenfield, no live users). The fragment mapper classifies `notes` as a managed-but-removed key, so it is excluded from `extraFrontmatter` preservation and simply not re-emitted; every other unmanaged frontmatter key survives. See `references/plans/margins.md` Phase 8 and `fragment-model.md` Prior decisions.

---

## Acceptance criteria

- Adding the first note or comment to a fragment creates `margins/<fragment-key>.md` with `fragmentUuid` in frontmatter; a fragment with no annotations has no Margin file.
- A comment created via the gesture (palette / vim / button) writes a trailing marker into the fragment block at the cursor, creates a bound comment stub in the Margin seeded with the block excerpt, and moves focus to the Margin panel.
- Editing text elsewhere in the fragment leaves an existing comment correctly anchored (the marker moves with its block).
- Deleting an annotated block (or stripping its marker externally) turns the comment into an orphan: it appears in the orphaned group at the foot of the comments section with its last-known excerpt and is not removed automatically.
- The Margin renders side-by-side with the fragment: collapsed shows compact markers aligned to blocks; expanded pads the shorter side so blocks and comments align; collapse state toggles per section and via a global default toggle.
- Renaming the fragment renames the Margin file to match; discarding the fragment moves the Margin to `margins/discarded/`; deleting the fragment moves the Margin to trash.
- The fragment and its Margin restore together from swap under a single banner after an unsaved-edit crash/reopen; they are never restored one without the other.
- The anchor marker survives a round-trip in both editor modes: editing the fragment in TipTap then in vim (or vice versa) and saving preserves all anchors.
- The fragment model no longer carries a `notes:` attachment list; a fragment created via the API has no notes-attachment field.
- An inline `[[notes/foo]]` in a fragment body no longer adds `foo` to any fragment note list (the list is gone); it contributes to the link table and backlinks only. References and aspects retain their auto-sync behaviour.
- The Margin file is Obsidian-editable and round-trips: a vault → DB → vault cycle preserves notes, comment bodies, anchors, and excerpts.
- Exporting or previewing a sequence produces output with no `<!--c:ID-->` markers in it.
- In raw/vim mode the `<!--c:ID-->` marker is hidden (no gap), an annotated block shows a gutter/line-end cue, and the raw marker appears only when the cursor enters that block.
