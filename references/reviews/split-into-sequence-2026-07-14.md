# Review: Split into a new sequence

**Date**: 2026-07-14
**Status**: Resolved <!-- Open | Partially addressed | Resolved — the work board reads this -->
**Scope**: `packages/api`, `packages/shared`, `packages/frontend`
**Plan**: `references/plans/split-into-sequence.md`
**Spec**: `specifications/fragment-split.md`, `specifications/sequencer.md`

---

## Overall

Solid, faithful to the plan. The opt-in secondary-sequence path reuses the split command's existing Phase A/B/C structure correctly: the name is validated in Phase A (nothing written on reject) and the sequence write degrades to a warning in Phase C. Ordering, flags (`isMain: false`, `active: true`, no `origin`), and the folded action-log payload all match the spec. Tests cover the meaningful branches (created/omitted/rejected/failed/logged/unplaced) on the backend and the checkbox → input → confirm → toast flow on the frontend. All 93 backend + 14 frontend tests pass; OpenAPI snapshot is in sync.

The shared `validateSequenceName` extraction is a good call — it closes a pre-existing gap where a whitespace-only name slipped past the route schema's `min(1)` into `createSequence`/`updateSequence`. No behavior-breaking bugs found.

---

## Bugs

None.

---

## Design

None.

---

## Minor

### 1. Rename guard compares the raw name, writes the trimmed name

`packages/api/src/commands/sequences/update-sequence.ts:27` — the guard `patch.name !== indexed.name` tests the untrimmed patch value, but the block then writes `resolveSequenceName(patch.name)` (trimmed). Renaming a sequence to a whitespace-padded version of its current name enters the block, writes an identical name, and records a spurious `sequence:renamed` log entry with `oldKey === newKey`.

```
indexed.name = "Foo", patch.name = " Foo "
  " Foo " !== "Foo"  → true → enters block
  newName = resolveSequenceName(" Foo ") = "Foo"
  writes { ...reread, name: "Foo" }   // no-op write
  logs sequence:renamed { oldKey: "Foo", newKey: "Foo" }   // spurious
```

Fix: resolve the name first, then compare the resolved name against `indexed.name` (skip the write + log when they are equal).

### 2. `=== 0` length check in the new helper

`packages/shared/src/utils/validate-sequence-name.ts:8` — `if (trimmed.length === 0)` is the `=== 0` form the coding standard says to write as `if (!trimmed.length)`. It mirrors `validateEntityKey`, which uses the same `=== 0` (predating the standard), so the two are at least locally consistent. Worth aligning both to `!trimmed.length` if touched, so the standard holds and the siblings stay identical.

---

## Non-issues

- **Sequence built inline in the split command, not via `createSequenceCommand`** — intentional. The plan folds the creation into the single `fragment:split` action-log entry (optional `createdSequenceUuid`/`createdSequenceName`) with no separate `sequence:created` entry, and `createSequenceCommand` returns an `IndexedSequence` + emits its own log entry. Inlining avoids both.
- **`active: true` on the created secondary** — deliberate deviation from the shuffle precedent (ADR 0016), reasoned in the plan and spec: the split inserts the pieces contiguously right after the original in every sequence, and the new pieces exist nowhere else, so the ordering constraint is satisfied by construction — no violation is manufactured against the main sequence at creation time.
- **No name-uniqueness guard on the created sequence** — matches existing behavior; sequence names are not unique today, and the plan explicitly declines to introduce uniqueness here.
- **Sequence-write-failure test asserts exactly one warning** — the test uses a freshly written, unplaced original, so the Phase C placement loop finds no sequence to write and only the new-sequence write fails. Valid.
- **`throwSequenceNameOrStorageError` shared by create + update** — maps `SequenceNameInvalidError` → 400 `SEQUENCE_NAME_INVALID` before falling through to `throwStorageError`, so the existing 409 conflict mapping is unchanged.

---

## Resolution

1. **Fixed** — `update-sequence.ts` now resolves/trims the name first (still rejecting a blank name with `SequenceNameInvalidError`), then compares the resolved name against `indexed.name`; the write + `sequence:renamed` log entry only happen when they genuinely differ. A padded-but-equal rename records no log entry and performs no write. Added a route test (`records no rename log entry when the new name only differs by surrounding whitespace`) in `packages/api/src/__tests__/routes/sequences.test.ts`.
2. **Fixed** — replaced `trimmed.length === 0` with `!trimmed.length` in both `validate-sequence-name.ts` and the sibling `validate-entity-key.ts`, aligning both mirrored helpers to the coding standard.

---
