# Spec: Interleaving

**Status**: Draft
**Last updated**: 2026-04-27

---

## Outcome

The user can define how aspects mix, alternate, and constrain each other across the fragment sequence — controlling frequency, run-length, spacing, and transition patterns. For structured fragment-level constraints (fragment A must precede B; fragments A, B, C must appear in section 2 in that order), the user creates secondary sequences — partial orderings that encode those chains. The interleaving config then defines how those sequence-streams are woven into the main sequence.

This is intentionally distinct from arcs. An arc says _how intense_ an aspect should be at a position; interleaving says _how often_ it appears and what can follow it.

Interleaving is an incremental feature. The sequencer works without any interleaving config. Rules are added as the project grows in complexity.

---

## Scope

### In scope

- Rule types: hard transition rules, soft transition preferences, frequency/spacing rules, run-length limits, time-windowed weights
- Contribution to the fitting score (as weights or filters on the candidate set)
- The data model for an `Interleaving` configuration and its rules
- Storage of the interleaving config as a human-readable file in the vault
- Distinction from arc (intensity) and sequencer (placement engine)

### Out of scope

- Intensity of individual aspects — that belongs to arcs (`aspect-arc-model.md`)
- How the sequencer runs the placement algorithm — that belongs to the sequencer (`sequencer.md`)
- Interleaving visualization / UI (covered in `overview.md`)
- Hand-drawn pattern input as a UI mechanism (future — when implemented, Maskor will approximate the drawn pattern using existing rule types; it is not a separate data model concept)
- Auto-deriving an interleaving config from an existing manual arrangement (future)
- Per-fragment hard ordering constraints (e.g. "fragment B must follow fragment A") — those belong to the sequencer spec as hard requirements, not interleaving

> The interleaving spec is about _aspect-level_ frequency and pattern rules. It does not name specific fragments — it names aspects and the relationships between them.

---

## Behavior

### What interleaving controls

Interleaving defines the _rhythm and pattern_ of aspect occurrence. It does not name specific fragments — fragment-level ordering constraints are expressed via secondary sequences (see below).

Aspect-level examples:

- "No more than 3 fragments with aspect `tension` in a row."
- "Aspect `character-A` and aspect `character-B` must be separated by at least 2 fragments."
- "Aspect `subplot-mystery` should appear roughly every 5 fragments."
- "Aspect `resolution` should not appear in the first 20% of the sequence."
- "Aspect `action` preferably follows aspect `quiet`."

### Secondary sequences as constraint chains

Secondary sequences are defined and owned by the sequencer. See `sequencer.md` for the data model and storage rules.

In brief: a secondary sequence is a partial ordering of specific fragments (A → B → C) or a set of fragments that must land in a given section. They do not cover the full fragment set — only a subset.

The interleaving config's role here is pacing: it can define how secondary sequence-streams are woven into the main sequence — for example, "secondary sequence X should surface roughly every 8 positions" or "alternate between secondary sequence X and Y before resuming the default fragment pool". The secondary sequence data model itself belongs to `sequencer.md`, not here.

### Rule types

Rules operate on aspects, not on individual fragments. A rule says something about aspect occurrences in the sequence.

**Frequency / spacing rules** — the initial rule type. Define a minimum interval between occurrences of an aspect (at least N fragments between two `character-A` fragments), or a maximum run-length (no more than N consecutive fragments for a given aspect). Additional rule types are added incrementally as the feature grows.

**Hard transition rules** — block a placement outright if the rule would be violated. The candidate fragment is excluded from the eligible set for that position. The sequencer must handle the resulting deadlock if no eligible fragment exists (see sequencer spec).

**Soft transition preferences** — adjust the fitting score without excluding a fragment. The candidate is still eligible, but a rule violation lowers its score relative to compliant alternatives.

**Time-windowed weights** — assign a probability modifier to an aspect over a normalized range of the sequence (e.g. `character-A` is twice as likely in the first 30%). These are soft — they modify scores, not block placements.

### Rule hardness

Each rule has a hardness: `hard` or `soft`. Hard rules constrain the candidate set before scoring. Soft rules participate in score calculation only. The user can set this per rule.

### Scope: main sequence vs secondary sequences

By default, interleaving rules apply to the main sequence only. Secondary sequences are simpler and have no interleaving config unless the user explicitly adds one. This is an optional complexity layer for larger projects.

### Relationship to fitting score

Interleaving rules contribute to the fitting score alongside arc curves. A fragment that violates a soft rule scores lower at that position; a fragment that violates a hard rule is not scored at all — it is excluded from the candidate set entirely.

The sequencer reads the interleaving config as one of its inputs alongside arc definitions. Interleaving does not run independently.

---

## Constraints

- Interleaving rules reference aspects by key (same join as aspect weights in fragments — no UUID).
- The interleaving config is consumed by the sequencer; it has no HTTP surface of its own.
- The `Interleaving` type in `packages/shared` is currently a TODO stub — the data model will be defined incrementally, starting with frequency/spacing rules.
- Hard rules that create deadlocks must be surfaced to the user, not silently ignored (same deadlock-detection contract as the sequencer).
- The interleaving config file is stored at `<vault>/.maskor/config/interleaving.yaml` (or `.json`). Human-readable but technical format is acceptable.

---

## Prior decisions

- **Arc owns intensity; interleaving owns frequency/pattern**: Explicitly called out in `aspect-arc-model.md`. Arcs describe a target intensity shape; interleaving describes transition and frequency constraints.
- **Interleaving is a sequencer input, not a separate engine**: The sequencer consumes interleaving rules as one input alongside arcs. There is no standalone interleaving pass.
- **Incremental data model**: No full schema upfront. Frequency/spacing rules ship first; more complex rule types are added as the feature matures.
- **Main-sequence-first**: Interleaving defaults to the main sequence. Secondary sequences can optionally carry their own interleaving config, but this is not required.
- **Hand-drawn patterns are a future UI mechanism**: When added, Maskor approximates the drawn pattern using the existing rule types rather than introducing a separate data model concept.
- **Storage in vault config file**: `<vault>/.maskor/config/interleaving.yaml`. User-authored intent stored in the vault, not the DB.
- **Fragment-level constraints expressed via secondary sequences, not interleaving rules**: Interleaving rules reference aspects only. A secondary sequence is a partial ordering of specific fragments (A → B → C), stored in `<vault>/.maskor/sequences/`. Interleaving can then control how those secondary sequence-streams are woven into the main sequence.

---

## Open questions

- [x] 2026-04-27 — Should rules reference fragments at all? **Resolved**: No. Interleaving rules reference aspects only. Fragment-level ordering constraints (A before B, A must appear in section 2) are expressed as secondary sequences. Interleaving can then define how those secondary sequence-streams are woven into the main sequence.
- [ ] 2026-04-27 — Can rules span multiple aspects, or only reference one aspect per rule? Transition rules ("A cannot follow B") span two aspects by definition. Is there a richer relational form (e.g. "at least one of {A, B, C} must appear every N positions")?
- [ ] 2026-04-27 — How does interleaving interact with sections? Can rules be scoped to a section, or are they always sequence-wide?
- [ ] 2026-04-27 — The "constraint graph" metaphor: is this a UI concern only, or should the data model represent relationships between aspects as a graph rather than a flat rule list?
- [ ] 2026-04-27 — Do arcs and interleaving config share the same storage file, or are they separate? Both are user-authored intent stored in the vault config directory.

---

## Acceptance criteria

- The sequencer produces valid output with no interleaving config present.
- The `Interleaving` type is defined and can represent at minimum a frequency/spacing rule for a single aspect.
- An interleaving config with a hard transition rule ("aspect A cannot follow aspect B") causes the sequencer to exclude fragments carrying aspect A from positions immediately after a fragment carrying aspect B.
- An interleaving config with a soft transition preference adjusts the fitting score but does not exclude any fragment.
- A hard rule that creates a placement deadlock causes the sequencer to surface a conflict rather than silently producing an invalid sequence.
- Time-windowed weights are normalized to sequence length — the same config produces the same effect on a 20-fragment sequence and a 200-fragment sequence.
- Removing all interleaving rules produces the same sequencer output as having no interleaving config.
- The interleaving config file is human-readable and can be edited directly in a text editor without breaking the system.
