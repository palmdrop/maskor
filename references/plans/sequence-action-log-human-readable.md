# Sequence action log: human-readable names

**Date**: 17-05-2026
**Status**: Todo
**Specs**: `specifications/action-log.md`, `specifications/sequencer.md`

---

## Goal

> `sequence:fragment-placed`, `sequence:fragment-moved`, and `sequence:fragment-unplaced` log entries include the sequence name in `target.title` and the fragment key in `payload.fragmentKey`, so the action log renders human-readable descriptions instead of bare UUIDs.

---

## Tasks

### Phase 1 — Extend command input types

- [ ] Add `fragmentKey: string` and `sequenceName: string` to `PlaceFragmentInput` in `packages/api/src/commands/sequences/place-fragment.ts`
- [ ] Add `fragmentKey: string` and `sequenceName: string` to `MoveFragmentInput` in `packages/api/src/commands/sequences/move-fragment.ts`
- [ ] Add `fragmentKey: string` and `sequenceName: string` to `UnplaceFragmentInput` in `packages/api/src/commands/sequences/unplace-fragment.ts`

### Phase 2 — Populate log entry fields in commands

- [ ] In `placeFragmentCommand.execute`: set `target: { type: "sequence", uuid: sequenceId, title: sequenceName }` and `payload: { fragmentUuid, fragmentKey }`
- [ ] In `moveFragmentCommand.execute`: same target and payload shape
- [ ] In `unplaceFragmentCommand.execute`: same target and payload shape

### Phase 3 — Pre-fetch in route handlers

- [ ] In `placeFragmentRoute` handler (`packages/api/src/routes/sequences.ts`): read the sequence via `storageService.sequences.read(projectContext, sequenceId)` and the fragment via `storageService.fragments.read(projectContext, fragmentUuid)` before calling `executeCommand`; pass `sequence.name` and `fragment.key` into the command input
- [ ] In `moveFragmentRoute` handler: same pre-fetches
- [ ] In `unplaceFragmentRoute` handler: same pre-fetches

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

Mirror the established pattern from `packages/api/src/routes/fragments.ts` (discard, delete, restore handlers), which pre-fetch the fragment before calling `executeCommand` to supply the key for log entries.

The sequence is also read inside each command for the mutation itself — the route pre-fetch is a second read done purely to supply log metadata. This duplication is intentional and consistent with the existing pattern.

DO NOT IMPLEMENT until clearly stated by the developer.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented. ALSO, update the relevant specs `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks here.
