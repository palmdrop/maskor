# Review: Project Config Page (Phases 1–3)

**Date**: 2026-04-28
**Scope**: `packages/api/src/routes/`, `packages/storage/src/service/storage-service.ts`, `packages/storage/src/registry/registry.ts`, `packages/frontend/src/pages/ProjectConfigPage.tsx`, `packages/frontend/src/pages/NoteEditorPage.tsx`, `packages/frontend/src/pages/ReferenceEditorPage.tsx`, `packages/frontend/src/components/attachable-entity-panel.tsx`, `packages/frontend/src/components/ui/tabs.tsx`
**Plan**: `references/plans/project-config-page.md`
**Spec**: `specifications/project-config.md`

---

## Overall

Phases 1–3 are complete and consistent with the plan. The tabbed layout, general-tab inline edit, notes and references CRUD, and the dedicated editor pages all hang together cleanly. Two issues need attention before Phase 4: a double-save race in `GeneralTab` that can fire the API twice on Enter, and an overly broad `.catch()` in the rename path that silently eats non-ENOENT errors and can leave the vault in a split-brain state.

---

## Bugs

### 1. `GeneralTab`: double-save race on Enter

`packages/frontend/src/pages/ProjectConfigPage.tsx:75–81` — Pressing Enter calls `handleSave()` via `onKeyDown`. React's next render sets `disabled={true}` on the focused `Input` (because `isPending` becomes true). Setting `disabled` on a focused element causes the browser to fire a `blur` event, which calls `handleSave()` a second time while the first `mutateAsync` is still in flight.

```
Enter pressed
  → handleSave() fires → mutateAsync starts (isPending = true)
  → React re-renders with disabled={true}
  → browser fires blur on the now-disabled input
  → handleSave() fires again
    → trimmed !== project.name (name not yet updated) → second mutateAsync
```

Fix: add `if (updateProject.isPending) return;` at the top of `handleSave`.

---

### 2. `notes.update` / `references.update`: overly broad `.catch` on `unlink`

`packages/storage/src/service/storage-service.ts:531–538` (and the parallel reference block at `~675–681`) — When a title/name changes, the old file is deleted with:

```ts
await unlink(absoluteOldPath).catch(() => {
  log.warn(..., "rename cleanup: old note file already gone");
});
```

`.catch(() => {})` eats all errors, not only ENOENT. If `unlink` fails due to permissions, the old file remains on disk while the DB (after the inline upsert) now points to the new path. The watcher will re-index the old file later (still has the same UUID in frontmatter) and overwrite the DB row's filePath back to the old path, breaking subsequent reads.

Fix: narrow the catch — only swallow ENOENT (check `(err as NodeJS.ErrnoException).code === "ENOENT"`); rethrow everything else.

---

## Design

### 3. Rename is non-atomic: both files briefly coexist

`packages/storage/src/service/storage-service.ts:526–546` — The rename sequence is: write new file → delete old file → upsert DB. Between steps 1 and 3 the watcher can observe the new file and upsert the UUID row with the new path, then observe the old file's deletion and attempt a soft-delete by the old path (a no-op since the row is already updated). This is consistent with the existing delete trade-off and the storage-sync design intent (STALE_INDEX is retriable), but the rename path hasn't been commented with the same "non-atomic two-step" note that delete has (`storage-service.ts:590`). Worth adding the same comment for clarity so it's clear this is intentional, not an oversight.

---

## Minor

### 4. Empty-patch short-circuit missing

`packages/storage/src/service/storage-service.ts:507` — A `PATCH` with an empty body `{}` still reads the file, writes it back unchanged, and upserts the DB row. No user-visible harm, but it's unnecessary I/O. A two-line guard (`if (!patch.title && !patch.content) return current_note`) would make the contract explicit. Low priority.

---

## Non-issues

- **No delete confirmation in `AttachableEntityPanel`** — intentional per plan: "no warning needed unless future 'warn if attached' is added."
- **`projectContext!` non-null assertion in route handlers** — middleware guarantees this; consistent with all other route handlers.
- **Generated orval client verbosity** — expected; do not edit by hand.
- **`vimMode={false}` TODO comments** in `NoteEditorPage` and `ReferenceEditorPage` — tracking a real deferred decision, not dead code.
- **`aspects` tab placeholder** — Phase 4 is explicitly not done yet.
