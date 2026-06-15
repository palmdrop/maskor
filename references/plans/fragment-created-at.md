# Fragment createdAt + "Created at" sort

**Date**: 15-06-2026
**Status**: Todo
**Specs**: `specifications/fragment-model.md`

---

## Goal

Every fragment carries a durable `createdAt` timestamp, sourced frontmatter-first with a one-time filesystem-birthtime bootstrap, and the FragmentListPage sort dropdown offers a working "Created at" option alongside Name / Updated at / per-sequence order.

---

## Tasks

### Phase 0 — Branch

- [ ] Create branch `fragment-created-at` from the plan title.

### Phase 1 — Domain + mapper + birthtime sourcing

The crux of the feature. `createdAt` becomes a managed frontmatter key, round-tripped through the markdown mapper, with a fallback chain for files that predate the key.

- [ ] Add `createdAt: z.date()` to `FragmentSchema` (`packages/shared/src/schemas/domain/fragment.ts`).
- [ ] Add `"createdAt"` to `MANAGED_FRONTMATTER_KEYS` in the fragment mapper (`packages/storage/src/vault/markdown/mappers/fragment.ts`) so it is not treated as user `extraFrontmatter`.
- [ ] `toFile`: serialize `createdAt` as an ISO string (mirror the existing `updatedAt` handling).
- [ ] `fromFile`: resolve `createdAt` via the fallback chain **frontmatter → file birthtime → updatedAt → now**. `fromFile` is sync and IO-free today, so birthtime cannot be statted inside it — pass an optional birthtime argument in from the reader (see next task) and apply the chain there.
- [ ] Reader (`packages/storage/src/vault/markdown/vault.ts`): stat the fragment file (the reader already holds a `Bun.file(absolutePath)` handle) and pass its birthtime into `fragmentMapper.fromFile` at each fragment call site. This adds one `stat` per fragment on a full rebuild — acceptable, since rebuild already reads every file.
- [ ] Confirm the bootstrap-only property in a test: a fragment whose frontmatter lacks `createdAt` reads back with the birthtime value, and the next `toFile`/save writes `createdAt` into frontmatter so birthtime is never consulted again.
- [ ] Tests: mapper round-trip with `createdAt` present; fallback chain when absent (birthtime, then updatedAt, then now); `extraFrontmatter` still excludes `createdAt`.
- [ ] `git commit`.

### Phase 2 — Stamp at creation

Every command that mints a brand-new fragment must set `createdAt = new Date()`. Commands that derive from an existing fragment must preserve the original value.

- [ ] `create-fragment.ts`: stamp `createdAt` on the new fragment.
- [ ] `import.ts`: stamp `createdAt` on each imported piece (currently sets `updatedAt` at line ~153).
- [ ] `split-fragment.ts`: stamp `createdAt` on **new pieces only**; the truncated original keeps its existing `createdAt` (identity preservation — `references/adr/0014-identity-preserving-fragment-split.md`).
- [ ] `extract-fragment.ts` and `insert-fragment.ts`: stamp `createdAt` on the newly created fragment(s).
- [ ] `update-fragment.ts`: confirm `createdAt` is preserved (updates merge onto the read fragment, which now carries `createdAt`) — add a regression test asserting an update does not move `createdAt`.
- [ ] Tests for the creation/preservation behavior across these commands.
- [ ] `git commit`.

### Phase 3 — Index layer

Persist `createdAt` in the vault DB so list queries can sort on it without re-reading files.

- [ ] Add a `createdAt` column to `fragmentsTable` (`packages/storage/src/db/vault/schema.ts`), mirroring `updatedAt`. Note: a schema change trips the schema-fingerprint auto-reset path — fine, the index re-derives from markdown on next rebuild.
- [ ] Thread `createdAt` through the assembler (`packages/storage/src/indexer/assemblers.ts`) and the fragment upsert (`packages/storage/src/indexer/upserts.ts`).
- [ ] Add `createdAt` to the `IndexedFragment` type.
- [ ] Tests: indexed fragment exposes `createdAt`; rebuild populates it.
- [ ] `git commit`.

### Phase 4 — API response + codegen

- [ ] Add `createdAt` to the fragment response schema (`packages/api/src/schemas/fragment.ts`) and any list/detail response that already exposes `updatedAt` (`packages/api/src/routes/fragments.ts`).
- [ ] Run `bun run codegen` from the repo root (refreshes the OpenAPI snapshot + orval client).
- [ ] Confirm `bun run verify` passes (snapshot in sync with routes).
- [ ] `git commit`.

### Phase 5 — Frontend sort option

- [ ] Add a `createdAt` comparator / sort-mode to `packages/frontend/src/lib/fragments/sort.ts` (mirror the `updatedAt` mode, including `encodeSortMode`/`parseSortMode` handling).
- [ ] Add the "Created at" `SelectItem` to the FragmentListPage sort dropdown (`packages/frontend/src/pages/FragmentListPage.tsx`), next to "Updated at".
- [ ] Tests: sort comparator orders by `createdAt`; persisted sort value round-trips.
- [ ] `git commit`.

### Phase 6 — Close out

- [ ] Set this plan's Status to `Done` and add a `Shipped` entry to `specifications/fragment-model.md`.
- [ ] Remove the (already-deleted) `createdAt` line from `references/suggestions.md` if it has been re-added.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Specific coverage to ensure: mapper round-trip + fallback chain (frontmatter → birthtime → updatedAt → now); birthtime is bootstrap-only (persists to frontmatter after first save); `createdAt` preserved across `update-fragment` and across `split-fragment` for the truncated original; index assembler/upsert carries `createdAt`; frontend sort comparator + persisted sort-mode round-trip.

## Notes

Design decisions already settled (do not re-litigate during implementation):

- **Frontmatter is the durable source; birthtime is a one-time bootstrap.** Filesystem birthtime is fragile across vault copies/syncs, so it is consulted only when frontmatter lacks `createdAt`. The first save after a fallback persists `createdAt` to frontmatter, after which birthtime is irrelevant.
- **Fallback chain order: frontmatter → file birthtime → updatedAt → now.** The final two are defensive (a stat that fails or a vault without birthtime support still yields a sensible value).
- **`fromFile` stays pure; the stat happens at the reader.** Do not make the mapper do IO — pass birthtime in.

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
