# Review: Entity Editor Unification

**Date**: 2026-05-05
**Scope**: `packages/frontend/src/components/entity-editor-shell.tsx`, `packages/frontend/src/components/fragments/fragment-editor.tsx`, `packages/frontend/src/pages/{Aspect,Note,Reference}EditorPage/`, `packages/frontend/src/hooks/useDirtyState.ts`, `packages/api/src/{routes,schemas}/fragment*.ts`, `packages/shared/src/schemas/domain/fragment.ts`, `packages/storage/src/{db,indexer,service,vault}/**`
**Plan**: `references/plans/entity-editor-unification.md`

---

## Overall

The unification under `EntityEditorShell` is structurally clean — Aspect, Note, Reference, and Fragment editors all funnel through one shell, and bespoke layouts are gone. Phase 6 (tests + codegen) is incomplete per the plan and acknowledged. The most important finding: fragment renames and creates have **no key-conflict guard** — unlike notes/aspects/references — so the rename-by-key pattern can silently overwrite another fragment's file and corrupt the index. The shared `useDirtyState` hook is also weaker than its surface suggests: the `sources` parameter is unused, and `FragmentEditor` ends up running two parallel dirty-state instances.

---

## Bugs

### 1. Fragment rename can overwrite a sibling fragment's file (data loss)

`packages/storage/src/service/storage-service.ts:431–465` (`fragments.write`)

Notes (`:794-800`), aspects (`:629-637`), and references (`:957-967`) all check for case-insensitive key collisions and throw `KEY_CONFLICT` before writing. `fragments.write` does not. Combined with the fact that `vault.fragments.write` uses `Bun.write` (which silently overwrites) and the DB `fragments.key` column is **not unique** (`packages/storage/src/db/vault/schema.ts:7`), the rename flow becomes:

```
fragment A: key="foo", filePath="foo.md"
fragment B: key="bar", filePath="bar.md"
user renames B → "foo"
1. vault.write writes fragments/foo.md with B's content   → A's file overwritten
2. unlink("bar.md")                                       → B's old file gone
3. upsertFragment(B.uuid, filePath="foo.md")              → UNIQUE(file_path) collides with A's row
   → SQLite throws inside the transaction → DB rolls back → file system already corrupted
```

A's file is gone, B's old file is gone, and the DB still maps `B.uuid → bar.md` (now missing). Both fragments are unrecoverable without manual filesystem inspection. The same path is hit by `createFragment` (route handler `:199`), which derives `key = slugify(title)` and writes without checking whether that key is already taken.

Fix: add an explicit case-insensitive key collision check at the start of `fragments.write` (skip self-UUID) matching the pattern used by other entities. Decide whether active and discarded fragments share a key namespace — if not, also include discarded rows in the lookup. See bug 2 below.

### 2. `fragments.key` is not `UNIQUE` in the DB schema

`packages/storage/src/db/vault/schema.ts:7`

`notesTable.key`, `aspectsTable.key`, `referencesTable.key` all carry `.unique()`. `fragmentsTable.key` does not. The plan's intent is that `key` is the rename handle (the same role it plays for notes/refs/aspects), so the same uniqueness invariant should hold — except it must accommodate the case where an active fragment and a discarded fragment can legitimately share a key (filenames `foo.md` and `discarded/foo.md` both yield key="foo").

Right now nothing prevents two active fragments from existing with the same key. The migration `20260504_add_fragment_key.sql:3` populates from filename, so historical data should be unique by construction (file_path is unique and key is derived from it), but new writes have no guard.

Fix: either add a partial unique index `UNIQUE (key) WHERE is_discarded = 0` (and one for discarded) or enforce uniqueness in the service layer (see bug 1). The `restore-collision` TODO at `storage-service.ts:547-548` hits the same gap.

### 3. Fragment route's `update` handler can `existing.uuid` mismatch its own `update.uuid`

`packages/api/src/routes/fragments.ts:226–253`

```ts
const existing = await storageService.fragments.read(projectContext, fragmentId);
const fragment = await storageService.fragments.write(projectContext, {
  ...existing,
  ...update,
});
```

`FragmentUpdateSchema` (shared) does not omit `uuid`, but in `packages/shared/src/schemas/domain/fragment.ts:27-35` the update schema doesn't include `uuid` either, so this is fine in practice. **But** `update` does include `key`, `title`, `content`, `readyStatus`, `notes`, `references`, `properties`. If a client sends `notes: []` to clear notes, that works. If a client sends a partial `properties: { foo: { weight: 1 } }`, the spread replaces the whole properties record (correct PATCH semantics for `properties`, but worth noting). Not a defect, but flagging because the handler does no field-level merge — callers must send the full `properties` map every time. Move to Minor / Non-issue if intentional.

---

## Design

### 4. `FragmentEditor` runs two parallel `useDirtyState` instances with awkward forwarding

`packages/frontend/src/components/fragments/fragment-editor.tsx:32-57` and `packages/frontend/src/components/entity-editor-shell.tsx:48`

The shell owns a `useDirtyState(["prose"])` whose `isDirty` drives the Save button (combined with `additionalDirty`). `FragmentEditor` *also* runs `useDirtyState(["prose", "metadata"])`, but only consumes `setSourceDirty` from it — its `isDirty` is never read locally; it exists solely to fire the parent's `onDirtyChange`. Meanwhile `isMetadataDirty` is held in a *third* place (a plain `useState`) so the shell can receive it via `additionalDirty`.

Net result: the metadata dirty bit lives in two places, and the shell's prose dirty round-trips through three callbacks (`shell.onChange → shell.setSourceDirty("prose") → shell.onDirtyChange → FragmentEditor.handleShellDirtyChange → FragmentEditor.setSourceDirty("prose")`) just to be re-derived inside `FragmentEditor`. This is the kind of indirection the hook was supposed to eliminate.

A cleaner model: lift the source-of-truth `useDirtyState` to `FragmentEditor` and have the shell expose `setSourceDirty` (or a `dirty` controlled-prop pair) instead of owning its own. Or the simpler route — for editors with a single source, the shell owns it; for multi-source editors, the parent owns it and passes a `dirty` prop. The current "owns sometimes, forwarded sometimes" is the worst of both.

### 5. `useDirtyState`'s `sources` parameter is unused / dead documentation

`packages/frontend/src/hooks/useDirtyState.ts:14`

```ts
export const useDirtyState = (_sources: string[], options?: Options): DirtyState => {
```

The leading underscore signals "ignore this." Callers can pass any source name to `setSourceDirty(source, dirty)` regardless of what they declared in the array; nothing validates membership. The plan (Phase 1) presents `sources` as the way the hook learns which sources to track — but the implementation tracks them dynamically.

Either drop the parameter entirely (current behavior is identical without it) or use it: validate membership in `setSourceDirty` and throw / warn on unknown sources. Today it reads as documentation that the type system can't enforce.

### 6. Fragment `cascadeWarnings` UI is dead code

`packages/frontend/src/components/fragments/fragment-editor.tsx:30, 65, 133-134` and `packages/api/src/routes/fragments.ts:249`

The fragment update endpoint always returns `warnings: []`. The plan is explicit that fragments have no inbound references, so no cascade is possible. `FragmentEditor` still wires `cascadeWarnings` state, a `setCascadeWarnings` call, and an `onDismissWarnings` handler — all guaranteed to be no-ops.

Either drop the cascade-warning props from `FragmentEditor`'s shell call (the shell tolerates absent `cascadeWarnings`), or — if you anticipate a future cascade — leave a `// TODO:` explaining what would produce warnings. As-is, this is misleading scaffolding.

### 7. `FragmentSchema` extends backend keys onto a domain schema that already has them

`packages/api/src/schemas/fragment.ts:27-33`

```ts
export const FragmentSchema = DomainFragmentSchema.extend({
  uuid: z.uuid().openapi(...),
  key: z.string().openapi(...),
  title: z.string().openapi(...),
  ...
});
```

The domain schema already declares `uuid`, `key`, `title`, `content`, `updatedAt` with the right types. The `.extend()` here exists only to attach `.openapi(...)` examples and to widen `updatedAt` from `z.date()` to `z.string()`. The first concern is fine; the second silently changes the runtime type without a `.transform`. Worth flagging because extending a domain schema with the same field names re-validating to a different type is a footgun if someone later swaps these. Consider using `.openapi()` directly on the domain fields where possible, and an explicit `.omit({ updatedAt }).extend({ updatedAt: z.string() })` for the type-changing field — same as `IndexedFragmentSchema` already does.

---

## Minor

### 8. Phase 6 acknowledged as incomplete — flag for tracking

The plan marks `useDirtyState` unit tests and fragment-rename integration tests as TODO. Without the integration test, bug 1 / bug 2 above would not have been caught by the suite. Prioritize the rename-collision integration test.

### 9. Migration journal file has no trailing newline

`packages/storage/src/db/vault/migrations/meta/_journal.json` — the diff shows `\ No newline at end of file`. Pre-existing pattern in the file but worth a one-character fix while editing it.

### 10. AspectEditor `onContentSave` parameter is named `description` while the shell's prop type names it `content`

`packages/frontend/src/pages/AspectEditorPage/components/AspectEditor.tsx:45` — fine because the rename only affects local readability, but consider keeping the parameter name `content` to match the contract and rename only at the call site (`data: { description: content }`).

### 11. Fragment route doesn't expose `key` validation errors with a helpful field

`packages/api/src/routes/fragments.ts:236` returns `{ error: "INVALID_KEY", message }`. Notes/refs/aspects use the same shape. Consistent — but the 400 isn't documented in the OpenAPI route definition for `updateFragmentRoute` (line 109), so codegen consumers get a typed `400` for "Invalid request body" but not for "Invalid key". Minor doc drift.

### 12. `unlink` cleanup runs before the inline DB upsert in `fragments.write`

`packages/storage/src/service/storage-service.ts:447-452` (cleanup), `:460-462` (upsert)

The watcher could observe the `unlink` between these two steps and try to delete the row by old `filePath`. The watcher is hash-guarded and the new file has already been written, so in practice this resolves to a no-op or self-healing state. Not a regression — pre-existing — but worth confirming the watcher doesn't race against the cleanup window.

### 13. `EntityEditorShell` `onDirtyChange` signature differs subtly from `useDirtyState`'s

The shell's `onDirtyChange` only fires for the **prose** source, not the combined dirty state (which includes `additionalDirty`). For `FragmentEditor` this happens to be what's wanted, but the prop name `onDirtyChange` will mislead future callers who assume it tracks the Save-button-enable state. Rename to `onProseDirtyChange` or document the scope.

---

## Non-issues

- **`AspectEditor` onContentSave passes only `description`** — matches pre-refactor behavior; aspect category/notes/etc. are not edited from this surface.
- **`FragmentUpdateResponseSchema` returns `warnings: string[]`** — chosen for API symmetry with notes/refs/aspects despite being always-empty for fragments. Documented as intentional in the plan (Phase 2c, "no cascade").
- **Migration `ADD COLUMN ... DEFAULT ''` followed by UPDATE** — pre-existing rows briefly hold `key=''` between the two statements within one migration transaction. Drizzle splits at `--> statement-breakpoint` but the migration is run atomically, so external readers never observe the empty state.
- **Fragment mapper derives `key` from filename, not frontmatter** — intentional; the plan demotes title to a frontmatter field while filename becomes the rename handle (matching notes/refs/aspects).
- **`useKeyEdit.handleKeySave` resets `keyEditing=false` even on rename failure** — pre-existing behavior, not in scope for this review.
