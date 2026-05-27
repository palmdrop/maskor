# Glossary

Maskor is a fragment-based creative writing tool. Writers compose by drafting, arranging, and sequencing fragments — discrete units of text — into arcs and exports.

## Language

**Fragment**: The atomic, UUID-identified unit of a writing project — a discrete piece of prose with its own content, key, readiness, and aspect weights. _Avoid_: piece (has a distinct meaning in Maskor), chunk, entry, node.

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

**Secondary sequence**: A user-authored partial ordering of specific fragments or fragments constrained to a section, consumed by the sequencer as a hard constraint; does not cover the full fragment set. _Avoid_: subsequence, alternate sequence.

**Section**: A named container within a sequence owning a subset of fragments with its own internal ordering; the unit of coarse reordering. _Avoid_: chapter (too narrative-specific), group, bucket.

**Unassigned pool**: The implicit set of non-discarded fragments not placed into any section of a given sequence; has no order and is not a stored entity. _Avoid_: pool (old multi-state concept, removed — see flagged ambiguities), queue, backlog.

**Placement**: The act of assigning a fragment to a position within a section of a sequence, or the resulting assignment itself. _Avoid_: assignment, positioning, insertion.

**Interleaving**: The set of aspect-level frequency and pattern rules governing how aspects mix, alternate, and constrain each other across the sequence (run-length limits, spacing, transition rules), consumed by the sequencer alongside arcs. _Avoid_: mixing, scheduling, pacing, rhythm.

**Readiness**: A 0–1 float the user sets on a fragment to indicate how finished it is; `1.0` removes the fragment from the suggestion-mode eligible pool. _Avoid_: completion, done flag, status, progress. (Codebase field still named `readyStatus` — rename tracked in `references/plans/glossary-alignment.md`.)

**Draft**: A named, complete snapshot of a project vault at a point in time — the document, finished or unfinished, as it stood when saved; storable and restorable by the user. _Avoid_: version, checkpoint, backup.

**Vault**: The directory on disk containing all of a project's markdown files (fragments, aspects, notes, references) and Maskor-managed config; the source of truth for all user-authored content. _Avoid_: workspace, project folder, repository.

**Piece**: A transient, in-memory raw writing file without metadata, UUID, or aspect properties — an intermediate step before being converted into a fragment. Likely to be removed in a future iteration. _Avoid_: raw fragment, import item, draft fragment.

**Note**: A named, free-text vault document representing the user's own thinking or observations, attachable to fragments. _Avoid_: annotation, comment (has a future specific meaning in Maskor), memo.

**Reference**: A named, free-text vault document pointing to or summarizing external source material, attachable to fragments. _Avoid_: source, citation, attachment (attachment is the shared implementation concept for both notes and references).

**Suggestion mode**: The application mode where Maskor surfaces one fragment at a time for the user to work on, chosen non-deterministically from the eligible pool. _Avoid_: prompting mode (prompting is the underlying mechanism name), random mode, shuffle mode.

**Eligible pool**: The set of fragments available for selection in suggestion mode — non-discarded, readiness < 1.0, and not in the current cooldown set. _Avoid_: pool (ambiguous), candidate set, available fragments.

**Cooldown**: The transient, in-memory exclusion of a recently surfaced fragment from the eligible pool, preventing immediate re-surfacing. _Avoid_: debounce, suppression, exclusion window.

**Overview**: The primary visual surface for inspecting and rearranging the sequence — a horizontal layout of fragment tiles with arc overlays; a read-and-rearrange surface, not an editing surface. _Avoid_: sequencer view, timeline view, dashboard.

**Tile**: The visual representation of a single placed fragment in the overview, rendered with density-dependent content (key, excerpt, aspect chips, or color bar). _Avoid_: card (used generically elsewhere in the UI), cell, block.

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

**"Piece" (dual sense)** — used for both the filesystem drop-zone file in `pieces/` and the in-memory import intermediary. Distinct origins; both transient. Likely removed soon; no resolution required.

**"Arc" (plain noun)** — informally refers to both the explicit arc entity and the visual curve rendered in the overview (which may overlay both actual and explicit arcs). Use qualified forms ("explicit arc", "actual arc") when precision matters.

**"Key" vs. "title/name" in specs** — the codebase already uses `key` uniformly for notes and references. `attachments.md` still says "title (notes) or name (references)". Spec update tracked in `references/plans/glossary-alignment.md`.
