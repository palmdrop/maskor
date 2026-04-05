---
name: Recurring type anti-patterns in shared package
description: Known structural issues in packages/shared/src/types observed during reviews
type: project
---

Two confirmed critical bugs in domain types as of 2026-04-04:

- `Sequence.uuid` is typed as `SectionUUID` instead of `SequenceUUID` (sequence.ts line 18)
- `ArcUUID` brand string is `"arch"` instead of `"arc"` (arc.ts line 5)

**Why:** Copy-paste errors that pass type-checking silently because brands are just strings.

**How to apply:** Flag any new sequence or arc related code until these are fixed. Do not assume UUID brands are correct — verify them on each review.

Structural issue: `Fragment` type mixes markdown-owned fields with DB-only fields (`contentHash`, `updatedAt`) in a single type. The storage layer has to fabricate values for DB-only fields when constructing from a file. A `FragmentFile` / `Fragment` split is the intended fix.

`apis/aspects.ts` is exported but blank — any review touching the aspects API should note this.

`Action` type mixes data fields with executable functions (`execute`, `revert`) — will break if actions are ever serialized.

`project.ts` has `archUUIDs: Arc[]` — should be `arcUUIDs: Arc[]`. Pre-existing typo, noted in 2026-04-05 review.
