# Review: Shuffle — random sequence generation under ordering constraints

**Date**: 2026-07-11
**Status**: Resolved
**Scope**: `packages/sequencer`, `packages/shared`, `packages/api`, `packages/frontend`
**Plan**: `references/plans/shuffle-sequence.md`
**Spec**: `specifications/sequencer.md`

---

## Overall

Solid, well-tested implementation that matches the plan and ADR 0016. The reusable seam is real: one constraint-graph builder feeds both violation/cycle detection and the new linear-extension engine; RNG is injected and pure; the generator throws a typed error that maps cleanly to 409 with nothing written. No correctness bugs found — the sequencer and shared suites pass (16/16), and the API/frontend flows are covered. Findings below are design considerations and minor notes, not defects.

---

## Bugs

None.

---

## Design

### 1. `active: true` + partial constraint selection can spawn immediate cycles/violations

`packages/sequencer/src/index.ts:851` (generated `active: true`) combined with the dialog letting the user *deselect* active secondaries (`ShuffleSequenceDialog.tsx:78`).

The generated sequence is a valid linear extension of the **chosen** constraints only. But it is written `active: true` and totally orders every fragment. If the user unchecks an active secondary before shuffling, the new active sequence can contradict that still-active secondary on some pair — producing a fresh cycle/violation in the Overview the moment it lands.

```
active secondaries {A, B} → user unchecks B, shuffles honoring A only
→ generated totally orders all fragments, may reverse a B pair
→ {generated, B} both active → overview shows a 2-cycle
```

Not wrong per the plan (it honors what was chosen), but the default-active choice means "generate" can immediately introduce the very conflict state the feature guards against at generation time. Worth confirming this is intended, or landing the generated sequence inactive.

### 2. Logged seed does not alone reproduce the run

`generate-shuffle-sequence.ts:44` logs `seed`; the log-entry comment (`action.ts`) frames it as "logged only so a run can be reproduced later." Reproduction also requires the identical fragment-universe iteration order (from the index summary order) and the identical constraint set — the seed alone is insufficient. The code hedges ("if reproducibility is ever surfaced"), so this is a documentation-accuracy note: if reproducibility is ever built, the universe ordering must be captured too.

---

## Minor

### 3. Braceless single-line `if` bodies in new code

`packages/sequencer/src/index.ts:272,278,789,808`, `generate-shuffle-sequence.ts:16` — e.g. `if (match) highest = Math.max(...)`. Contradicts `CODING_STANDARDS.md` ("Explicit braces on all `if` bodies"), but matches the prevalent existing style in `index.ts` (lines 397/402/406/428 predate this change). Consistent with the file; flagged only because the written standard and the file's actual style disagree.

### 4. Double sequence read in the command

`generate-shuffle-sequence.ts:33-38` — `readAll` (for name collision scan) plus a per-constraint `.read`. Fine and correct; a tiny redundancy if `readAll` already carries the ordering needed. Acceptable as-is.

### 5. 404 path declared but untested

The route declares `404` for a missing constraint sequence, but no test exercises a bogus `constraintSequenceIds` entry. Low risk (relies on `sequences.read` throwing like clone/insert), but the mapping is unverified.

---

## Non-issues

- **`instanceof ShuffleConstraintCycleError` across package boundary** (`errors.ts:96`) — single class from `@maskor/sequencer`, mirrors the working `SequenceReadOnlyError` mapping.
- **Created-sequence detection via closured `existingUuids`** (`ShuffleSequenceDialog.tsx:105`) — the memo is captured at click time and predates the new uuid, so the diff-against-known-set is reliable even if the parent refetches mid-await.
- **Contradiction through a discarded/out-of-universe fragment does not throw** — cycle detection runs on the universe-restricted graph by design (tested), so A↔D via discarded D is not a cycle among survivors.
- **Universe = all non-discarded fragments**, including fragments only ever placed in main — intended "place every fragment" semantics per the plan.
- **Swap-remove pop in the Kahn loop** (`index.ts:797`) — deliberately unbiased random selection; comment explains it avoids insertion-order bias.

---

## Resolution

1. **Fixed.** `generateShuffledSequence` now returns `active: false` (`index.ts:839`). A fresh shuffle lands inactive — a candidate the user activates deliberately — so it can never silently join the active constraint set and manufacture a conflict against an unchosen active secondary. Plan, ADR 0016, and `sequencer.md` updated; sequencer + API tests flipped to assert `active: false`.
2. **Fixed.** The `seed` log-entry comment (`action.ts`) now states plainly that the seed alone does not reproduce a run (it also needs the same universe order and constraint set); it is a forensic breadcrumb kept for possible future reproducibility.
3. **Not a defect (standard clarified).** The braceless `if`s are all single short statements on the same line as the condition, which `CODING_STANDARDS.md` now explicitly permits (updated to allow a same-line short body; only newline-split braceless bodies are disallowed). No code change.
4. **Won't fix.** The double read in the command is correct and negligible; not worth the churn.
5. **Fixed.** Added an API test asserting a bogus `constraintSequenceIds` entry returns `404` and creates nothing (`sequences.test.ts`).

Full `bun run verify` green after the changes (backend 1187, frontend 978).
