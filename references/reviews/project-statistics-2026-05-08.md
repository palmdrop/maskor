# Review: Project statistics — stats page and fragment-stats inspector

**Date**: 2026-05-08
**Scope**: `packages/storage`, `packages/api`, `packages/frontend`
**Plan**: `references/plans/project-statistics.md`
**Spec**: `specifications/project-statistics.md`

---

## Overall

Implementation is largely correct and well-structured: the schema, stats-repo, word-count helper, API endpoints, inspector, and stats page all follow the plan closely. Three bugs are present — one causing incorrect counter data, one causing permanently-zero word counts for pre-existing fragments, and one that is a downstream symptom of the second.

---

## Bugs

### 1. `voluntaryOpenCount` increments by 2 on each page load

`packages/frontend/src/pages/FragmentPage.tsx:15` — `recordFragmentVisit` is fired inside a plain `useEffect` with no mount-once guard. React `StrictMode` (active in `main.tsx`) double-invokes effects in development: mount → unmount → remount. Both invocations fire the POST before the component unmounts, so each navigation to a fragment page records two voluntary opens instead of one.

```
StrictMode: mount → fire POST (count = N+1)
           unmount → (no cleanup)
           remount → fire POST again (count = N+2)
```

Fix: Guard with a ref that survives the StrictMode remount:

```tsx
const hasRecordedRef = useRef(false);
useEffect(() => {
  if (hasRecordedRef.current) return;
  hasRecordedRef.current = true;
  void recordFragmentVisit(projectId, fragmentId).catch(() => {});
}, [projectId, fragmentId]);
```

### 2. Existing fragments always show `wordCount = 0`

`packages/storage/src/indexer/indexer.ts:62` / `packages/storage/src/watcher/sync/fragment.ts:62` — `setWordCount` is called only when content actually changes: in the API save path and in `syncFragment` after a hash-change is detected. `syncFragment` returns early when the stored hash matches (`storedRow?.contentHash === hashContent(resolvedRawContent)`), and the rebuild transaction in `indexer.ts` never calls `setWordCount` at all. Fragments that already existed when the `wordCount` column was added have no content change event to trigger backfill, so their `wordCount` stays at 0 indefinitely.

```
rebuild → upsertFragment (no wordCount) → fragment_stats.wordCount = 0
watcher event → hash unchanged → early return → wordCount still 0
save via API → setWordCount called → wordCount updated (only after manual save)
```

Fix: In `indexer.ts`'s `rebuild`, after the DB transaction, iterate `fragmentEntries` and call `setWordCount(vaultDatabase, fragment.uuid, computeWordCount(fragment.content))` for each fragment. The call is idempotent; running it on every startup is acceptable.

### 3. Stats inspector appears stale until a manual save

This is a downstream symptom of bug 2. The invalidation path is correct — `onContentSave` calls `invalidateFragmentStats` which triggers a React Query refetch. But because the DB value is 0 (bug 2), the inspector faithfully shows 0, which reads as "not updating". Once bug 2 is fixed and existing fragments have correct word counts, this symptom disappears.

---

## Design

None.

---

## Minor

None.

---

## Non-issues

- **`onContentSave` is the only invalidation site for stats** — the spec specifies refresh on fragment open (component mount handles this) and after a successful save. Metadata-only saves do not affect `wordCount` or `editCount` in a way that would be visible; `editCount` is incremented server-side before the response returns and `invalidateFragmentStats` fires after the PATCH resolves.
- **`setWordCount` outside the `upsertFragment` transaction** — intentional; `fragment_stats` is Maskor-internal and deliberately not co-transacted with vault entity writes.
- **`defaultStats` returns zeros for fragments with no row** — acceptable per spec; a missing row and a zero-filled row are semantically equivalent.
