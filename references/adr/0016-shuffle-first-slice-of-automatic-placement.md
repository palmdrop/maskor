# Shuffle: the first slice of automatic placement; ordering constraints hard-enforced by construction

**Status**: accepted

The shuffle generates a new secondary sequence by randomly ordering all non-discarded fragments while **honoring the ordering constraints of a chosen set of secondary sequences absolutely** — the output is a random linear extension of the combined constraint DAG (seeded Kahn's algorithm), never a merely-biased order. It is framed as the **first slice of the specced `automatic` placement mode** with scoring switched off (random in place of a fitting score), not a standalone feature: the constraint sources are pluggable, so arc/interleaving scoring layers on later through the same entry point. This is the **first place in the codebase an ordering constraint is enforced rather than merely detected** — everywhere else (`computeViolations`, `detectCycles`) constraints are advisory, reported against the main sequence but never blocking.

## Considered Options

- **Standalone `shuffle()` beside the placement modes** — smaller now. Rejected: the constraint-honoring, seeded-determinism, and deadlock-detection machinery is exactly what the automatic placer needs, so a standalone version is thrown away or duplicated when real scoring lands. Framing shuffle as automatic-mode-minus-scoring keeps the placement-mode taxonomy honest and the components reusable.
- **Soft constraints (bias the shuffle, may violate)** — Rejected: "honored" means honored. A soft version is obtainable by simply not selecting a constraint; a hard version is the more useful primitive and the one the spec earmarks for the automatic engine.
- **Overwrite a target sequence in place** — Rejected: a random roll must never clobber a hand-arranged main sequence, and always-new sidesteps the read-only-target question entirely. Promotion to main and cleanup already exist.

## Consequences

- Constraint sources become a **pluggable input to one generation function**, not hardcoded. Adding arc/interleaving scoring later is additive at the same seam.
- The RNG is **injected into the pure op** (the API owns seed generation), so `@maskor/sequencer` stays pure and unit-testable with a fixed seed despite the product being "random."
- **No user-facing seed / reproducibility** for the shuffle slice — deliberately non-reproducible from the user's side (internal seed logged only). This narrows `sequencer.md`'s "same seed → identical output" acceptance criterion to the *future scored* automatic placer; that doc language must be rephrased.
- A cyclic chosen constraint set **aborts the run** (no partial output), reusing `detectCycles`; the API maps it to `409 { reason: "constraint_cycle", cycles }`, mirroring the existing `sequence_read_only` shape.
- If shuffle is ever demoted to a soft/standalone toy, this ADR's framing collapses and the pluggable-constraint seam should be reconsidered.
