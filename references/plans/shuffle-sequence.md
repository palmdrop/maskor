# Shuffle — random sequence generation honoring ordering constraints

**Date**: 11-07-2026
**Status**: Done
**Specs**: `specifications/sequencer.md`, `specifications/interleaving.md`

<!-- Decisions captured in specifications/_glossary.md (Shuffle, Ordering constraint) and references/adr/0016-shuffle-first-slice-of-automatic-placement.md -->

---

## Goal

> A user can generate a new, non-main secondary sequence that places **all non-discarded fragments** in a random flat order which **strictly honors** the relative ordering of a chosen set of secondary sequences. Contradictory chosen constraints abort the run with a reported conflict; nothing is overwritten.

Done = a "Shuffle" affordance in the Overview produces a fresh secondary sequence that is always a valid random linear extension of the chosen constraint DAG, verified by tests, with no user-facing seed.

---

## Design anchors

- **Glossary**: `Shuffle`, `Ordering constraint` (already written).
- **ADR**: `references/adr/0016-shuffle-first-slice-of-automatic-placement.md` — shuffle is the first slice of the specced `automatic` placement mode; ordering constraints are hard-enforced by construction; constraint sources are pluggable; RNG is injected; output is always a fresh non-main sequence.
- **Reuse directive**: build the constraint-source and linear-extension machinery as reusable primitives so the future scored automatic placer, and other features, consume the same seam. Concretely: the generation entry point takes a **set of ordering constraints** and an **injected RNG + scorer**, with "random" being the degenerate scorer today.

---

## Tasks

### Phase 1 — Reusable sequencer primitives (`@maskor/sequencer`, `@maskor/shared`)

> **Completed 2026-07-11** on the existing `agent/random-sequences` worktree/branch (the branch task below was dropped — minting `agent/shuffle-sequence` inside this worktree would fight the board's `branch = agent/<worktree-stem>` convention). All phases done; `bun run verify` green (978 tests). One unplanned fix: added `useGenerateSequence` to the partial module mocks in `SequenceSidebar.test.tsx` and `OverviewPage.test.tsx` (they render the sidebar, which now mounts the dialog).

- [-] Create branch `agent/shuffle-sequence` from the plan title. _(dropped — worked on the existing `agent/random-sequences` worktree/branch instead; see note above)_
- [x] Add a **seeded RNG primitive** in `@maskor/shared` _(2026-07-11)_ (small deterministic PRNG, seed → number stream). Pure, no IO. This is the reusable randomness source for shuffle now and noise/suggestion-mode later.
- [x] Expose the **constraint-graph builder as a reusable primitive**: `buildConstraintGraph` / `getFragmentOrder` are currently private to `packages/sequencer/src/index.ts`. Extract the DAG-from-secondaries logic into a named, exported primitive that returns ordering edges for a given set of sequences, so both `computeViolations`/`detectCycles` **and** the new generator consume one implementation (no second graph builder).
- [x] Add a **linear-extension engine**: a pure function that, given ordering edges + a fragment universe + an injected RNG, produces a random topological order (seeded Kahn — at each step pick uniformly at random among fragments whose predecessors are all placed). Fragments absent from the universe are skipped; transitive edges among survivors are preserved (already a property of the all-pairs graph builder).
- [x] Add the **generation entry point** `generateShuffledSequence` (pure): inputs = `projectUuid`, `name`, `fragmentUuids` (universe), chosen `constraintSequences`, injected `random`. It runs cycle detection over the chosen constraints (reuse `detectCycles`) and **throws a typed `ShuffleConstraintCycleError`** carrying the offending cycles if any exist; otherwise returns a fresh `Sequence` — `isMain: false`, `active: true`, single default section holding the flat linear extension. Shape the signature so a future `scorer` parameter slots in beside `random` without breaking callers (random = degenerate scorer).
- [x] Tests: valid linear extension always honors every chosen chain; unconstrained fragments appear in varied orders across seeds; discarded/out-of-universe fragments in a chain are skipped with transitive order kept; contradictory constraints throw `ShuffleConstraintCycleError` with the right cycle payload; empty constraint set → pure shuffle of all fragments.
- [x] `git commit`.

### Phase 2 — API surface (`@maskor/api`)

- [x] New command `src/commands/sequences/generate-shuffle-sequence.ts` (mirror `clone-sequence.ts`): gather the universe (`storageService.fragments.list`, exclude `isDiscarded`), load the chosen constraint sequences, generate a seed, call `generateShuffledSequence` with a seeded RNG, `sequences.write` then `read` the result. Emit a `sequence:shuffled` action-log entry recording the chosen constraint sequence uuids and the internal seed (seed is log-only, never surfaced).
- [x] Add the `sequence:shuffled` label to `src/commands/command-labels.ts` and export the command from `src/commands/index.ts`.
- [x] New route `POST /sequences/generate` in `src/routes/sequences.ts` (input: chosen constraint sequence ids + optional name). Map `ShuffleConstraintCycleError` → `409 { reason: "constraint_cycle", cycles }`, mirroring the existing `sequence_read_only` reason mapping in `schemas/error.ts` / `throwStorageError`.
- [x] Default the constraint selection server-side to nothing implicit — the request carries the explicit chosen set; the **frontend** supplies the active-secondaries default (Phase 3). Main sequence and the (not-yet-created) target are never selectable as constraints.
- [x] `bun run codegen` (refresh OpenAPI snapshot + orval client), commit the regenerated `openapi.json` and generated client.
- [x] Tests: route returns a new non-main sequence; cycle request → 409 `constraint_cycle`; discarded fragments excluded from the universe; action-log entry shape.
- [x] `git commit`.

### Phase 3 — Frontend (`@maskor/frontend`)

- [x] Add a **Shuffle** command (`overview:shuffle-sequence`) in `src/lib/commands/scopes/sequence-sidebar.ts` and a **sidebar-level button** (a top-of-list "Shuffle" affordance beside "New sequence", not a per-row ⋯ item — it mints a sequence).
- [x] Constraint-picker **dialog**: checklist of non-main sequences, **pre-checked = currently-active secondaries**, import-sequences listed but unchecked; selection is ephemeral (does not touch stored `active`). Confirm → call the generate mutation → navigate to the new sequence in the Overview.
- [x] Handle the `409 constraint_cycle` response: surface the conflicting sequences/fragments to the user (reuse the existing cycle/violation reporting surface) rather than a generic toast; create nothing.
- [x] Tests: dialog pre-checks the active set; successful generate navigates to the new sequence; cycle response renders the conflict.
- [x] `git commit`.

### Phase 4 — Documentation alignment

- [x] Rephrase the seed/determinism language in `specifications/sequencer.md`: scope the "same seed → identical output" acceptance criterion and the "Deterministic placement with seeded noise" prior decision to the **future scored** automatic placer; state that the shuffle slice is intentionally **non-reproducible from the user's side** (internal seed logged only).
- [x] Update `specifications/sequencer.md` placement-modes / behavior sections to record that constraint enforcement is now **hard** for the shuffle path (first enforcement point), cross-referencing ADR 0016 — the advisory `computeViolations` path is unchanged.
- [x] Note in `specifications/interleaving.md` / `specifications/aspect-arc-model.md` that arc and interleaving scoring are **future constraint/scoring sources** that plug into the same generation entry point (no work now — a pointer so the seam is discoverable).
- [x] Add the shipped entry to `specifications/sequencer.md` **Shipped** frontmatter (feature-level, no implementation detail).
- [x] `git commit`.

### Phase 5 — Close out

- [x] `bun run format`, then `bun run verify`; fix lint/test/openapi drift.
- [x] Set this plan's Status and update spec frontmatter.
- [x] Final `git commit`.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Key properties to assert: every chosen chain is honored in the output (hard constraint); different runs yield different orders for unconstrained fragments; contradictory constraints abort with a reported cycle and produce nothing; discarded and out-of-universe fragments are handled per plan; the pure op is deterministic under a fixed injected seed (testability despite the product being "random").

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`, and update the relevant spec frontmatter (`Shipped`) — feature-level, no granular tasks.

Surprises noticed while planning (per project convention): `references/adr/` has a duplicate `0014-*` number (`0014-identity-preserving-fragment-split.md` and `0014-placement-modal-becomes-active-fragment-arranger.md`); left as-is, flagged for the developer.
