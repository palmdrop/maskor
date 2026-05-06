# Fragment aspects: rename `properties` and dynamic form

**Date**: 2026-05-06
**Status**: Done
**Specs**: `specifications/fragment-model.md`

---

## Goal

Rename the `properties` field to `aspects` across the entire stack (domain schema, storage, DB, API, frontend), reflect that weights are optional (default 0 — aspects can function as pure tags), then replace the static all-aspects slider list in the fragment metadata form with a dynamic add/remove/weight interface that mirrors the notes and references UX.

---

## Tasks

### Phase 1 — Rename `properties` → `aspects`

- [x] `packages/shared/src/schemas/domain/fragment.ts` — rename field `properties` → `aspects` on `FragmentSchema` and `FragmentUpdateSchema`; rename type `FragmentProperties` → `AspectWeights`; rename `FragmentPropertiesSchema` → `AspectWeightsSchema`; make `weight` optional with default `0` in the value schema
- [x] `packages/storage/src/vault/markdown/mappers/aspect.ts` — rename helpers `propertiesToInlineFields` → `aspectsToInlineFields` and `inlineFieldsToProperties` → `inlineFieldsToAspects`; update type references
- [x] `packages/storage/src/vault/markdown/mappers/fragment.ts` — update import and call sites for the renamed helpers; rename field access `fragment.properties` → `fragment.aspects`
- [x] `packages/storage/src/vault/markdown/init.ts` — rename `properties: {}` → `aspects: {}`
- [x] `packages/storage/src/indexer/assemblers.ts` — rename field `properties` → `aspects`
- [x] `packages/storage/src/indexer/types.ts` — rename field `properties` → `aspects` on `IndexedFragment`
- [x] `packages/storage/src/db/vault/schema.ts` — rename `fragmentPropertiesTable` → `fragmentAspectsTable`; rename SQL table `"fragment_properties"` → `"fragment_aspects"`
- [x] `packages/storage/src/indexer/upserts.ts` — update import and all references from `fragmentPropertiesTable` → `fragmentAspectsTable`; rename `fragment.properties` access → `fragment.aspects`
- [x] `packages/storage/src/indexer/indexer.ts` — update import and all references from `fragmentPropertiesTable` → `fragmentAspectsTable`
- [x] `packages/storage/src/service/storage-service.ts` — update all `fragment.properties` / `updatedProperties` accesses → `aspects`
- [x] Delete `packages/test-fixtures/user-vault/.maskor/vault.db` (and any `.db-shm`/`.db-wal` siblings) — regenerated automatically on next test run
- [x] `packages/api/src/schemas/fragment.ts` — rename field and imported type
- [x] `packages/api/src/routes/fragments.ts` — rename `properties: {}` initializer → `aspects: {}`
- [x] Regenerate the OpenAPI client (`bun run generate` or equivalent) so `maskorAPI.schemas.ts` reflects the renamed field
- [x] Update all storage tests that reference `.properties` (`indexer.test.ts`, `vault.test.ts`, `cascade.test.ts`, `mappers/fragment.test.ts`, `mappers/aspect.test.ts`)

### Phase 2 — Dynamic aspect form

- [x] Change the form's internal schema from `properties: z.record(...)` to `aspects: z.array(z.object({ key: z.string(), weight: z.number() }))` in `fragment-metadata-form.tsx`
- [x] Replace the disabled `useFieldArray` comment block with a working `useFieldArray` for `aspects`
- [x] Update `buildDefaultValues` — convert `Fragment.aspects` record to `{ key, weight }[]`, including only keys that have an entry (not all project aspects); default `weight` to `0` when absent
- [x] Update `buildUpdatePayload` — convert the array back to a record; continue merging with the original `aspects` to preserve unknown keys (existing constraint)
- [x] Replace the static aspect slider list with the dynamic list: each attached aspect shows its key, a weight slider, and a working remove button
- [x] Add an aspect combobox (same pattern as notes/references `TagCombobox`) that lists project aspects not yet attached to the fragment
- [x] Remove the `x` button placeholder (current line 269); the remove button from the field array replaces it
- [x] Update `fragment-metadata.tsx` (`fragment.properties` → `fragment.aspects`)

### Phase 3 — Verify

- [x] Run `bun run verify` — fix any type errors or failing tests before stopping

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The mapper tests in `packages/storage/src/__tests__/mappers/aspect.test.ts` cover `inlineFieldsToProperties` and `propertiesToInlineFields` — update them for the renamed functions. No new test logic needed for the rename itself.

For the form changes, there are currently no frontend unit tests for this component. If a testing harness for React components exists, add a test covering: add aspect, remove aspect, weight change, and payload round-trip through `buildDefaultValues` / `buildUpdatePayload`.

---

## Notes

- The generated `maskorAPI.schemas.ts` file must be regenerated after the API schema changes, not hand-edited.
- The "preserve unknown aspect keys" constraint must survive the Phase 2 refactor — verify the `buildUpdatePayload` merge logic is intact.
- Weight is optional (defaults to `0`) — aspects may be used as pure tags with no weight set.

DO NOT IMPLEMENT until clearly stated by the developer.
