# Review: Suggestion Mode

**Date**: 2026-05-07
**Scope**: `packages/storage/src/suggestion/`, `packages/api/src/routes/suggestion.ts`, `packages/api/src/__tests__/routes/suggestion.test.ts`, `packages/frontend/src/pages/SuggestionModePage/`, `packages/frontend/src/components/entity-editor-shell.tsx`, `packages/frontend/src/components/fragments/fragment-editor.tsx`, `packages/frontend/src/api/suggestion.ts`, `packages/frontend/src/pages/FragmentPage.tsx`, `packages/storage/src/service/storage-service.ts`
**Plan**: `references/plans/suggestion-mode.md`
**Spec**: `specifications/prompting.md`

---

## Overall

Solid implementation. The storage layer (stats schema, selector, cooldown, stats-repo) is clean and the server-side avoidance tracking is correctly wired. The `forwardRef` chain (`SuggestionModePage` → `FragmentEditor` → `EntityEditorShell`) works and the imperative save on Next flows correctly. Two bugs are present: the nudge dismissal is erased on every save (reappears immediately), and the `exclude` UUID can be re-returned in the all-cooled fallback. There are also several dead-code exports that should be cleaned up.

---

## Bugs

### 1. Dismissed nudge reappears after every save

`packages/frontend/src/pages/SuggestionModePage/index.tsx:143-149` — `onSaved` removes `fragmentId` from `dismissedNudges`. Since `avoidanceCount` is never decremented by an edit, dismissing the nudge and then saving causes it to immediately reappear on the same fragment.

```
user dismisses nudge
  → fragmentId added to dismissedNudges
  → nudge hidden

user edits and saves
  → onSaved fires
  → dismissedNudges.delete(fragmentId)
  → showNudge becomes true again
  → nudge reappears (user never requested this)
```

Fix: remove the `onSaved` callback that clears from `dismissedNudges`. The set is keyed by fragmentId, so it resets naturally when a new fragment is loaded (new key). If the intent is to let the nudge re-evaluate after a save, only clear the dismissed state when `loadNext` is called, not on every save.

### 2. `exclude` UUID can be re-returned in the all-cooled fallback

`packages/storage/src/service/storage-service.ts:1195-1202` — Selection relies entirely on cooldown to exclude the current fragment. In the normal path this is correct (the fragment was just added to cooldown). In the all-cooled fallback, `CooldownSet.getEligible` returns all cooled entries sorted oldest-first — the `excludeUuid` could be the oldest entry and be selected again, showing the user the same fragment they just pressed Next on.

```
pool = [A]  (only one eligible fragment)
user presses Next (exclude=A)
  → cooldown.has(A) = true
  → getEligible(["A"]) falls back to all-cooled → returns ["A"]
  → selectNextSuggestion → returns "A"
  → same fragment returned despite exclude param
```

Fix: add an explicit guard after selection — if `selectedUuid === excludeUuid` and more than one fragment was eligible before cooldown, retry or return null. For the single-fragment case, returning the same fragment is unavoidable and acceptable, but the current code never applies the exclusion at all.

---

## Design

### 3. `saveContent` silently returns when `isPending`, allowing Next to proceed during an in-flight save

`packages/frontend/src/components/entity-editor-shell.tsx:102-108` — If a save is already in flight (`isPending === true`), `saveContent` returns early without error. `SuggestionModePage.handleNext` sees no exception and calls `loadNext`, navigating to the next fragment while the in-flight save is still running. The spec says "if save fails, Next does not advance." A pending save is not a failure, but the current behaviour races the save against the navigation.

This is lower-severity than Bug #1 (race window is very narrow and the next fragment loads fresh from disk), but it violates the principle that Next only advances after the save completes. A straightforward fix: in `saveContent`, if `isPending`, either wait for the pending save to settle (difficult) or throw a clear error so Next is blocked.

### 4. Dead-code exports in `frontend/src/api/suggestion.ts`

`packages/frontend/src/api/suggestion.ts:34-44` — `useGetNextSuggestion` and `useRecordFragmentVisit` are exported but never imported anywhere. `SuggestionModePage` calls `getNextSuggestion` directly; `FragmentPage` calls `recordFragmentVisit` directly. The query key invalidation in `SuggestionModePage` (line 36) also targets the key from this unused hook, making it a no-op. Remove all three.

### 5. `markSurfaced` in `stats-repo.ts` is dead code

`packages/storage/src/suggestion/stats-repo.ts:111-124` — `markSurfaced` is exported but never called. `incrementPromptAccept` already sets `lastSurfacedAt` on the same upsert, making `markSurfaced` redundant. Remove it or consolidate the two into one function.

---

## Minor

### 6. Nudge rendered below the editor — plan says above

`packages/frontend/src/pages/SuggestionModePage/index.tsx:152-167` — The plan specifies the nudge banner above the editor. The `FragmentEditor` already accepts a `banner` prop (used by the discard banner) that renders at the top of the editor shell. The nudge is instead rendered below the editor div (outside the `flex-1` container), which puts it at the bottom of the page. Low-impact, but the `banner` prop exists precisely for this pattern.

### 7. `f` abbreviation in `storage-service.ts`

`packages/storage/src/service/storage-service.ts:1195-1202` — Three calls use `(f)` as the callback parameter: `preFilter.map((f) => f.uuid)`, `preFilter.filter((f) => eligibleSet.has(f.uuid))`, `eligible.map((f) => ({ uuid: f.uuid, ... }))`. Coding standard requires full names — should be `(fragment)`.

### 8. `useImperativeHandle` in `FragmentEditor` missing dependency array

`packages/frontend/src/components/fragments/fragment-editor.tsx:50-54` — The call has no deps array, so React re-creates the handle on every render. Should be `[shellRef]` or `[]`. The `EntityEditorShell` version at line 119 does this correctly: `useImperativeHandle(ref, () => ({ save: saveContent }), [saveContent])`.

### 9. `later` variable unused in cooldown test

`packages/storage/src/__tests__/suggestion/cooldown.test.ts:83-84` — `later` is declared but never used in the "fallback is sorted oldest-first" test. The test also doesn't actually verify insertion order (both `add` calls use `new Date()` internally, so ordering is not controlled). The `now` / `later` variables appear to be leftover from an earlier draft.

### 10. Avoidance test verifies status code only, not the stat increment

`packages/api/src/__tests__/routes/suggestion.test.ts:153-158` — The test asserts `secondResponse.status === 200` twice but does not verify that `avoidance_count` was actually incremented for the excluded fragment. Since `fragment_stats` is not exposed in the API, this needs an indirect assertion (e.g., check `avoidanceCount` on the next `/suggestion/next` response for that fragment). As written, the test would pass even if avoidance tracking is completely broken.

---

## Non-issues

- **`saveContent` returning `metadataUpdate`** — The function signature of `onContentSave` is `Promise<void>`, so the return is always `undefined`. This is dead code but harmless; the returned value is discarded by all callers.
- **`getStatsBatch` not filling defaults for absent UUIDs** — Intentional. The selector explicitly defaults absent stats to zero with `?? 0`. The comment in `stats-repo.ts` ("Row is created lazily on first stat increment") documents this.
- **Cooldown lost on restart** — Explicit constraint in the spec and plan. Acceptable.
- **`readyStatusThreshold` defaults to 0.95, not 1.0** — Phase 2 of the plan described eligibility as `< 1.0`, but Phase 3 introduced the configurable threshold with a 0.95 default. The implementation matches the final design intent.
- **`SuggestionVisitParamSchema` includes `projectId`** — Hono inherits path params from parent routes, so including `projectId` in the child route's params schema is consistent with how the other routes in this router work (`getNextSuggestionRoute` also validates `projectId` via `projectIdParamSchema`).
