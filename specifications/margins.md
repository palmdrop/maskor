# Spec: Margins (fragment notes & anchored comments)

**Status**: Stable
**Last updated**: 2026-06-04

**Shipped**:

- 2026-06-04 — Margin polish (margins-4 follow-up): the raw/vim comment editor now uses the prose serif family + line-height (no monospace jump between viewing and editing); the box dimensions (1px border + padding) are reserved on every row so activating a slot changes only colour/background, not layout; the remove control floats in the left gutter (no longer offsets the comment down while editing); collapsed comments keep their line breaks (`whitespace-pre-wrap`) and clip to their **paragraph's height**, so an idle/collapsed comment — and an empty slot — adds **no** document-side spacer (the fragment reads gap-free when comments are collapsed; collapsing reconciles the offsets to zero). (plan: references/plans/margins-4.md, follow-up; ADR 0009)
- 2026-06-04 — Margin smoke-test fixes (margins-4): the Margin reads as a **seamless serif column** — static comments, notes, and both active slot editors share the prose editor's serif family and line-height (the raw/vim slot is no longer monospace), so multi-line comments keep the same vertical rhythm as their block. The column is **top-flush** (no top toolbar; the origin-alignment effect pads the margin rows down to the editor's first line, leaving the editor's own top offset at zero), with **notes and column controls at the bottom** (notes scroll past the fragment text; controls are a pinned footer). Comments render as **flowing text** — no left box/guide line; a thin **top rule** is the attachment cue (level with the bound paragraph), and a faint full border shows **only while editing**; a faint vertical separator with padding divides the fragment editor and the Margin. **Save is coupled**: the fragment editor's save persists the fragment and the Margin together (the Margin has no separate Save button), and a margin-only edit dirties the editor so it saves from there; the linked swap pair and single recovery banner are unchanged. **Type-to-create no longer remounts**: a slot renders one unified editor keyed by block index, so the first keystroke mints the marker + comment while the same editor instance keeps editing (vim mode + caret preserved). The **document stays still while you type a comment**: the document-side spacers freeze on focus and reconcile on blur, so the fragment paragraphs don't shift per keystroke. **Deletion drops the anchor only when the whole block goes**: deleting a paragraph orphans its comment (the anchor is dropped rather than collapsed onto the neighbouring block), and pasting the paragraph back re-attaches the comment by excerpt — but deleting **one line of a multi-line (soft-wrapped) paragraph** keeps the anchor bound to the surviving block (the orphan trigger is the block-end anchor's whole block collapsing, not merely its last line being engulfed). (plan: references/plans/margins-4.md, Phases 1–7; ADR 0009)
- 2026-06-03 — Buffer-clean anchoring (ADR 0009): the `<!--c:ID-->` marker no longer lives in the live editor buffer — it is stripped on load and re-emitted on save (the buffer shows pure markdown, fixing end-of-paragraph caret breakage), while remaining the durable anchor **on disk** (backend storage/DB index/export-strip/orphan detection unchanged). The live comment↔block binding is maintained by mapping each anchor's position through every editor transaction (ProseMirror plugin in rich mode; CM6 `StateField` in raw/vim), so a comment follows its block through edits and reorderings deterministically. Index+excerpt **fuzzy matching** is the recovery path only — an orphan whose excerpt still uniquely matches an un-anchored block re-anchors to it (conservative; no silent mis-binding). Crash/swap recovery restores anchors precisely (the markers travel in the mirrored content through the same strip+seed path). A line/block dot cue marks annotated lines, driven by the anchor store; the "show source" toggle is gone (no markers in the buffer to reveal). (plan: references/plans/margins-3.md, Phases 2/3/5; ADR 0009)
- 2026-06-02 — Editor-driven mutual flow alignment (ADR 0009): the fragment editor is the single source of block enumeration **and** geometry (it emits an authoritative `getBlocks()` list measured from its own DOM), so the Margin column renders one row per block and binds by marker id — eliminating the old two-index-space mismatch between the column's markdown parse and the editor's blocks. Alignment ships **both** halves: the column pads a comment shorter than its block (margin-side) and the editor injects a document-side spacer (a TipTap/CM6 decoration, never buffer text) below a block whose comment is taller, pushing the next paragraph down. Derived from natural (spacer-excluded) geometry so it converges in one pass; the notes header sits out of the scrolled flow so row 0 aligns with block 0; the two columns stay two scrollers with exact `scrollTop` mirroring. (plan: references/plans/margins-3.md, Phases 1 & 4; ADR 0009)
- 2026-06-02 — Annotated-paragraphs column: the Margin is rebuilt from a sparse comment list into a per-paragraph, scroll-synced, flow-aligned column (ADR 0008). A slot aligns to every fragment block (live from the buffer; empty slots reveal on hover); typing in an un-annotated slot conjures the marker + comment (type-to-create); binding is derived live from each marker's position (a moved paragraph carries its comment); comments pad to their block height (margin-side; longer comments clip — document-side push deferred to Phase 5); global collapsed default with focus-expand and an expand-all toggle; notes are a collapsible pinned header; margin surfaces follow the editor mode with one active editor (focused slot/notes); anchored comments show a guide line and no excerpt while orphans show their excerpt; the "Comment this block" gesture is a jump to the slot, with Tab/Escape/Enter focus keys. (plan: references/plans/margins-2.md, Phase 4; ADR 0008)
- 2026-06-02 — One comment per block (1:1 marker↔comment): the "Comment this block" gesture on a block that already carries a marker focuses the existing comment instead of injecting a second. Deleting a comment is a coordinated buffer edit — it strips that block's marker from the fragment buffer and removes the comment from the Margin buffer (each persists on its own next save); deleting an orphaned comment leaves the fragment untouched. (plan: references/plans/margins-2.md, Phase 3; ADR 0008)
- 2026-06-02 — Excerpt is the block _opening_ (capped ~80 chars, ellipsis), derived live from the marker's current block. The panel shows the live opening for anchored comments (no file churn); on fragment save each anchored comment's stored excerpt refreshes from its block's current opening and freezes once the comment is orphaned, keeping the Obsidian-visible `> excerpt` honest. Shared `deriveExcerpt`/`extractBlockOpening` helpers back both. (plan: references/plans/margins-2.md, Phase 2; ADR 0008)
- 2026-06-02 — Vim/raw anchor-marker rendering: the `<!--c:ID-->` marker is always hidden (zero-width, no gap) with a subtle line-end dot cue on annotated lines; reveal-on-cursor is gone, replaced by a per-project "show source" toggle (`editor:toggle-show-source`, default off) that reveals all raw markers verbatim. (plan: references/plans/margins-2.md, Phase 1; ADR 0008)
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
- Each comment **also stores a short excerpt** — the _opening_ of the block it annotates (capped ~80 chars). The display excerpt is derived live from the marker's current block; the stored excerpt refreshes from the block's opening on fragment save and freezes once the comment is orphaned. It is used for side-by-side display and as orphan context; it is not the authoritative anchor.
- **One comment per block.** The marker↔comment relationship is 1:1; a block carries at most one anchor. The "Comment this block" gesture, run on a block that already carries a marker, focuses the existing comment instead of injecting a second. A paragraph needing several remarks uses one multi-paragraph comment.
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

- The fragment and its Margin **save together on one explicit action** — the fragment editor's save (Save button / `:w` / `mod+s`) persists both (margins-4). The Margin has no separate Save button; a margin-only edit dirties the editor and is saved from there. No auto-save (consistent with the fragment editor; auto-save remains gated on optimistic locking). The fragment is re-written only when its prose changed; a dirty Margin is always flushed.
- The comment gesture makes **coordinated edits** in both panels: an anchor is added to the fragment editor's anchor store (ADR 0009 — not written into the buffer; it re-emits as a marker on save) and a stub into the Margin buffer. Neither is force-flushed; each persists on its own save. The fragment still dirties so the marker lands on the next fragment save.
- The fragment and Margin are a **linked swap pair**: unsaved edits to either are mirrored to `.maskor/swap/` and, on reopen, restored **together** under a single banner (the same restore/revert UX as today's per-entity swap). The pair is never restored half-and-half.
- **Transient desync self-heals**: a fragment marker with no saved comment is inert and cleanable; a comment whose marker was never saved is simply an orphaned comment. No cross-file atomic write is required.

### Side-by-side surface — the annotated-paragraphs column

The Margin reads and edits as a **per-paragraph annotated-paragraphs column** beside the fragment editor (ADR 0008), not a sparse list of discrete comments:

- **Slot per paragraph.** The column enumerates every fragment block live from the buffer and aligns a slot to each. Empty slots reveal on **hover** only, so the column stays uncluttered.
- **Type-to-create.** Typing into the slot beside an un-annotated paragraph conjures the marker + comment on the first non-empty keystroke (a coordinated buffer edit, persisted on save); an untouched slot creates nothing.
- **Live-derived binding.** Comment↔paragraph alignment is computed from each marker's current position in the buffer — never a cached ordinal — so moving a whole paragraph carries its marker and the comment follows.
- **Mutual flow alignment.** Each row is as tall as the taller of its block-slot and its comment (`rowHeight = max(block, comment)`): the column pads a comment shorter than its block (margin-side), and the editor injects a document-side spacer below a block whose comment is taller, pushing the next paragraph down so the rows below stay aligned. Both sides are derived from the editor's measured geometry (ADR 0009), so the two columns stay congruent and `scrollTop` mirroring is exact. A collapsed comment is clipped to ~3 lines; a single spacer is capped for safety. **While a slot is focused the document-side push is frozen** (margins-4): the focused comment may grow within the Margin, but the fragment paragraphs do not shift per keystroke; the spacers reconcile to the settled height on blur. Margin-side row heights still track the live comment.
- **Collapse model.** Global default collapsed (a comment clipped to its paragraph's height with ellipsis); the **focused** slot auto-expands; a **global expand-all** toggle. Defaults persist.
- **Notes** are a collapsible section at the **bottom** of the column, scrolling with the content (reached only after scrolling past the fragment text); the column **controls** sit in a pinned footer below the scroller. The column has no top toolbar, so it is flush to the editor's first line (margins-4).
- **Mode coupling, one active editor.** The margin surfaces follow the fragment editor mode; only the focused slot (or the notes field) instantiates the full vim-CM6 / TipTap editor, while every other slot renders statically in the matching style.
- **Attachment rule, no excerpt for anchored comments.** Anchored comments render as flowing text with a thin **top rule** marking the attachment to their paragraph (level with the bound paragraph's top via flow alignment) and no excerpt; a faint full border boxes a comment only while it is being edited. **Orphaned** comments show their last-known excerpt in the orphan group at the foot. (margins-4 replaced the earlier left guide line.)
- **Focus keymap.** "Comment this block" is a **jump** to the current paragraph's slot; **Tab/Shift-Tab** (and ↓/↑ at comment boundaries) move between slots; **Escape** returns the caret to the bound paragraph; **Enter** is a newline within the comment.
- **Scroll sync.** The margin column and the fragment editor scroll in lockstep.
- The pair is self-contained and reusable as a single unit (a future graph-canvas node).

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
- **The anchor marker is stripped from the live buffer and re-emitted on save (ADR 0009).** The buffer holds pure markdown; the marker is parsed out on load (its position recorded as an anchor and mapped through edits) and written back as `<!--c:ID-->` on save. In rich mode the marker round-trips through a TipTap `commentMarker` node used only as a transient load/save vehicle (a naive HTML comment would not survive markdown→ProseMirror→markdown); in raw/vim the anchor is a CM6 document offset. A dot cue (driven by the anchor store, not buffer text) marks annotated lines. (Supersedes the earlier "decoration hides the in-buffer marker / show-source toggle" treatment.)
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
- **Excerpt = the block _opening_, live-derived and frozen-on-orphan** (ADR 0008): The excerpt is the opening of the anchored block (capped ~80 chars, ellipsis), not the whole paragraph. The panel derives the _display_ excerpt live from the marker's current block in the open fragment buffer — no file churn — so it always reflects the live text. The _stored_ excerpt is refreshed from the block's current opening on each fragment save (so the Obsidian-visible `> excerpt` stays honest) and frozen at its last-known value once the comment is orphaned (its block/marker is gone). (Session 2026-06-02.)
- **Annotated-paragraphs column; margin-side padding first, document-side deferred** (ADR 0008): The Margin is a per-paragraph column flow-aligned to the editor — a slot per block, type-to-create, live binding, scroll-sync, collapse model, one active editor following the mode. Alignment is staged: margin-side padding (pad comments shorter than their block; clip longer ones) ships first; document-side padding (inject vertical space below a paragraph so a long comment pushes the next paragraph down) is the fragile half and is deferred to a later phase. (Session 2026-06-02.) **Refined by ADR 0009 (Session 2026-06-02, margins-3):** the editor — not the Margin — is the single source of block enumeration and geometry (the Margin's independent markdown parse is dropped); flow alignment ships **both** halves (margin-side + document-side padding, mutual `rowHeight = max(block, comment)`); the two columns stay two scrollers with `scrollTop` mirroring (no single physical scroller).
- **One comment per block; delete strips the marker** (ADR 0008): The marker↔comment relationship is 1:1 — no separate comment identity, no schema change, and an unambiguous "delete the comment ⇒ strip its marker." The gesture on an already-anchored block focuses the existing comment. Deleting a comment is a coordinated buffer edit (strip the marker from the fragment buffer, remove the comment from the Margin buffer; each persists on its own next save); deleting an orphaned comment is a no-op on the fragment side. We gave up "multiple comments may bind to the same block" to keep the relationship clean. (Session 2026-06-02.)
- **Orphans are never auto-deleted**: They sink to the foot of the comments section with their excerpt; only the user removes them. Loss-averse by design.
- **Fragment `notes:` attachment list dropped; vault Notes survive via links**: The old "attach a whole vault note to a fragment" model was clumsy and unhelpful. Fragment-level thinking moves into the Margin; project-scope Notes remain, surfaced via `[[document-links]]`. (Session 2026-06-01.)
- **References unchanged**: References are external sources, not the writer's thinking, so they stay an attached structured frontmatter list. Only notes-attachment is removed.
- **Lazy creation; Margin follows the fragment**: No empty margin files; rename cascades the filename; discard/delete follow the fragment. `fragmentUuid` is the stable join.
- **One coupled explicit save; linked swap pair** (margins-4, supersedes the earlier "explicit save for both" with two buttons): the fragment editor's save persists the fragment and the Margin together — the Margin has no separate Save button, and a margin-only edit dirties the editor so it saves from there. No auto-save. The fragment↔Margin pair shares one swap/restore so they never diverge across a crash/reopen.
- **Marker insert is an anchor, not a buffer edit** (ADR 0009, supersedes the earlier "marker insert is a buffer edit"): the gesture adds an anchor to the editor's anchor store rather than writing marker text into the buffer; the buffer stays pure markdown and the marker re-emits on the next fragment save. You still cannot persist just the marker without writing the whole (possibly dirty) fragment, so it lands on the next save; desync is tolerated by the orphan/cleanup model.
- **Margin defined generally over annotatable entities**: Fragment surface first; sequences/aspects/arcs plug in later by declaring their anchor unit, without model rework. (Session 2026-06-01.)
- **Anchor marker syntax is a namespaced HTML comment `<!--c:ID-->`**: Trailing the fragment block. Invisible in all rendered markdown (Obsidian preview, GitHub, export), Maskor-owned via the `c:` namespace, no collision with prose or genuine Obsidian block-refs. Maskor owns parse/serialize in both editors. Chosen over Obsidian `^block-id` (collides with real block-refs; semantically "a reference target") and `%%comment%%` (Obsidian-only, renders literally elsewhere). (Session 2026-06-01.)
- **Comment serialization: `<!--c:ID-->` + `> excerpt` + body prose**: Each comment in the Margin's comments section opens with its id-comment, then the anchored block's excerpt as a blockquote (human context, visible in Obsidian), then free-prose body, blank-line separated. The parser splits on the id-comment lines. (Session 2026-06-01.)
- **Orphan grouping is a render concern, not a file layout**: The Margin file keeps comments in authoring order. Orphan status is derived (the `<!--c:ID-->` marker is absent from the fragment); the UI groups orphans at the foot. This avoids rewriting/reordering the file every time an anchor breaks. (Session 2026-06-01.)
- **Empty Margins are not auto-removed**: A Margin is lazily created on first annotation, but once it exists it persists even when both sections are emptied — no create/delete churn, no transient-buffer deletion risk. (Session 2026-06-01.)
- **DB index is per-comment rows**: A row per comment (`fragment_uuid`, `marker_id`, excerpt, resolved/orphan flag, ordinal) plus a margin row, rather than a per-margin blob. Makes orphan detection a query and serves the future graph view without re-parsing files. Vault authoritative; watcher-rebuilt; same contract as notes/references. (Session 2026-06-01.)
- **CM6/vim marker rendering: hide + dot cue + "show source" toggle** (supersedes the earlier reveal-on-block-cursor decision — ADR 0008): A zero-width `Decoration.replace` always hides the whole `<!--c:ID-->` (no gap); a line carrying a marker gets a subtle line-end dot cue. The raw marker is never revealed by the cursor; instead a per-project "show source" toggle (`editor:toggle-show-source`, off by default) reveals all raw markers verbatim. The clutter cost of the in-body marker is paid down in the rendering, not by changing the anchor. (Session 2026-06-02; ADR 0008.) **Superseded by ADR 0009 (margins-3):** the marker no longer lives in the live editor buffer at all — it is stripped on load and re-emitted on save (the buffer shows pure markdown), so there is nothing to hide and the "show source" toggle is moot. The dot cue on annotated lines is retained but driven from the anchor model (live binding via transaction position-mapping; index+excerpt fuzzy matching only on load/external-edit recovery). The marker remains the durable anchor **on disk**.
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
- The Margin renders as a per-paragraph column beside the fragment: a slot aligns to every block, anchored comments show a guide line (no excerpt) and orphans show their excerpt; typing in an empty slot conjures a comment; the focused slot expands and a global expand-all toggle persists; the column scrolls in lockstep with the editor.
- Renaming the fragment renames the Margin file to match; discarding the fragment moves the Margin to `margins/discarded/`; deleting the fragment moves the Margin to trash.
- The fragment and its Margin restore together from swap under a single banner after an unsaved-edit crash/reopen; they are never restored one without the other.
- The anchor marker survives a round-trip in both editor modes: editing the fragment in TipTap then in vim (or vice versa) and saving preserves all anchors.
- The fragment model no longer carries a `notes:` attachment list; a fragment created via the API has no notes-attachment field.
- An inline `[[notes/foo]]` in a fragment body no longer adds `foo` to any fragment note list (the list is gone); it contributes to the link table and backlinks only. References and aspects retain their auto-sync behaviour.
- The Margin file is Obsidian-editable and round-trips: a vault → DB → vault cycle preserves notes, comment bodies, anchors, and excerpts.
- Exporting or previewing a sequence produces output with no `<!--c:ID-->` markers in it.
- In raw/vim mode the `<!--c:ID-->` marker is hidden (no gap), an annotated line shows a line-end dot cue, and the raw marker appears only when the "show source" toggle is on.
