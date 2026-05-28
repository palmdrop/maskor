# Backend Type Deduplication — Phase 1 Audit

**Date**: 27-05-2026
**Status**: Awaiting developer review before Phase 2

---

## Part 1: Canonical Sources

### Zod Schemas in `packages/shared/src/schemas/`

| Schema Name                                                                                                                                                                               | File                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| ProjectSchema, ProjectCreateSchema, ProjectUpdateSchema                                                                                                                                   | domain/project.ts   |
| FragmentSchema, FragmentCreateSchema, FragmentUpdateSchema, FragmentUpdateResponseSchema, AspectWeightsSchema                                                                             | domain/fragment.ts  |
| AspectSchema, AspectCreateSchema, AspectUpdateSchema, AspectUpdateResponseSchema, AspectColorSchema                                                                                       | domain/aspect.ts    |
| NoteSchema, NoteCreateSchema, NoteUpdateSchema, NoteUpdateResponseSchema                                                                                                                  | domain/note.ts      |
| ReferenceSchema, ReferenceCreateSchema, ReferenceUpdateSchema, ReferenceUpdateResponseSchema                                                                                              | domain/reference.ts |
| SequenceSchema, SequenceCreateSchema, SequenceUpdateSchema, SectionSchema, FragmentPositionSchema, FragmentPositionCreateSchema, FragmentPositionMoveSchema, ViolationSchema, CycleSchema | domain/sequence.ts  |
| ArcSchema, ArcPointSchema, ArcCreateSchema, ArcUpdateSchema                                                                                                                               | domain/arc.ts       |
| LogEntrySchema, LogEntryTargetSchema, ActionTypeSchema, LogEntryListSchema                                                                                                                | domain/action.ts    |
| DraftManifestSchema, DraftEntityCountsSchema                                                                                                                                              | domain/draft.ts     |

### Drizzle Tables in `packages/storage/src/db/`

| Table Name                                                                                                                                                                                                                | File               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| projectsTable                                                                                                                                                                                                             | registry/schema.ts |
| fragmentsTable, fragmentNotesTable, fragmentReferencesTable, fragmentAspectsTable, aspectsTable, aspectNotesTable, notesTable, referencesTable, fragmentStatsTable, sequencesTable, sectionsTable, fragmentPositionsTable | vault/schema.ts    |

---

## Part 2: Mechanical Duplications (Refactor Targets)

| Type Name                | File:Line                                         | Canonical Source                            | Classification | Derivation                                                                                                                |
| ------------------------ | ------------------------------------------------- | ------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ProjectRecord`          | `packages/storage/src/registry/types.ts:4`        | `ProjectSchema` (shared)                    | **mechanical** | `Omit<z.infer<typeof ProjectSchema>, 'uuid'> & { projectUUID: string; userUUID: string }`                                 |
| `ProjectManifest`        | `packages/storage/src/registry/registry.ts:15`    | `ProjectUpdateSchema` config shape          | **mechanical** | `{ projectUUID: string; name: string; registeredAt: string; config?: z.infer<typeof ProjectUpdateSchema> }`               |
| `FragmentStats`          | `packages/storage/src/suggestion/stats-repo.ts:5` | `fragmentStatsTable`                        | **mechanical** | `typeof fragmentStatsTable.$inferSelect`                                                                                  |
| `IndexedFragment`        | `packages/storage/src/indexer/types.ts:21`        | `FragmentSchema` + `fragmentsTable`         | **mechanical** | `Omit<z.infer<typeof FragmentSchema>, 'content'> & Pick<typeof fragmentsTable.$inferSelect, 'contentHash' \| 'filePath'>` |
| `IndexedFragmentAspect`  | `packages/storage/src/indexer/types.ts:17`        | `AspectWeightsSchema` value shape           | **mechanical** | `z.infer<typeof AspectWeightsSchema>[string]`                                                                             |
| `IndexedFragmentSummary` | `packages/storage/src/indexer/types.ts:34`        | `IndexedFragment` subset                    | **mechanical** | `Pick<IndexedFragment, 'uuid' \| 'key' \| 'isDiscarded' \| 'aspects'> & { excerpt: string \| null }`                      |
| `IndexedAspect`          | `packages/storage/src/indexer/types.ts:42`        | `AspectSchema` + `aspectsTable`             | **mechanical** | `Omit<z.infer<typeof AspectSchema>, 'description'> & { filePath: string }`                                                |
| `IndexedNote`            | `packages/storage/src/indexer/types.ts:51`        | `NoteSchema` + `notesTable`                 | **mechanical** | `Pick<z.infer<typeof NoteSchema>, 'uuid' \| 'key'> & { filePath: string }`                                                |
| `IndexedReference`       | `packages/storage/src/indexer/types.ts:57`        | `ReferenceSchema` + `referencesTable`       | **mechanical** | `Pick<z.infer<typeof ReferenceSchema>, 'uuid' \| 'key'> & { filePath: string }`                                           |
| `IndexedSequence`        | `packages/storage/src/indexer/types.ts:63`        | `SequenceSchema` + `SectionSchema` + tables | **mechanical** | Complex — `z.infer<typeof SequenceSchema> & { filePath: string; contentHash: string; sections: IndexedSection[] }`        |

---

## Part 3: Known Inline Patch Literal (Phase 5 Target)

The `updateProject` call site in `packages/storage/src/registry/registry.ts` around line 262–279 uses an inline patch literal type that duplicates `ProjectUpdateSchema`. `ProjectUpdateSchema` does **not** include `currentFragmentUUID` even though the inline type and the schema do — silent drift confirmed.

---

## Part 4: Genuinely Semantic Types (Leave Alone)

These have no mechanical correspondence to any schema or table. They represent service interfaces, algorithm inputs, result envelopes, state machines, or error structures. Do not touch.

| Type                                                                                                                   | File                               | Reason                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `ProjectContext`                                                                                                       | registry/types.ts                  | Per-request scoped context                                         |
| `Settings`, `SettingsReadResult`, `SettingsService`                                                                    | settings/settings-service.ts       | App config + service interface                                     |
| `ActionLogConfig`, `ActionLogWriter`, `ActionLogReader`                                                                | action-log/types.ts                | Service contracts                                                  |
| `CascadeCallbacks`, `VaultWatcher`                                                                                     | watcher/types.ts                   | Business-logic callbacks, service interface                        |
| `EnsureUuidResult`, `PendingEntry`, `RenameCheckResult`, `RenameBuffer`                                                | watcher/utils/                     | Internal state machines                                            |
| `InFlightTracker`                                                                                                      | watcher/utils/in-flight-tracker.ts | Concurrency tracker                                                |
| `EntityConfig`                                                                                                         | watcher/sync/keyed-entity.ts       | Generic sync config                                                |
| `SuggestionWeights`                                                                                                    | suggestion/weights.ts              | ML scoring constants                                               |
| `FragmentStatsSummary`, `ProjectStats`                                                                                 | suggestion/stats-repo.ts           | Join/aggregate results                                             |
| `EligibleFragment`, `SelectInput`, `CooldownEntry`                                                                     | suggestion/                        | Algorithm-specific inputs                                          |
| `DiskSpaceCheck`, `RestoreDraftInput`, `RestoreDraftResult`, `CreateDraftInput`, `CreateDraftResult`, `DraftErrorCode` | drafts/                            | Draft command contracts                                            |
| `SyncWarning`, `RebuildStats`, `VaultIndexer`                                                                          | indexer/types.ts                   | Telemetry + service interface                                      |
| `SwapFile`, `SwapListEntry`, `SwapStorageConfig`, `SwapStorage`, `SwapEntityType`                                      | swap/                              | Swap cache internals                                               |
| `SerializeOptions`, `VaultConfig`, `VaultErrorCode`, `VaultErrorContext`, `WithFilePath`, `Vault`, `ParsedFile`        | vault/                             | Vault service contracts                                            |
| `StorageServiceConfig`, `StorageService`                                                                               | service/storage-service.ts         | Top-level service                                                  |
| `ListedDraft`                                                                                                          | drafts/list.ts                     | Already correctly uses `DraftManifest & { directoryName: string }` |
| All `*Input`/`*Output` in `packages/api/src/commands/`                                                                 | commands/                          | Command DTOs — semantically distinct                               |

---

## Part 5: Priority for Phases 2–6

**High (small lift, high ROI):**

1. `FragmentStats` → `typeof fragmentStatsTable.$inferSelect` — trivial swap, no logic change
2. `ProjectRecord` → derive from `ProjectSchema` inference + `{ userUUID }` — removes the `// TODO` comment
3. `ProjectManifest` → wrap `z.infer<typeof ProjectUpdateSchema>` for config shape

**Medium:** 4. `Indexed*` types in `indexer/types.ts` — consistent pattern: schema inference + explicit table column picks

**Low (consider last):** 5. Fix `ProjectUpdateSchema` drift (missing `currentFragmentUUID`) as part of Phase 5

---

## Decision: `uuid` vs `projectUUID` on `ProjectSchema`

Chose `Omit<Project, 'uuid'|'notes'|'aspects'|'references'|'arcs'> & { projectUUID: string; userUUID: string }` for `ProjectRecord`. Renaming `uuid` → `projectUUID` on `ProjectSchema` would require touching every API response mapper, OpenAPI schema, and frontend generated type. The one-line derivation is the right tradeoff.

## Decision: `XUpdateSchema` convention

Written separately with explicit optional fields, not auto-derived via `deepPartial`. Reason: only a subset of fields is updatable in most domain types; auto-derivation would silently expose fields that should not be patchable via the API.

---

## Final Status (after implementation)

| Entry                                                        | Result                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `ProjectRecord`                                              | ✅ Eliminated — `Omit<Project, uuid\|notes\|aspects\|references\|arcs> & { projectUUID, userUUID }` |
| `ProjectManifest.config`                                     | ✅ Eliminated — `Omit<ProjectUpdate, 'name'>`                                                       |
| `FragmentStats`                                              | ✅ Eliminated — `typeof fragmentStatsTable.$inferSelect`                                            |
| `IndexedFragment`                                            | ✅ Eliminated — `Omit<Fragment, 'content'> & { filePath }`                                          |
| `IndexedFragmentAspect`                                      | ✅ Removed — inlined through `Fragment['aspects']` (AspectWeights)                                  |
| `IndexedFragmentSummary`                                     | ✅ Eliminated — `Pick<IndexedFragment, ...> & { excerpt }`                                          |
| `IndexedAspect`                                              | ✅ Eliminated — `Omit<Aspect, 'description'> & { filePath }`                                        |
| `IndexedNote`                                                | ✅ Eliminated — `Omit<Note, 'content'> & { filePath }`                                              |
| `IndexedReference`                                           | ✅ Eliminated — `Omit<Reference, 'content'> & { filePath }`                                         |
| `IndexedSequence`                                            | ✅ Eliminated — `Sequence & { filePath, contentHash }`                                              |
| Inline `updateProject` patch literal in `registry.ts`        | ✅ Eliminated — uses `ProjectUpdate` from shared                                                    |
| Inline `updateProject` patch literal in `storage-service.ts` | ✅ Eliminated — uses `ProjectUpdate` from shared                                                    |
| `ProjectUpdateSchema` missing `currentFragmentUUID`          | ✅ Fixed — added to suggestion sub-schema                                                           |
| Scattered config defaults in `registry.ts`                   | ✅ Consolidated into `PROJECT_CONFIG_DEFAULTS` constant                                             |
