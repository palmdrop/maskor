# Split into sequence

**Date**: 14-07-2026
**Status**: Done
**Specs**: `specifications/fragment-split.md`, `specifications/sequencer.md`
**Branch**: agent/split-into-sequence

---

## Goal

When splitting a fragment, the user can opt to also create a **new secondary sequence** containing all resulting pieces (piece 1 = the original, then pieces 2…N) in split order — preserving their relative order as an ordering constraint usable by the violation detector and the shuffle generator, while the pieces themselves can be scattered anywhere in the main sequence.

---

## Design decisions

- **Opt-in via the split dialog.** A checkbox in `SplitFragmentDialog` ("Add pieces to a new sequence"), default **unchecked**, revealing an editable name input pre-filled with `<original key> split`. Non-empty name required to confirm when checked. _(Amended 2026-07-14 post-review: the default is now the original fragment's key verbatim, and the trim/non-empty rule moved into a shared `validateSequenceName` helper also enforced on sequence create/rename.)_
- **The new sequence is a plain user-authored secondary sequence.** `isMain: false`, no `origin` (an `origin` would make it read-only per ADR 0014 — we want the user to be able to edit it afterwards). One section ("Main") holding all pieces in split order: original first, then pieces 2…N.
- **`active: true`.** Deliberate deviation from the shuffle precedent (which lands inactive, ADR 0016). Rationale: shuffle generates a *candidate arrangement* that would manufacture conflicts against unchosen active secondaries; here the user explicitly asks for an ordering constraint, and the split's own placement invariant (new pieces inserted contiguously right after the original in every sequence) means the constraint is satisfied by construction at creation time — no manufactured violation. Matches the "user-authored secondaries default active" rule in `specifications/sequencer.md`.
- **Server-side, inside the split command — not a second frontend call.** Extend `SplitFragmentInput` with optional `intoSequence?: { name: string }`. A follow-up frontend call could fail after the split committed and silently drop the sequence; the command's Phase C warnings pattern already handles exactly this.
- **Phase placement.** Name validation (trim, non-empty; reuse whatever validation `createSequence` applies) runs in **Phase A** (nothing written on reject). Sequence creation + placement runs in **Phase C**: the split's core writes are the essence; a failed sequence write surfaces as a warning on the 200 result ("The pieces could not be added to a new sequence…"), consistent with placement/Margin migration failures.
- **Action log.** No separate `sequence:created` entry — the single `fragment:split` entry gains optional `createdSequenceUuid` + `createdSequenceName` payload fields, mirroring how per-placement entries are already folded into it.
- **No duplicate-name guard beyond what sequences already have.** Sequence names are not unique today; do not introduce uniqueness here.

Out of scope: adding pieces to an *existing* sequence (the arranger/quick-add covers that), any interleaving semantics, and hard enforcement changes — the created sequence participates exactly like any hand-made secondary.

---

## Tasks

### Phase 1 — backend

- [x] Branch `agent/split-into-sequence` already exists (this worktree) — work directly on it.
- [x] Extend `splitFragmentCommand` (`packages/api/src/commands/fragments/split-fragment.ts`): accept optional `intoSequence: { name: string }`; validate the name in Phase A; in Phase C build and write the new sequence (fresh UUIDs, `isMain: false`, `active: true`, single "Main" section with the original + created pieces in order, positions 0…N-1); collect a warning on failure; add `createdSequenceUuid`/`createdSequenceName` to the `fragment:split` payload and to `SplitFragmentResult`.
- [x] Update the split route + request/response schemas (`packages/api/src/schemas/…`, route in `routes/fragments.ts`) for the new optional input and result fields.
- [x] API tests (`packages/api/src/__tests__/commands/split-fragment.test.ts` or sibling): sequence created with correct order/flags; omitted `intoSequence` creates nothing (existing behavior unchanged); invalid/empty name rejects in Phase A with nothing written; sequence-write failure yields warning + intact split; action-log payload carries the sequence fields; original unplaced everywhere still lands in the new sequence.
- [x] `bun run codegen` (refresh OpenAPI snapshot + orval client). Commit.

### Phase 2 — frontend

- [x] `SplitFragmentDialog`: checkbox + name input (pre-filled `<original key> split`, needs the original's key — available from the preview's piece 1), gate `canConfirm` on non-empty name when checked, send `intoSequence` when checked, reset state on close. Sequence-query invalidation already happens post-split.
- [x] Surface the created sequence in the success path (existing warning-toast pattern covers the failure side; a simple success toast naming the sequence is enough — no navigation).
- [x] Frontend tests (`SplitFragmentDialog.test.tsx`): checkbox reveals input with derived default; confirm sends `intoSequence`; unchecked sends none; empty name blocks confirm.
- [x] Commit.

### Phase 3 — close out

- [x] Update `specifications/fragment-split.md`: Shipped entry, Scope (in scope), Behavior (Commit section), acceptance criteria. Cross-reference from `specifications/sequencer.md` only if wording there needs it (secondary-sequence sources).
- [x] Tick the TODO item in `references/TODO.md`.
- [x] `bun run format` then `bun run verify`; fix fallout. Commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Key behaviors to pin: piece order in the created sequence equals split order with the original first; `active: true`, `isMain: false`, no `origin`; Phase A rejection writes nothing; Phase C failure degrades to a warning without failing the split.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check of the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
