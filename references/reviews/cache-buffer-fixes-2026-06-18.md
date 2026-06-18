# Review: Cache / buffer-authority fixes

**Date**: 2026-06-18
**Scope**: `packages/frontend/src/components/prose-editor.tsx`, `packages/frontend/src/components/entity-editor-shell.tsx`, `packages/frontend/src/hooks/useVaultEvents.ts`, `packages/frontend/src/lib/entity-kinds/entityHooks.ts` (+ tests, spec, TODO)
**Spec**: `specifications/fragment-editor.md`

---

## Overall

Three well-targeted fixes for a real data-loss bug (dirty buffer clobbered by a background refetch) plus a stale-name bug. Root causes are correctly diagnosed and the fixes match them. The invalidation mapping in Fix 2 is more accurate than I expected — `stats` is purely fragment-derived, so omitting it from the note/reference maps is correct, not an oversight. The buffer-authority guard is the right shape.

One genuine gap: the dirty guard is applied to the two content-sync effects but **not** to the CM6 anchor-seeding effect, so in raw/vim mode an incoming server change while dirty re-seeds comment anchors to offsets computed from server content while the doc text stays frozen — anchors and text desync. Edge case, low harm, self-heals on next save, but it violates the very "buffer is authoritative while dirty" invariant the change establishes. Everything else is sound.

`bun run verify` is reported green; I re-ran the three new/changed test files (9 passing).

---

## Bugs

### 1. CM6 anchor seeding is not gated on `isDirty` — anchors desync from a frozen dirty buffer

`packages/frontend/src/components/prose-editor.tsx:350-355` — both content-sync effects (CodeMirror `cmValue` at :157, TipTap at :309) now early-return on `isDirty`, but the standalone CM6 anchor-seeding effect does not:

```ts
useEffect(() => {
  if (!(vimMode || rawMarkdownMode)) return;
  const view = viewRef.current;
  if (!view) return;
  view.dispatch({ effects: setCmAnchorsEffect.of(loadedAnchors) });
}, [cleanContent, loadedAnchors, vimMode, rawMarkdownMode]);
```

`loadedAnchors` and `cleanContent` are both derived from the `content` prop (`splitCommentMarkers(content)` at :123). When `content` changes underneath a dirty buffer — exactly the BIG ISSUE scenario (same fragment saved elsewhere / external Obsidian edit) — in raw/vim mode:

```
server content changes while dirty
  → cmValue effect: early-returns (doc text stays = user's unsaved edits)  ✓
  → anchor effect: NOT gated → dispatches anchors at *server* offsets onto the live doc
  → comment anchors now point at the wrong positions in the user's text
```

The rich/TipTap path is consistent (anchors are extracted *inside* the gated effect via `extractTiptapAnchors`, only when `didSyncContent`), so only CM6 is affected. Requires raw/vim mode + comment anchors + a concurrent server edit of the open fragment, and it reconciles on the next save/reload — hence low severity — but it's a real break of the stated invariant.

Fix: gate this effect on the same condition — `if (isDirty) return;` with `isDirty` added to the dep array, so it still reconciles on the dirty→clean transition after save (mirrors the two content-sync effects).

---

## Design

### 2. Invalidation map is hand-maintained with no compile-time link to query keys

`packages/frontend/src/hooks/useVaultEvents.ts:23-50` — `eventInvalidationPrefixes` maps each event type to literal path-prefix strings (`"fragments"`, `"sequences"`, …) matched against `queryKey[0]`. This is a deliberate, documented over-approximation and is correct today, but it is structurally fragile: a future query under a new path prefix that derives from fragments (say `/projects/:id/timeline`) would silently never refetch on `fragment:synced`, with no test or type to catch it. The `VAULT_SYNC_EVENT_TYPES` array has a compile-time `satisfies` guard against the event union; the prefix map has no equivalent guard against the route surface. Acceptable for now given the no-live-users greenfield status — worth a `// TODO:` noting the map must be revisited whenever a new project-scoped query family is added, or a follow-up that derives prefixes from a typed registry.

### 3. Combined `isDirty` freezes the prose buffer on a margin-only edit

`packages/frontend/src/components/fragments/fragment-editor.tsx:165` (`isDirty = isProseDirty || marginEditor.isDirty`), passed through `entity-editor-shell.tsx:332`. A margin-only edit (prose clean) now also pins the prose buffer against server refreshes until the margin is saved. Flagged as intentional in the review context and the harm is low (a clean prose buffer that simply doesn't adopt a concurrent server body change until save), but the coupling is implicit — the prose editor receives a `isDirty` that is true for reasons unrelated to prose. If margin and prose dirtiness ever need independent reconciliation, this will need separating. Confirm it matches intent (the review context says it does).

---

## Minor

### 4. Action-log / suggestion views lose live SSE-driven refresh

`packages/frontend/src/hooks/useVaultEvents.ts` — the old blanket invalidation refetched **every** project-scoped query on any vault event, including `/projects/:id/action-log` (Project History page) and `/projects/:id/suggestion/*`. No event in the new map covers those prefixes, so an open History page no longer updates live when an entity syncs in the background. Mitigated by `staleTime: 0` + React Query's default `refetchOnWindowFocus`, so it refreshes on focus/navigation — but the live-update behavior is gone. If the History view is meant to be live, add `"action-log"` to the relevant entity maps (or to a shared fallback). Probably acceptable; calling it out so it's a decision, not an accident.

---

## Non-issues

- **Over-invalidation is safe** — listing more prefixes than strictly needed only triggers a refetch, which is a no-op under React Query structural sharing. The map errs broad on purpose; that's the right direction.
- **`stats` omitted from note/reference maps** — `ProjectStatsSchema.global` is entirely fragment-derived (`totalCount`, readiness histogram, word counts; `stats.ts` / `schemas/stats.ts`), so a note/reference change genuinely does not affect project stats. Correct, not under-invalidation. `aspects` includes `stats` as a harmless over-approximation (aspect weights can move fragment readiness).
- **`getListFragmentSummariesQueryKey` invalidated on every fragment update** — `entityHooks.ts:157`. Structural sharing no-ops when the summary is unchanged, so invalidating it for non-rename updates costs nothing. Correct given a rename emits no `fragment:synced` event (key is the filename, not in the watcher content hash).
- **Required `isDirty` prop, no default** — only one production render site (`entity-editor-shell.tsx`); `tsc -b` enforces the rest. Making it required (not optional defaulting to `false`) is the safer choice — a forgotten pass-through is a compile error, not a silent revert-to-clobber.
- **Reference/aspect rename → fragment staleness** — covered directly: the `reference:*` and `aspect:*` maps both include `"fragments"`, so the cross-entity cascade doesn't need to rely on a downstream `fragment:synced` to refresh the open fragment view.
- **Imperative `setContent` bypasses the guard** — Restore-from-server and swap recovery call `proseEditorRef.current?.setContent(...)` directly (`entity-editor-shell.tsx:206,212`), which does not go through the gated effects, so the dirty guard does not block those explicit user-initiated replacements. Intended.
