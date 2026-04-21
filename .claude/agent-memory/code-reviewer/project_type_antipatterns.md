---
name: Recurring type anti-patterns in shared package
description: Known structural issues in packages/shared/src/types observed during reviews
type: project
---

Confirmed bugs as of 2026-04-04 (updated 2026-04-21):

- `Sequence.uuid` typed as `SectionUUID` instead of `SequenceUUID` (sequence.ts:18)
- `ArcUUID` brand string is `"arch"` not `"arc"` (arc.ts:5)
- `project.ts` has `archUUIDs: Arc[]` — should be `arcUUIDs` (typo, noted 2026-04-05)
- `Fragment.contentHash` is required but POST handlers set it to `""` — latently broken if watcher uses it for change detection (noted 2026-04-06)
- `Fragment` mixes markdown-owned fields with DB-only fields (`contentHash`, `updatedAt`) — `FragmentFile`/`Fragment` split is the intended fix
- `apis/aspects.ts` exported but blank — flag any aspects API review
- `Action` type has `execute`/`revert` function fields — will break on serialization
- `onSubmit: (update: Partial<Fragment>)` used instead of `onSubmit: (update: FragmentUpdate)` in `FragmentMetadataForm` — `as FragmentUpdate` cast in caller silences the mismatch (noted 2026-04-20)
- `ProjectSchema` in shared (post-zod-first refactor) has no `createdAt`/`updatedAt` — API layer builds ProjectSchema independently, breaking the "domain is base" invariant for this entity (noted 2026-04-21)
- `AspectCreateSchema` in API adds `.default([])` to `notes`, making it optional at API layer while domain schema requires it — silent semantic divergence (noted 2026-04-21)

**Why:** Copy-paste errors and mixed-concern types that pass type-checking silently.

**How to apply:** Flag sequence/arc UUID brands on each review. Don't assume brands are correct — verify them. Check callback prop types match the domain type, not a broader Partial<> version.
