# Glossary

Maskor is a fragment-based creative writing tool. Writers compose by drafting, arranging, and sequencing fragments — discrete units of text — into arcs and exports.

## Language

**Fragment**: The atomic, UUID-identified unit of a writing project — a discrete piece of prose with its own content, key, readiness, and aspect weights. _Avoid_: chunk, entry, node, piece (a fragment is never a "piece"; "piece" is valid only as the importer's transient in-memory split unit — never a vault entity, and the `pieces/` staging folder is gone. A raw markdown file dropped into `fragments/` is adopted directly as a fragment).

**Key**: The filename stem of any vault entity (fragment, aspect, note, reference), serving as both its unique identifier and its display title; applies uniformly across all entity types. _Avoid_: title (old spec language for notes), name (old spec language for references), slug (an implementation concern, not a synonym).

**Aspect**: A named structural dimension of a project — a character, theme, place, emotion, or any user-defined concept — to which fragments can be assigned weights. _Avoid_: tag, dimension, category (category is a property of an aspect, not an aspect itself), theme (too narrow).

**Category**: The vault subfolder (relative to the entity-type root) an aspect, note, or reference lives in — a slash-separated path string, or `null` when the entity sits at the entity-type root. Derived from `filePath`, not stored independently. Applies only to aspects, notes, and references; fragments are always at the root of `fragments/` (or `fragments/discarded/`). _Avoid_: folder (implementation), tag, group, namespace.

**Weight**: A 0–1 float expressing how strongly an entity embodies a given aspect. On a fragment: how strongly it expresses that aspect. On an arc control point: the target expression level at that position. _Avoid_: intensity (use weight for both fragment values and arc targets), score, rating.

**Arc**: A user-authored curve expressing how a given aspect's target weight should rise and fall across the sequence, defined as sparse control points with normalized positions and weights. _Avoid_: storyline, trajectory, plot arc (too narrative-specific), curve (use only informally).

**Explicit arc**: An arc that the user has authored deliberately for an aspect, stored in the vault and used as the scoring target. _Avoid_: target arc, defined arc, authored arc.

**Actual arc**: The curve derived from the current placement of fragments and their aspect weights for a given aspect — always computable once any weighted fragment is placed, never user-authored, never stored. _Avoid_: real arc, live arc, computed arc.

**Implicit arc**: The actual arc used as the scoring baseline when no explicit arc has been defined for an aspect; not user-visible and not stored. _Avoid_: fallback arc, default arc.

**Fitting score**: A derived 0–1 value indicating how well a fragment's aspect weights align with arc targets (explicit or implicit) at a given sequence position; advisory and recomputable on demand. _Avoid_: match score, placement score, compatibility score.

**Control point**: A `{ x, y }` pair — both normalized to [0, 1] — defining one anchor of an arc, where `x` is the normalized sequence position and `y` is the target weight for that aspect at that position. _Avoid_: anchor, node, vertex.

**Sequence**: An ordered arrangement of fragments divided into sections; a project may have any number of named sequences, with exactly one designated as the main sequence. _Avoid_: timeline (deliberately avoided), arrangement, order.

**Main sequence**: The single sequence designated for export at any given time; the default view in the overview. _Avoid_: primary sequence, master sequence, default sequence.

**Secondary sequence**: Any non-main sequence; a partial ordering that does not cover the full fragment set, consumed by the sequencer as an ordering constraint only while active. Typically user-authored, but also includes auto-created import-sequences. _Avoid_: subsequence, alternate sequence.

**Active**: The state of a non-main sequence being currently consumed by the sequencer as an ordering constraint; user-authored secondary sequences are active by default, import-sequences inactive. _Avoid_: enabled, on, included.

**Import-sequence**: An editable secondary sequence auto-created by an import to record the fragments' original import order; carries an origin and is created inactive. _Avoid_: import order, import snapshot (the durable snapshot is the import archive, not this).

**Import archive**: The original, unmodified file an import was created from, stored byte-for-byte under `.maskor/imports/`; the durable record of imported content, referenced by a sequence's origin. _Avoid_: backup, source file, archived source.

**Origin**: Optional provenance on a sequence pointing to its import archive, with the original file name, format, and import time. _Avoid_: source (reserved as an avoided synonym for Reference), provenance, import metadata.

**Section**: A named container within a sequence owning a subset of fragments with its own internal ordering; the unit of coarse reordering. _Avoid_: chapter (too narrative-specific), group, bucket.

**Unassigned pool**: The implicit set of non-discarded fragments not placed into any section of a given sequence; has no order and is not a stored entity. _Avoid_: pool (old multi-state concept, removed — see flagged ambiguities), queue, backlog.

**Placement**: The act of assigning a fragment to a position within a section of a sequence, or the resulting assignment itself. _Avoid_: assignment, positioning, insertion.

**Interleaving**: The set of aspect-level frequency and pattern rules governing how aspects mix, alternate, and constrain each other across the sequence (run-length limits, spacing, transition rules), consumed by the sequencer alongside arcs. _Avoid_: mixing, scheduling, pacing, rhythm.

**Readiness**: A 0–1 float the user sets on a fragment to indicate how finished it is; `1.0` removes the fragment from the suggestion-mode eligible pool. _Avoid_: completion, done flag, status, progress. (Codebase field still named `readyStatus` — rename tracked in `references/plans/glossary-alignment.md`.)

**Draft**: A named, complete snapshot of a project vault at a point in time — the document, finished or unfinished, as it stood when saved; storable and restorable by the user. _Avoid_: version, checkpoint, backup.

**Vault**: The directory on disk containing all of a project's markdown files (fragments, aspects, notes, references) and Maskor-managed config; the source of truth for all user-authored content. _Avoid_: workspace, project folder, repository.

**Warning**: A recorded, non-fatal vault condition surfaced to the user for inspection — either an unresolved-state problem the user can fix (a wrong-format file sitting in an entity folder, an unknown aspect key referenced by a fragment) or a notable auto-resolved event (a UUID collision). State warnings clear once the underlying problem is fixed; event warnings persist until dismissed. _Avoid_: error (warnings are advisory and non-fatal, not thrown failures), diagnostic, alert.

**Note**: A named, free-text, project-scope vault document representing the user's own thinking or observations, surfaced and connected via document-links; no longer attached to fragments through a frontmatter list. _Avoid_: annotation, memo. (Distinct from the **Margin**'s unanchored notes section, which is fragment-scope — see flagged ambiguities.)

**Reference**: A named, free-text vault document pointing to or summarizing external source material, attachable to fragments. _Avoid_: source, citation, attachment (attachment is the shared implementation concept for both notes and references).

**Margin**: A companion annotation document for an annotatable host entity — one per host — holding the writer's own thinking about it, split into an unanchored notes section (whole-host thoughts on structure, character, rewrites) and an anchored comments section (each tied to one of the host's anchor units). Rendered side-by-side with the host. The host's anchor unit varies by type: a fragment's is a block (line/paragraph); a sequence's would be a section. Fragments are the first and currently only host; the concept is defined generally so sequences (and later aspects/arcs) plug in without rework. _Avoid_: annotation document, sidecar, gloss.

**Annotatable entity**: A vault entity that can own a Margin. Fragments now; sequences, aspects, and arcs are candidate future hosts. Each annotatable entity declares its anchor unit (the sub-part a comment can bind to). _Avoid_: commentable, host (informal only).

**Comment**: An anchored annotation block within a fragment's Margin, bound to a specific block (line/paragraph) of that fragment; not a standalone vault file and not a document-link. _Avoid_: annotation (the umbrella act), inline note, callout.

**Anchor**: The binding between a Comment and the fragment block it annotates — carried durably by a trailing marker on the fragment block (which follows the text through edits) and mirrored by an **excerpt**: the opening of the anchored block, kept current while the anchor resolves and frozen at its last-known value once the comment is orphaned, used for side-by-side display and orphan context. Block-granular; the excerpt is display context, not a sub-block anchor — word/span-level anchoring is out of scope for now. _Avoid_: link (reserved for document-links), pin, reference.

**Orphaned comment**: A Comment whose anchor can no longer be resolved to a fragment block (block deleted, marker stripped by an external edit); never auto-deleted — it sinks to an orphaned group at the foot of the Margin's comments section showing its last-known excerpt, removable only by the user. _Avoid_: dangling comment, lost comment, broken comment.

**Suggestion mode**: The application mode where Maskor surfaces one fragment at a time for the user to work on, chosen non-deterministically from the eligible pool. _Avoid_: prompting mode (prompting is the underlying mechanism name), random mode, shuffle mode.

**Eligible pool**: The set of fragments available for selection in suggestion mode — non-discarded, readiness < 1.0, and not in the current cooldown set. _Avoid_: pool (ambiguous), candidate set, available fragments.

**Cooldown**: The transient, in-memory exclusion of a recently surfaced fragment from the eligible pool, preventing immediate re-surfacing. _Avoid_: debounce, suppression, exclusion window.

**Overview**: The primary working surface for reading and rearranging a sequence — a vertical spine of fragments (rendered as flowing prose, or condensed to title rows) flanked by a draggable reorder list with the unassigned pool, a selected-fragment detail panel, and a summonable aspect-arc overlay that expands into a full zoomable arc view. A read-and-rearrange surface; in-context fragment editing is a planned addition. _Avoid_: sequencer view, timeline view, dashboard, tile grid.

**Tile** (being retired): The horizontal-grid representation of a single placed fragment in the legacy Overview, rendered with density-dependent content (key, excerpt, aspect chips, or color bar). The redesigned vertical Overview replaces tiles with per-fragment prose blocks and condensed title rows; do not reuse "tile" for the new surface's rows or blocks. _Avoid_: card (used generically elsewhere in the UI), cell, block.

**Key fragment**: A fragment pinned to a target normalized position in the sequence with a user-defined tolerance radius; respected by all placement modes. _Avoid_: anchored fragment, pinned fragment, fixed fragment.

**Noise**: Optional seeded deterministic offsets applied on top of fitting scores by the sequencer to introduce controlled variation without sacrificing reproducibility. _Avoid_: randomness, jitter (jitter is the suggestion-mode cooldown fallback, not a sequencer concept), entropy.

**Action log**: The persistent, append-only, human-readable `.jsonl` file recording every user-initiated state-changing operation; the primary observability artifact. _Avoid_: audit log, history log, event log.

**Project**: A named writing project backed by a vault on disk, identified by a UUID, registered in the global registry, containing all of a writer's fragments, aspects, notes, references, sequences, and configuration. _Avoid_: workspace (too generic), book (too specific).

**Registry**: The global SQLite database mapping project UUIDs to vault paths; distinct from the per-vault DB. _Avoid_: index, project database.

**Export**: The operation that assembles fragments in sequence order into a single output file (Markdown, plain text, Word, or PDF), ending Maskor's responsibility for the content. _Avoid_: publish, output, render.

**Quick-switcher**: The unified fuzzy-search surface for jumping to any existing entity within the active project — fragments, aspects, notes, references, sequences. Sibling to the command palette: the palette runs actions, the quick-switcher selects entities. Project-scoped: cross-project switching stays in the palette as `Switch project…`. Trigger verb: "switch to". _Avoid_: quick-open (VS Code term, file-centric), quick-switcher hyphen variants ("quickswitcher", "quick switch"), entity picker (Picker is the underlying primitive, not the feature).

**Extract**: The act of creating a new entity (fragment, note, reference, or aspect) from a contiguous text selection inside another entity's body; the source body may keep, drop, or be replaced with a link to the new entity. _Avoid_: promote, lift, split, refactor.

**Preview**: The read-only surface that renders any sequence as continuously assembled prose for reading and pre-export inspection, sharing assembly logic with export. _Avoid_: read view, draft view, export preview.

---

## Flagged ambiguities

**"Pool"** — the term had an old multi-state meaning (`unprocessed`, `incomplete`, `unplaced`, `discarded`) that was explicitly removed. "Unassigned pool" should be used whenever the placement concept is required; "pool" alone is now ambiguous and should always be qualified.

**"Sequence" (main vs. any)** — "sequence" should mean any named ordering; "main sequence" is the designated export target. Informal uses of "sequence" meaning the main sequence persist across specs. Use the qualified form when the distinction matters.

**"Prompting" vs. "suggestion mode"** — "prompting" is the underlying engine/mechanism name; "suggestion mode" is the developer-facing surface name. The user-facing label is still undecided. Keep the two distinct; do not conflate in specs.

**"Arc" (plain noun)** — informally refers to both the explicit arc entity and the visual curve rendered in the overview (which may overlay both actual and explicit arcs). Use qualified forms ("explicit arc", "actual arc") when precision matters.

**"Source"** — reserved as an avoided synonym for Reference. Import provenance uses origin, never "source", to avoid the overload.

**"Key" vs. "title/name" in specs** — the codebase already uses `key` uniformly for notes and references. `attachments.md` still says "title (notes) or name (references)". Spec update tracked in `references/plans/glossary-alignment.md`.

**"Note" (project vault entity) vs. Margin "notes" section** — a **Note** is a standalone project-scope vault document; the **Margin** has an unanchored "notes" section that is fragment-scope. Same word, different scope. Accepted overload; always qualify as "vault Note" vs. "Margin notes" when the distinction matters.
