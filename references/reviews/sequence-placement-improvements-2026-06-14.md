# Review: Sequence placement improvements

**Date**: 2026-06-14
**Scope**: `packages/sequencer`, `packages/api`, `packages/frontend`, `packages/shared`
**Plan**: `references/plans/sequence-placement-improvements.md`
**Spec**: `specifications/sequencer.md`, `specifications/overview.md`

---

## Overall

The implementation matches the plan across all six phases and the affected suites are green (sequencer 93, API sequence routes 56, affected frontend suites 258). The robustness core — import-sequences read-only — is enforced at the sequencer/command layer (`assertSequenceMutable`) and surfaced as `409 { reason: "sequence_read_only" }`, not just hidden in the UI, with exhaustive backend coverage. No bugs found. The only real finding is a deliberate-but-driftable duplication of the `isSequenceReadOnly` predicate across the package boundary (item 1), addressed in this pass.

---

## Bugs

None.

---

## Design

### 1. `isSequenceReadOnly` duplicated across packages

`packages/sequencer/src/index.ts:21` and `packages/frontend/src/lib/sequences/readOnly.ts:8` — the same `origin !== undefined` predicate was implemented twice, once per `Sequence` type (the `@maskor/shared` domain type vs the orval-generated schema type). The frontend copy carried a comment acknowledging the mirror. Two copies of a security-relevant rule is a drift risk: a future change to what "read-only" means (e.g. a second condition) must be made in both, and nothing enforces parity.

Fix: lift the predicate to `@maskor/shared` (where the `Sequence` type already lives) as a single source of truth, typed structurally (`{ origin?: unknown }`) so both the backend domain type and the generated frontend type satisfy it. Sequencer and the frontend re-export it from there.

**Fixed (2026-06-14):** `isSequenceReadOnly` now lives in `packages/shared/src/schemas/domain/sequence.ts`; `@maskor/sequencer` and `frontend/lib/sequences/readOnly.ts` re-export it. New `packages/shared/src/__tests__/sequence.test.ts` anchors coverage at the source; the existing sequencer + frontend tests still exercise it through the re-export with their own `Sequence` types.

---

## Minor

### 2. Spine keyboard-refocus targets a non-focusable node

`packages/frontend/src/pages/OverviewPage/index.tsx` (refocus effect) — after a keyboard move the effect calls `node?.focus()` on the `[data-fragment-uuid]` element. In the left reorder column that element is the dnd-kit-focusable `ReorderRow` (works). In the prose spine it is the `FragmentProse` `<div>`, which has no `tabIndex`, so `.focus()` is a no-op. Behavior is still correct — the spine routes keys through the scroll container (`overview-main-content`), which keeps focus — so repeated ↑/↓ continue to sort. The code is just misleading: the comment implies the row is refocused on both surfaces.

Fix: clarify the comment to note the spine relies on container focus (the prose blocks are intentionally not focusable), so the `.focus()` is a harmless no-op there.

**Fixed (2026-06-14):** the effect's comment now explains both surfaces — focusable row in the reorder column, container-held focus in the spine. While here, a dead `jsx-a11y/click-events-have-key-events` disable token on the scroll container (now satisfied by its `onKeyDown`) was removed.

---

## Non-issues

- **`origin !== undefined` rather than a truthiness or `!= null` check** — `SequenceOriginSchema` is `.optional()` (not nullable), and the storage assembler only sets `origin` when truthy (`...(row.origin ? { origin } : {})`), so `null` never reaches the domain type. The strict `!== undefined` is correct end-to-end.
- **Arranger "Add to sequence" always targets the first section** (`SequenceArranger.tsx:133`) — the old modal had a section picker on add; the arranger drops it. Intentional per ADR 0014: the arranger is drag-arrange first, so the initial add lands in section one and the user drags from there. Matches the plan ("section management stays Overview-only").
- **All rows draggable, not active-fragment-only** — the plan's optional "active-only draggable" refinement (ADR 0006 intent) was deliberately not taken; ADR 0014 stands and supersedes 0006.
- **`insertSequenceIntoSequence` guards only the target** (`sequencer/src/index.ts:643`) — inserting an import-sequence as a *source* into a writable target is allowed by design (the source is read, never mutated); cloning + source-insert are the documented escape hatches.
- **Frontend mirrors the backend rule instead of relying on it** — the Overview read-only rendering and the picker filter are UX, not enforcement; the backend guard remains authoritative (drag attempts 409 and roll back).
