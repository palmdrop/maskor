# Spec: Sequencer

**Status**: In Progress
**Last updated**: 2026-07-04

**Shipped**:

- 2026-07-11 — Shuffle: generate a new non-main secondary sequence that places all non-discarded fragments in a random flat order honoring the ordering constraints of a chosen set of secondary sequences (a random linear extension of their combined DAG). The generated sequence lands **inactive** — a candidate the user activates deliberately, so it never silently joins the active constraint set and manufactures a conflict against an unchosen active secondary. Framed as the first slice of the `automatic` placement mode with scoring switched off, and the first path to **hard-enforce** ordering constraints (the advisory `computeViolations`/`detectCycles` path against the main sequence is unchanged). Contradictory chosen constraints abort the run with a reported cycle (`409 { reason: "constraint_cycle", cycles }`); nothing is written. No user-facing seed — seeded internally for testability, seed logged only. Reusable pure primitives in `@maskor/sequencer` (exposed `buildConstraintGraph`/`restrictGraphToNodes`/`detectCyclesInGraph`, `computeRandomLinearExtension`, `generateShuffledSequence`) so the future scored placer plugs into the same seam; `POST /sequences/generate`; a sidebar "Shuffle" dialog (constraint checklist pre-checked with the active secondaries). (plan: `references/plans/shuffle-sequence.md`, glossary: Shuffle / Ordering constraint, ADR 0016)
- 2026-07-04 — Discard ↔ sequence coherence. Discarding a fragment now removes it from every mutable sequence it is placed in (read-only import-sequences keep their snapshot placements); the single `fragment:discarded` action-log entry carries the removed sequence uuids and the history view reports the count. Restoring does **not** re-place the fragment — it returns to the unassigned pool. The frontend invalidates the whole sequence-query family on discard/restore (new `useInvalidateSequences` hook), so the sidebar, Overview, and unplace picker drop the stale placement immediately. (plan: references/plans/discard-and-split-integrity.md, Phases 1–2)
- 2026-06-19 — Place a fragment into a sequence on creation: the "New fragment" dialog has an optional "Add to sequence" picker (import-sequences excluded — they are read-only). When a sequence is chosen, the new fragment is appended to that sequence's last section after creation. In the fragment list, the picker pre-selects the sequence the list is currently sorted by, so creating a fragment while viewing a sequence's order offers to add it there. Placement is best-effort (the fragment is created regardless; a placement failure surfaces a toast).
- 2026-05-12 — Users can manually arrange fragments into an ordered main sequence. Non-discarded fragments not yet placed appear in an unassigned pool. Fragments can be dragged from the pool into the sequence, reordered within it, or dragged back out to unplace them; the arrangement survives a reload. (plan: references/plans/sequencer-manual-placement.md)
- 2026-05-18 — Sequence placement, move, and unplace actions log the sequence name and fragment key for human-readable action log rendering. (plan: references/plans/sequence-action-log-human-readable.md)
- 2026-05-18 - Secondary sequences as soft constraints, sequence CRUD, violation and cycle detection, sidebar for switching between sequences. (prd: tasks/prd-secondary-sequences.md)
- 2026-05-29 - Users can re-order sections within a sequence by dragging and dropping.
- 2026-05-31 - Sequences carry an `active` flag: the violation/cycle detector consumes only **active** non-main sequences, so a non-main sequence no longer constrains the main sequence merely by existing. User-authored secondaries default active; auto-created import-sequences default inactive. Sequences also carry an optional `origin` (import provenance). (plan: `references/plans/import-sequence.md`, ADRs 0004/0005)
- 2026-06-01 - "Place in sequence…" command (fragment editor scope, available from the fragment list and suggestion mode): pick a sequence by name, then add/move/remove the active fragment and add/remove sections in a keyboard-driven modal. Active-fragment-only, live commit, no DnD; reuses the Overview's tile and step-move logic. The fragment metadata sidebar also gained a read-only "Sequences" stat listing each sequence the fragment is placed in (with section + main marker), each linking to that sequence in the overview. (plan: `references/plans/place-in-sequence.md`, ADR 0006)
- 2026-06-05 - Overview redesigned as a vertical read/reorder surface: a prose spine of placed fragments rendered client-side per fragment (collapsible along a detail axis — prose → title+excerpt → title-only), a left reorder list grouped by section with a condensed unassigned pool (vertical drag to reorder/place/unplace, optimistic), and a right selected-fragment detail panel. A per-fragment bulk-content endpoint feeds the spine. The horizontal tile layout was retired. (plan: `references/plans/overview-redesign.md`, ADRs 0010/0011)
- 2026-06-05 - Multi-fragment section operations (sequencer-side, optimistic): group a multi-selection of placed fragments into a new section (positioned before/after its home section by the selection's centre of mass), move a multi-selection into an existing section as a block, split a section before or after a marked fragment, and merge a section into the adjacent one (the inverse of split/group — fragments stay placed rather than returning to the pool). Backed by `@maskor/sequencer` pure ops + sequence-scoped API routes; driven from a multi-select reorder list (click / cmd-click / shift-range) with `overviewScope` commands and per-section merge/split affordances. (plan: `references/plans/overview-redesign.md` Phase 2)
- 2026-06-05 - Clone and merge sequences (sequencer-side): clone a sequence into a fresh independent copy (regenerated sequence/section/position UUIDs, placements preserved, never main), and insert one sequence into another at a section index (the source's sections are spliced in with fresh UUIDs; fragments already placed in the target are skipped to keep the one-placement invariant). Backed by `@maskor/sequencer` pure ops + sequence-scoped API routes (`/{id}/clone`, `/{id}/insert-sequence`) and `sequence:cloned`/`sequence:inserted` action-log entries; driven from the sequence sidebar (per-row clone + insert-into-current affordances) and `overviewScope` commands. (plan: `references/plans/overview-redesign.md` Phase 3)
- 2026-06-08 - Overview spine double-click + shared `InlineFragmentEditor`: the plain `<textarea>` editing path in the spine is replaced by the shared `InlineFragmentEditor` (vim/rich/raw per project config). Double-clicking a fragment in the spine enters inline edit mode; the pencil icon affordance is retained. (plan: `references/plans/preview-inline-fragment-editing.md` Phase 2)
- 2026-06-11 - Sequence rename is now reachable for existing sequences (closing the "rename" gap in sequence CRUD): the sequence-sidebar row exposes it via a per-row "⋯" actions menu, a double-click on the row, and the palette command `overview:rename-sequence`, all opening the inline editor over the existing `updateSequence` name path. That same "⋯" menu consolidates the row's clone / insert / activate-deactivate / delete affordances, which were previously separate hover icons.
- 2026-06-13 - Import-sequences are read-only: a sequence carrying an `origin` cannot have fragments placed/moved/unplaced or sections created/deleted/renamed/reordered/merged/split. Cloning it, or inserting it as a _source_ into another sequence, stays allowed — cloning is the escape hatch to build on an import order. Enforced in `@maskor/sequencer` (`assertSequenceMutable`, called by the mutating pure ops and the section commands) so the rule holds for every caller, not just the UI; the API maps the rejection to `409 { reason: "sequence_read_only" }`. The Overview renders an import-sequence read-only (no pool, no drag, no section editing, with a "clone to rearrange" banner) and the "Place in sequence…" picker excludes import-sequences. (plan: `references/plans/sequence-placement-improvements.md`, ADR 0014)
- 2026-06-13 - "Place in sequence…" reworked into an active-fragment-centric drag-and-drop arranger (`SequenceArranger`): it reuses the Overview's row/section look with full drag-and-drop scoped to one sequence, laying the unassigned pool beside the sections (each column independently scrollable), and emphasizes the active fragment (highlight + scroll-into-view). Quick add/move/remove plus keyboard sorting (↑/↓, and j/k in vim mode; Backspace removes) commit against the same endpoints; keyboard focus follows the fragment across section changes. Section management stays Overview-only (the modal is drag-arrange only). The picker also floats sequences the fragment is already placed in to the top, each labelled with its current section. (plan: `references/plans/sequence-placement-improvements.md`, ADR 0014 supersedes ADR 0006)

---

## Implementation status

**First slice shipped (2026-05-12):** Manual placement only. Single implicit main sequence, single default section ("Main"). Full data model is spec-shaped from day one (sections present in vault files and DB) so adding sections UI, secondary sequences, and scoring later is purely additive — no vault-file migration required.

Out of the first slice: fitting scores, key fragments, semi-random and automatic modes, secondary sequences, noise, deadlock detection, arc overlays, multiple-sequence UI, section reordering UI, and arrow-key rearrangement.

---

## Outcome

The user can arrange their fragments into an ordered sequence — manually, with Maskor's suggestion engine, or fully automatically — using arc curves and interleaving rules to guide placement. The result is one or more named sequences, one of which can be designated as the main sequence for export.

---

## Scope

### In scope

- Managing sequences: create, rename, delete, designate as main
- Managing secondary sequences: create, name, define fragment ordering chains
- Managing sections within a sequence: create, rename, reorder, delete
- Placing fragments into positions within a sequence
- Three placement modes: manual, semi-random (accept/reject), automatic
- Fitting score calculation per fragment per position (based on aspects, arc curves, interleaving rules, and secondary sequence constraints)
- Seeded, deterministic noise that offsets fitting scores by a user-defined range
- Key fragments: fragments pinned to a rough position in the sequence
- Deadlock and loop detection when placement constraints are contradictory
- API surface for sequencer operations (callable from the frontend)
- Storage of all sequence data in the DB (never in vault files)

### Out of scope

- The interleaving algorithm itself (separate `interleaving.md` spec)
- Arc definition and configuration (separate `aspect-arc-model.md` spec)
- Export of the main sequence to a document (separate `export.md` spec)
- The sequencer view / UI (separate `overview.md` and/or frontend spec)
- Generating arcs/rules from an existing manual arrangement (future feature)

> Interleaving and arc configuration are treated as inputs to the sequencer, not part of it. The sequencer consumes them but does not define them.

---

## Behavior

### Sequences

- A project may have any number of named sequences.
- Exactly one sequence is designated as "main" at any time. The main sequence is used for export.
- The main sequence warns the user if any non-discarded fragment is unassigned or unplaced.
- A sequence is composed of an ordered list of sections plus an implicit unassigned pool.
- Sections are the unit of reordering: the user can move sections relative to each other without changing intra-section fragment order.

### Secondary sequences

- A secondary sequence is any non-main sequence — typically a partial ordering: an explicitly named chain of specific fragments that must appear in a given relative order (A → B → C), or that must land within a specific section. Auto-created **import-sequences** are also secondary sequences (see `import-pipeline.md`).
- Secondary sequences do not cover the full fragment set — they constrain a subset.
- A fragment may appear in more than one secondary sequence.
- **Only `active` secondary sequences are consumed as constraints.** Each sequence carries an `active` flag; the detector ignores inactive ones. User-authored secondaries default `active: true`; import-sequences default `active: false`, so a captured import order constrains nothing until the user opts in.
- Constraint enforcement is currently **advisory**: the shipped sequencer detects and reports ordering violations and cycles against the main sequence rather than preventing placement (see "Constraint enforcement" below). The relative-order intent (A must precede B) is what a future placement engine will enforce.
- The interleaving config can additionally define how secondary sequence-streams are paced and woven into the main sequence (see `interleaving.md`).
- Secondary sequences are stored in `<vault>/.maskor/sequences/` alongside the main sequence.

> **Constraint enforcement — "soft" vs "hard" (clarified 2026-05-31).** Earlier wording in this spec called secondary-sequence constraints both "soft" and "hard". The shipped behavior is neither in the strict sense: active secondary sequences are consumed to **detect and report** violations and cycles against the main sequence (advisory), not to block placement. Hard enforcement (excluding a fragment from positions that would violate its ordering) is the intended target for the automatic placement engine, which is not yet built.
>
> **Update (2026-07-11).** The **shuffle** generator (see Shipped) is the first path to **hard-enforce** ordering constraints: it produces a random linear extension that honors the chosen secondaries' relative order by construction, and aborts on a contradictory (cyclic) selection. This does not change the advisory `computeViolations` path against the main sequence — the two coexist. See ADR 0016.

### Sections

- A section is a named container: it owns a set of fragments and has an independent internal ordering.
- Each fragment position records the fragment UUID and its position index within the section.
- A fragment belongs to at most one section within a given sequence. A fragment with no section assignment lives in the unassigned pool.
- Sections have a name and a UUID.

### Unassigned pool

- Fragments that have not been assigned to any section are held in an implicit unassigned pool.
- The pool has no order. It exists to track what still needs to be placed.
- A fragment can be moved from the pool into a section at any time, with or without a specific position.
- The main sequence is not export-ready while the pool is non-empty.

### Fragment placement

- A fragment may appear in at most one position within a given sequence.
- Placement is driven by a **fitting score**: a numeric value indicating how well a fragment fits a given position. Higher = better fit. Score is based on:
  - Aspect weights and arc curves at that position. When no explicit arc is defined for an aspect, the sequencer uses the **implicit arc** (the actual arc derived from placed fragments) as the scoring baseline. A project with no explicit arcs at all can still use the sequencer — see `aspect-arc-model.md`.
  - Secondary sequence constraints (relative ordering requirements for specific fragments)
  - Interleaving rules and constraints
- **Noise** is an optional feature. When enabled, seeded deterministic noise offsets are applied to fitting scores before placement, introducing controlled variation without sacrificing reproducibility:
  - Seeded deterministic noise (same seed → same offset)
  - User-defined min/max offset range in [0, 1], matching the normalized score range
  - Seed can be fixed or set to a new random value per run
  - User may supply a custom seed
  - When noise is disabled, placement is purely score-driven
- The sequencer places fragments one-by-one in descending fitting score order (with noise applied if enabled).

### Placement modes

- **Manual**: The user drags fragments into positions directly. No scoring involved. Full user control.
- **Semi-random**: The sequencer proposes the next fragment for a given slot. The user accepts or rejects. Rejected fragments enter a cooldown and are re-proposed later.
- **Automatic**: The sequencer fills all empty positions at once. The user can then re-arrange.

### Key fragments

- A key fragment is pinned to a target position in the sequence, expressed as a normalized value in [0, 1] — the same scale as the arc control point x-axis. `0.0` = first position, `1.0` = last position.
- A user-defined tolerance radius (also [0, 1]) specifies how far from the target the fragment may land. A radius of `0.05` means the fragment must fall within ±5% of the sequence length from its target.
- Keys are respected in all placement modes.

### Constraints and deadlock handling

- Secondary sequence constraints may conflict with each other (A before B and B before A) or with interleaving rules.
- The sequencer must detect loops and deadlocks arising from contradictory constraints.
- On detection, the sequencer surfaces the conflict to the user rather than silently producing a broken sequence.

---

## DB schema

The following tables are required. None exist yet — implementation is blocked until the schema is defined.

| Table                | Key columns                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sequences`          | `uuid`, `name`, `project_uuid`, `is_main`, `active`, `origin`          | One row per sequence. Exactly one `is_main = true` per project. `active` (default true) gates constraint participation; only non-main `active` rows feed violation/cycle detection. `origin` is an optional JSON provenance object (`{ fileName, archivePath, format, importedAt }`) set for import-sequences, pointing at the archived original under `.maskor/imports/`. |
| `sections`           | `uuid`, `name`, `sequence_uuid`, `position`                            | Ordered list of sections within a sequence. `position` is the section's index among siblings.                                                                                                                                                                                                                                                                              |
| `fragment_positions` | `uuid`, `fragment_uuid`, `section_uuid`, `position`                    | A fragment's placement within a section. `position` is 0-based within the section. A fragment may appear in at most one position per sequence.                                                                                                                                                                                                                             |
| `fitting_scores`     | `id`, `fragment_uuid`, `sequence_uuid`, `position_index`, `score`      | Cached derived values. DB-only; recomputable on demand. `position_index` is the fragment's absolute index within the sequence (0-based).                                                                                                                                                                                                                                   |
| `key_fragments`      | `id`, `fragment_uuid`, `sequence_uuid`, `target_position`, `tolerance` | Key fragment pins. `target_position` and `tolerance` are both normalized [0, 1].                                                                                                                                                                                                                                                                                           |

Vault files in `<vault>/.maskor/sequences/` are the source of truth for sequence structure. The DB tables above are a derived index — they can be rebuilt from the vault files.

---

## Constraints

- Sequence structure (ordering, section layout, fragment positions) is stored in `<vault>/.maskor/sequences/` — one file per sequence. Derived data (fitting scores, arc positions) is DB-only.
- Maskor reads sequence files on startup and writes them whenever the sequence changes. No live watcher on `.maskor/sequences/` — changes made by the user while Maskor is not running are picked up on next start. If Maskor is running, it may overwrite these files freely.
- Files in `.maskor/sequences/` are technically human-readable (structured with UUIDs) but are not required to be easy for a human to parse directly.
- Placement must be deterministic: same seed, same fragments, same config → same output.
- The sequencer is a standalone package (`@maskor/sequencer`) that exposes logic consumed by the API.
- The API (`@maskor/api`) provides the HTTP surface for sequencer operations; the sequencer package itself has no HTTP layer.
- Fitting scores must be recomputable on demand (no single source of truth other than the inputs).

---

## Prior decisions

- **Sequence structure is vault-stored, derived data is DB-only**: Fragment ordering and section layout are stored in `<vault>/.maskor/sequences/` and survive DB loss. Fitting scores and arc positions are derived and DB-only — they can be recomputed. The earlier assumption that all sequence data was "re-derivable" was wrong: a manually-arranged sequence cannot be recomputed from any input.
- **Deterministic placement with seeded noise**: For the scored automatic placer, randomness is introduced via seeded noise rather than true randomness, so results are reproducible given the same seed. The **shuffle** slice (see Shipped) is a deliberate exception: it is seeded internally for testability but exposes **no user-facing seed** and is treated as non-reproducible from the user's perspective (the seed is written to the action log only). Maskor is not a workflow where a user re-runs a random arrangement with a fixed seed; if that need ever arises, surfacing the logged seed is the additive path.
- **Sections as containers**: A section owns a set of fragments and has its own internal ordering. This supports a two-phase workflow: assign fragments to sections first (rough sort), then order them within each section (fine placement). Sections are reordered as whole units.
- **Secondary sequences as the mechanism for fragment-level ordering constraints**: Fragment ordering constraints (A before B, A in section 2) are expressed as secondary sequences — user-authored partial orderings stored in `<vault>/.maskor/sequences/`. The sequencer reads them as inputs alongside arcs and interleaving rules.

---

## Open questions

- [ ] 2026-04-27 — Are sections and key fragments mutually exclusive? If a fragment has both a section membership and is a key, which takes precedence?
- [x] 2026-04-27 — How "rough" is a key position? Is it a specific index, a percentage of total sequence length, or a named anchor (first/last/middle)? **Resolved**: A normalized value in [0, 1] with a user-defined tolerance radius (also [0, 1]). Consistent with arc control point x-axis convention.
- [ ] 2026-04-27 — What is the cool-down mechanism for rejected fragments in semi-random mode? Fixed number of proposals, or time/position-based?
- [x] 2026-04-27 — What are "secondary sequences"? **Resolved**: A secondary sequence is a partial ordering — a chain of fragments that must appear in a specific relative order (A → B → C), or must appear within a specific section. Secondary sequences are the mechanism for fragment-level ordering constraints. The interleaving config then defines how these sequence-streams are woven into the main sequence. They do not need to cover all fragments. See `interleaving.md`.
- [ ] 2026-04-27 — How is deadlock resolution surfaced to the user? Error message, visual highlight, or a conflict resolution UI?
- [x] 2026-04-27 — DB schema for sequences/sections/fragment positions is not yet defined. What tables and columns are needed? **Resolved 2026-05-12**: `sequences`, `sections`, `fragment_positions` tables added in `20260512_add_sequences.sql`. `fitting_scores` and `key_fragments` deferred to a later slice.
- [ ] 2026-04-27 — Does the sequencer operate on a whole sequence at once, or can it place fragments into an arbitrary subset of positions (partial run)?
- [ ] 2026-04-27 — Arc and Interleaving types are stubs. The sequencer spec cannot be finalized until these inputs are defined.

---

## Acceptance criteria

- A project with no sequences can create a new named sequence.
- A sequence can be designated as main; only one sequence is main at a time.
- A fragment placed in a sequence at position N stays at position N until explicitly moved or the sequence is rebuilt.
- Running the automatic placer twice with the same seed and the same fragment set produces identical output. (Applies to the future **scored** placer. The shipped **shuffle** slice exposes no user-facing seed and is intentionally non-reproducible from the user's side — its determinism is verified at the pure-op level with an injected seed instead.)
- Running the automatic placer with different seeds produces different output (with reasonable probability).
- The shuffle always produces a valid random linear extension of the chosen constraints: every honored chain's relative order holds, and a contradictory (cyclic) selection aborts with a reported conflict rather than a broken sequence.
- A fragment with section membership is never placed outside its designated section.
- A key fragment always appears within its designated positional range.
- Contradictory secondary sequence constraints (A before B and B before A) cause the sequencer to report a conflict rather than silently produce an invalid sequence.
- Fitting scores for all fragments in a sequence can be recomputed from scratch and yield the same result.
