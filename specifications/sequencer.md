# Spec: Sequencer

**Status**: Draft
**Last updated**: 2026-04-27

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

- A secondary sequence is a partial ordering: an explicitly named chain of specific fragments that must appear in a given relative order (A → B → C), or that must land within a specific section.
- Secondary sequences do not cover the full fragment set — they constrain a subset.
- A fragment may appear in more than one secondary sequence.
- Secondary sequences are consumed by the sequencer as hard constraints during placement. A fragment whose secondary sequence requires it to appear after fragment X is excluded from any position before X.
- The interleaving config can additionally define how secondary sequence-streams are paced and woven into the main sequence (see `interleaving.md`).
- Secondary sequences are stored in `<vault>/.maskor/sequences/` alongside the main sequence.

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

| Table                | Key columns                                                            | Notes                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `sequences`          | `uuid`, `name`, `project_uuid`, `is_main`                              | One row per sequence. Exactly one `is_main = true` per project.                                                                                |
| `sections`           | `uuid`, `name`, `sequence_uuid`, `position`                            | Ordered list of sections within a sequence. `position` is the section's index among siblings.                                                  |
| `fragment_positions` | `uuid`, `fragment_uuid`, `section_uuid`, `position`                    | A fragment's placement within a section. `position` is 0-based within the section. A fragment may appear in at most one position per sequence. |
| `fitting_scores`     | `id`, `fragment_uuid`, `sequence_uuid`, `position_index`, `score`      | Cached derived values. DB-only; recomputable on demand. `position_index` is the fragment's absolute index within the sequence (0-based).       |
| `key_fragments`      | `id`, `fragment_uuid`, `sequence_uuid`, `target_position`, `tolerance` | Key fragment pins. `target_position` and `tolerance` are both normalized [0, 1].                                                               |

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
- **Deterministic placement with seeded noise**: Randomness is introduced via seeded noise rather than true randomness, so results are reproducible given the same seed.
- **Sections as containers**: A section owns a set of fragments and has its own internal ordering. This supports a two-phase workflow: assign fragments to sections first (rough sort), then order them within each section (fine placement). Sections are reordered as whole units.
- **Secondary sequences as the mechanism for fragment-level ordering constraints**: Fragment ordering constraints (A before B, A in section 2) are expressed as secondary sequences — user-authored partial orderings stored in `<vault>/.maskor/sequences/`. The sequencer reads them as inputs alongside arcs and interleaving rules.

---

## Open questions

- [ ] 2026-04-27 — Are sections and key fragments mutually exclusive? If a fragment has both a section membership and is a key, which takes precedence?
- [x] 2026-04-27 — How "rough" is a key position? Is it a specific index, a percentage of total sequence length, or a named anchor (first/last/middle)? **Resolved**: A normalized value in [0, 1] with a user-defined tolerance radius (also [0, 1]). Consistent with arc control point x-axis convention.
- [ ] 2026-04-27 — What is the cool-down mechanism for rejected fragments in semi-random mode? Fixed number of proposals, or time/position-based?
- [x] 2026-04-27 — What are "secondary sequences"? **Resolved**: A secondary sequence is a partial ordering — a chain of fragments that must appear in a specific relative order (A → B → C), or must appear within a specific section. Secondary sequences are the mechanism for fragment-level ordering constraints. The interleaving config then defines how these sequence-streams are woven into the main sequence. They do not need to cover all fragments. See `interleaving.md`.
- [ ] 2026-04-27 — How is deadlock resolution surfaced to the user? Error message, visual highlight, or a conflict resolution UI?
- [ ] 2026-04-27 — DB schema for sequences/sections/fragment positions is not yet defined. What tables and columns are needed?
- [ ] 2026-04-27 — Does the sequencer operate on a whole sequence at once, or can it place fragments into an arbitrary subset of positions (partial run)?
- [ ] 2026-04-27 — Arc and Interleaving types are stubs. The sequencer spec cannot be finalized until these inputs are defined.

---

## Acceptance criteria

- A project with no sequences can create a new named sequence.
- A sequence can be designated as main; only one sequence is main at a time.
- A fragment placed in a sequence at position N stays at position N until explicitly moved or the sequence is rebuilt.
- Running the automatic placer twice with the same seed and the same fragment set produces identical output.
- Running the automatic placer with different seeds produces different output (with reasonable probability).
- A fragment with section membership is never placed outside its designated section.
- A key fragment always appears within its designated positional range.
- Contradictory secondary sequence constraints (A before B and B before A) cause the sequencer to report a conflict rather than silently produce an invalid sequence.
- Fitting scores for all fragments in a sequence can be recomputed from scratch and yield the same result.
