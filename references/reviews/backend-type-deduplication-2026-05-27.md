# Review: Backend Type Deduplication

**Date**: 2026-05-27
**Scope**: `packages/shared/src/schemas/`, `packages/storage/src/{registry,indexer,suggestion,service}/`
**Plan**: `references/plans/backend-type-deduplication.md`

---

## Overall

The plan is faithfully executed and the headline win is real: `ProjectRecord`, `ProjectManifest`, `FragmentStats`, and the `Indexed*` family now derive from canonical zod/drizzle sources, and the inline `updateProject` patch literal — the original motivating offender — is replaced with `ProjectUpdate`. `ProjectUpdateSchema` was also updated to include `suggestion.currentFragmentUUID`, closing the drift that commit `32bb4fa` introduced. The audit doc is thorough and correctly identifies the semantic types to leave alone. Tests and typecheck pass cleanly.

The main concern is that Phase 2 over-built: `drizzle-zod` was added as a dependency but is never imported, and both `deepPartial` and `withDefaults` helpers have zero production callers — the convention recorded in Phase 5 actively argues _against_ using `deepPartial`. These are speculative abstractions with tests but no consumers, which CLAUDE.md explicitly cautions against.

---

## Bugs

None.

---

## Design

### 1. `drizzle-zod` dependency is dead weight

`packages/storage/package.json:18` — added in Phase 2, but `grep -rn "drizzle-zod\|createSelectSchema\|createInsertSchema"` finds no consumers. Phase 4 ended up using vanilla `typeof fragmentStatsTable.$inferSelect` (which doesn't need `drizzle-zod`).

Fix: remove the dependency, or — if there's a planned use case — actually wire it in (e.g. `createSelectSchema(fragmentStatsTable)` for runtime row validation at the DB boundary).

### 2. `deepPartial` helper has no production callers

`packages/shared/src/schemas/helpers.ts:6` — exported, tested, but unused. Phase 5 records the convention "XUpdateSchemas are written separately with explicit optional fields (not auto-derived via deepPartial) since only a subset of fields is updatable in most cases." That convention forecloses every realistic use case the helper was added for.

The return type is also weak (`z.ZodObject<z.ZodRawShape>` — loses the input shape entirely), which is why the test has to use `as unknown` casts to inspect nested results. A future caller would inherit the same type-safety loss.

Fix: delete `deepPartial` and its test block. If a real consumer appears later, add it back with proper recursive typing then.

### 3. `withDefaults` helper has no production callers

`packages/shared/src/schemas/helpers.ts:26` — same story. `toProjectRecord` does plain `{ ...PROJECT_CONFIG_DEFAULTS.editor, ...config?.editor }` per section rather than going through `withDefaults`. The helper also only does a shallow merge, which wouldn't fit the two-level-nested project config shape anyway — so even if you tried to use it for the obvious target, it wouldn't work without modification.

Fix: delete `withDefaults` and its test block. Reintroduce when a concrete need at a system boundary appears.

---

## Minor

### 4. `IndexedSequence` derivation loses the `Section` `superRefine`

`packages/storage/src/indexer/types.ts:31` — `IndexedSequence = Sequence & { filePath: string; contentHash: string }` correctly inherits the field shape from `SequenceSchema`, but the `superRefine` on `SectionSchema` (dense 0-based positions, no duplicate fragment UUIDs) only fires when something runs the schema. The previous inline type also didn't enforce it, so this is no worse than before — just worth noting that no derivation path here gives you the runtime validation for free.

### 5. `writeVaultManifest` always emits empty section objects

`packages/storage/src/registry/registry.ts:50` — `mergedSections` builds an entry for every key in `CONFIG_SECTION_KEYS` regardless of whether either side supplies one. So a manifest written via this path always carries `{ editor: {}, suggestion: {}, advanced: {}, preview: {} }` even for sections that were absent. The old code did the same (explicit per-section spreads of `undefined` produce `{}`), so this is preserved behavior, not a regression — but the generalization makes the quirk less obvious. If empty-section pollution ever matters, filter `mergedSections` to keys where at least one side is defined.

---

## Non-issues

- **`ProjectRecord` derived via `Omit<Project, 'uuid' | 'notes' | 'aspects' | 'references' | 'arcs'> & { projectUUID, userUUID }`** — verified field-by-field against the prior hand-written type. The omitted collections (`notes`/`aspects`/`references`/`arcs`) live on the domain `Project` but were never on `ProjectRecord`; the rename of `uuid → projectUUID` matches the existing convention in storage. Output shape is identical.
- **`IndexedFragment = Omit<Fragment, 'content'> & { filePath }`, etc.** — each `Indexed*` derivation matches the prior inline shape exactly. `aspects: AspectWeights` (`Record<string, { weight: number }>`) is structurally identical to the removed `Record<string, IndexedFragmentAspect>`.
- **`IndexedFragmentAspect` removed from storage but `IndexedFragmentAspectSchema` still exists in `packages/api/src/schemas/fragment.ts:10`** — that's the API response schema feeding orval codegen, not the storage internal type. Separate surface, correctly untouched.
- **`PROJECT_CONFIG_DEFAULTS` declared as a const object rather than embedded in `ProjectSchema` via `.default()`** — Phase 6 records the rationale: embedding would change input/output types for every `ProjectSchema` caller. Keeping defaults as a runtime constant local to the registry layer preserves the schema contract.
