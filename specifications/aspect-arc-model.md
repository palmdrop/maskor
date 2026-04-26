# Spec: Aspect-Arc Model

**Status**: Draft
**Last updated**: 2026-04-26

---

## Outcome

The user can define named dimensions of their project — aspects. Fragments can have one or multiple aspects associated with them, where a weighted value indicates how strongly the fragment embodies each dimension. Each aspect can have an arc: a curve expressing how that dimension should rise and fall across the sequence of fragments. A fitting score tells the user (or the placement engine) how well the current arrangement matches the intended arcs.

---

## Scope

### In scope

- Aspect identity, lifecycle (create, read, delete), and vault storage
- Fragment–aspect weight assignment: what a weight means and how it is stored
- Arc definition: what an arc is and how it relates to an aspect
- Fitting score: what it measures and when it is computed
- The rules governing aspect key drift (orphaned weights in fragment files)

### Out of scope

- Sequencer / placement engine — how fitting scores are used to suggest or auto-place fragments (see `sequencer.md`)
- Interleaving — frequency and pattern control (see `interleaving.md`)
- Sequence model — what a sequence is and how fragments are ordered on it
- Project configuration UI — how the user authors arc curves in the interface
- Export or rendering of aspect data

---

## Behavior

### Aspects

An aspect is a named structural dimension of the project — a place, character, theme, emotion, or anything the user defines. Aspects are user-defined and project-specific.

Each aspect has:

- A **key**: a unique human-readable slug that identifies it within the vault. The key is used everywhere aspects are referenced.
- An optional **category**: a label for grouping aspects.
- An optional **description**: free-text prose explaining what the aspect means.
- An optional list of **notes**: related note titles.

Aspects are not fragments. They carry no creative content of their own — they are concepts that give structure, although they may contain extensive notes and descriptions.

### Aspect weights

A fragment references aspects through weights. A weight is a value (0–1) expressing how strongly the fragment embodies that aspect. The interpretation is intentionally left to the user:

- A weight of `1` means the fragment is entirely about that aspect.
- A weight of `0.3` might mean the aspect is present but secondary.
- A user may choose always to use `1` or `0`, treating aspects as plain tags. This is valid.

A fragment can carry weights for any number of aspects. Unweighted aspects are absent — there is no implicit zero.

### Arcs

An arc defines how a given aspect should evolve across the sequence. It is a curve — a series of target intensity values from the sequence's start to its end. A rising arc means the aspect should grow stronger as the sequence progresses; a falling arc the reverse; an arc can also peak, valley, or hold flat.

Arcs are user-authored intent, not computed output. The user defines what shape they want; the fitting score tells them how close reality is.

Each arc belongs to one aspect. An aspect without an arc has no intensity target — its fragments are placed freely from a structural standpoint.

### Fitting score

The fitting score measures how well a fragment's aspect weights match the arc targets at its current position in the sequence. A high score means the fragment's aspects align well with the intended arc shape at that point; a low score means they diverge.

The fitting score is advisory. The user may ignore it, and may intentionally place fragments that score poorly for creative reasons. The score's primary purpose is to support the placement engine (semi-automatic and automatic placement modes) and to surface structural tension in the overview.

Fitting scores depend on arc data and sequence position. They are derived — not authored — and can be recomputed at any time from the sequence and arc definitions.

### Aspect weights without aspect entities

A fragment may reference an aspect that does not really exist as an entity in the project. This is fine, but maskor should notify the user and suggest that the user creates an aspect entity (with a description), or delete the weighted value from the fragments.

---

## Constraints

- Aspect keys are unique within a vault.
- Fragment weights reference aspects by key. Key is the only join field — no UUID reference.
- Orphaned aspect keys in fragment files must be preserved on save, never dropped silently.
- Arc positions (where a fragment sits on an arc at its sequence index) and fitting scores are not stored in vault files. They are derived at runtime and can be lost if the DB is wiped.
- An arc controls intensity/amount only. Frequency and pattern are interleaving's concern.

---

## Prior decisions

- **Aspect key as join field, not UUID**: Fragment inline fields use a human-readable key so they remain legible in vault markdown and compatible with Obsidian's Dataview syntax. UUID-based joins would be opaque in raw files.
- **Orphaned keys preserved on save**: Maskor never auto-rewrites fragment files. Key drift is surfaced as a sync warning, not silently repaired. This protects user content from unintended modifications.
- **Description is vault-only, not indexed in DB**: The aspect description is stored only in the vault file body. List endpoints return aspects without descriptions. A single-get reads the vault file and returns the full aspect including description.
- **Aspect delete is a hard delete**: Deleting an aspect unlinks the vault file and soft-deletes the DB row. Fragment weights for that key become orphaned but are preserved. Aspects are structural labels, not creative content, so no `discarded/` concept applies.
- **Arc positions and fitting scores are DB-only**: These are computed values, not user-authored. They live in the DB and can be reconstructed by re-running the sequencer.

---

## Open questions

- [ ] 2026-04-26 — What does the arc curve look like concretely? Is it a fixed-length array (one value per position), a sparse list of control points that gets interpolated, or something else? What range of values does it use (0–1 matching weight, or something else)?
- [ ] 2026-04-26 — Is the arc ↔ aspect relationship strictly 1:1, or can an aspect have no arc? Can multiple aspects share one arc?
- [ ] 2026-04-26 — Where are arcs stored? They are user-authored intent, which suggests vault files — but project-config is also plausible. DB-only seems wrong for something the user defines.
- [ ] 2026-04-26 — Do arcs apply project-wide, or per-sequence? A project with multiple sequences may need different arc curves per sequence.
- [ ] 2026-04-26 — Should the spec use "weight" (matching the codebase) or "intensity" (matching product language in early docs)? The distinction between "weight" (fragment embodies an aspect) and "intensity" (arc's target value at a position) may be worth preserving as two distinct terms.
- [ ] 2026-04-26 — How is the fitting score calculated? Per-aspect distance from arc target, then aggregated? What happens when a fragment has no weight for an aspect that has an arc?
- [ ] 2026-04-26 — Who creates arcs — does the user create them explicitly, or does Maskor auto-generate one per aspect? Can the sequencer produce arc definitions by analysing an existing arrangement?

---

## Acceptance criteria

- A user can create, view, and delete aspects within a project.
- A fragment can be assigned a weight for any aspect; the weight is stored in the fragment file and survives a full sync cycle.
- If an aspect key referenced by a fragment is deleted or renamed, the fragment file is not modified; a sync warning is produced instead.
- An arc can be defined for an aspect, expressing a target intensity curve.
- A fitting score is computable for any fragment at a given sequence position, given arc definitions.
- A fragment with no weight for an aspect that has an arc produces a defined score (not an error).
- Fitting scores are not required to place a fragment — the user can place fragments freely and ignore scores entirely.
