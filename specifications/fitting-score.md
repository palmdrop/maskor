# Spec: Fitting Score

**Status**: Stable
**Last updated**: 2026-04-27

---

## Outcome

Given a fragment and a candidate position in a sequence, the system produces a single numeric score indicating how well the fragment fits that position. Higher score = better fit. The sequencers suggestion engine uses this score to drive placement decisions.

---

## Scope

### In scope

- Computing a fitting score for a (fragment, position) pair
- Arc alignment: comparing a fragment's aspect weights against the arc curve's target intensity at that position
- Hard requirement evaluation: ordering constraints that must hold (e.g. fragment B must follow fragment A)
- Aggregating per-aspect scores into a single value
- Storing the computed score in the DB as a cached value

### Out of scope

- Seeded noise (applied on top of the fitting score by the sequencer — see `sequencer.md`)
- Interleaving frequency rules (separate `interleaving.md` spec)
- Arc curve definition and configuration (separate `aspect-arc-model.md` spec)
- Key fragment pinning (sequencer concern)
- The sequencer placement algorithm itself (`sequencer.md`)
- UI display of fitting scores

> Noise is a sequencer concern, not a fitting concern. The fitting score is a pure function of the fragment, the position, and the project config.

---

## Behavior

### Inputs

A fitting score computation takes:

- The **fragment**: its set of aspect weights
- The **position index** within the sequence (0-based or normalised — open question)
- The **arc curves**: for each aspect
- The **hard requirements** active in the sequence (ordering constraints)

### Arc alignment

For each aspect that has a weight on the fragment, the target intensity at the given position is determined as follows:

- If an **explicit arc** exists for the aspect: use the arc's interpolated target intensity at the normalized position.
- If no explicit arc exists: use the **implicit arc** — the actual arc derived from the current placement of all other fragments' weights for that aspect. See `aspect-arc-model.md`.

Compute the distance between the fragment's weight and the resolved target intensity. A small distance = good fit. Convert to a score component (e.g. `1 - distance`, but the exact algorithm is open).

Fragments with no weight for an aspect are ignored for that aspect. If an aspect has no explicit arc and no other fragments with that weight are placed (so no implicit arc can be computed), the aspect is ignored for this fragment.

### Aggregation

Per-aspect score components are aggregated into a single float. The aggregation strategy (simple average, weighted sum, etc.) is an open question.

### Hard requirements

Hard requirements (fragment A must precede fragment B) contribute a binary component to the score. A position that would violate a hard requirement for the given fragment produces a zero or heavily penalised score. The exact penalty mechanism is an open question.

### Storage

The computed fitting score for a (fragment, sequence position) pair is stored in the DB as a cached value. It must be recomputable on demand from its inputs. It is not written to vault files.

---

## Constraints

- Fitting score is **DB-only**. It is derived data; DB loss does not lose the ability to recompute it.
- The function must be **pure and deterministic**: same inputs → same output. No randomness inside the score itself.
- Implemented in `@maskor/sequencer`. The API (`@maskor/api`) may expose endpoints that trigger score computation; the sequencer package contains the logic.
- Scores must be **recomputable on demand** — no input is consumed destructively.
- Arc positions (where a fragment sits on the arc curve at a given index) are DB-only and are intermediate values produced during fitting score computation.
- Score range is not yet specified — should be normalised to a known range (e.g. 0–1) to make noise offsets predictable, but this is an open question.

---

## Prior decisions

- **Fitting scores are DB-only**: Derived from aspects + arcs + position context. Can be lost and recomputed.
- **Noise is not part of the fitting score**: The sequencer applies seeded noise on top of the raw fitting score. The score itself is a deterministic function of the inputs.
- **Arc controls intensity, not frequency**: Frequency is interleaving's domain. The fitting score only models intensity alignment.
- **Aspect weights are 0–1 floats**: Stored in `fragment_properties(fragment_uuid, aspect_key, weight)`. Referenced by aspect key, not UUID.
- **Score is normalized to [0, 1]**: Any score formula must produce values in this range. Required before `sequencer.md`'s noise offset range is meaningful.
- **Hard requirements produce exclusion, not penalty scores**: A fragment that violates a hard ordering constraint is removed from the candidate set before scoring. No penalty value is assigned. This is consistent with how interleaving hard rules work — see `interleaving.md`.
- **Fragments with no weight for an arc'd aspect are ignored**: Absent weight = no score contribution for that aspect. There is no implicit zero weight. Penalising fragments for not mentioning every arc'd aspect would make scores noise-dominated on projects with many aspects.
- **Aspects with no arc are ignored in scoring**: If an aspect has no arc, there is no target intensity to compare against. Aspect weights for arc-less aspects do not contribute to the fitting score.
- **Position input is normalized 0–1**: Consistent with the arc control point x-axis convention and the key fragment positional model. See `sequencer.md`.

---

## Open questions

- [ ] 2026-04-27 — What is the exact algorithm for computing arc alignment? Absolute distance (`|weight - target|`)? Squared? Gaussian decay?
- [ ] 2026-04-27 — How are per-aspect scores aggregated? Simple average? Weighted by some aspect-level importance factor?
- [x] 2026-04-27 — What happens when a fragment has no weight for an aspect that has an arc? Treat as weight = 0 (maximum penalty), or ignore the aspect entirely for that fragment? **Resolved**: Ignored — absent weight means no score contribution for that aspect. See `aspect-arc-model.md`.
- [x] 2026-04-27 — What happens when an aspect has no arc? Should its weight contribute to the score at all, or is it ignored? **Resolved**: Ignored — no arc means no target intensity, so no score contribution.
- [x] 2026-04-27 — How does the arc curve interpolate across positions? The `movement: number[]` array length may not equal the sequence length — is it linear interpolation, step, or smooth? **Resolved**: Arc curves are sparse control points `{ x, y }` (both in [0, 1]); the `movement: number[]` representation is obsolete. Interpolation method (linear, cubic spline) is a sequencer concern. See `aspect-arc-model.md`.
- [x] 2026-04-27 — Is the position input a raw index or a normalised value (0–1 fraction of total length)? This determines how the arc curve is sampled. **Resolved**: Normalized 0–1. Consistent with the arc control point x-axis and the key fragment positional model. See `sequencer.md`.
- [x] 2026-04-27 — Should the score be normalised to a known range (e.g. 0–1) before noise is applied? **Resolved**: Yes. Fitting scores are normalized to [0, 1]. Noise offsets (when used) are applied in the same range. See `sequencer.md`.
- [x] 2026-04-27 — Hard requirement penalty: is a violated constraint an automatic zero score, a large negative offset, or infinity (fragment is excluded from that position)? **Resolved**: Exclusion. A fragment that violates a hard requirement is removed from the candidate set before scoring. No penalty score is assigned. See `sequencer.md`.
- [ ] 2026-04-27 — Are interleaving soft constraints (not hard requirements) also factored into the fitting score, or is that entirely the sequencer's concern?

---

## Acceptance criteria

- Given a fragment with weight 0.8 for aspect `tension` and an arc that targets 0.9 at the candidate position, the score reflects high alignment (closer to 1 than to 0, by whatever scale is chosen).
- Given a fragment with weight 0.1 for aspect `tension` and an arc that targets 0.9 at the same position, the score reflects poor alignment.
- A position that violates a hard requirement for the given fragment produces a score that causes the sequencer to not place the fragment there.
- Computing the fitting score twice with identical inputs produces identical output.
- A fragment with no aspect weights scores the same regardless of position (no arc can pull it anywhere).
- Fitting scores for all positions in a sequence can be recomputed after a DB wipe and yield the same values.
