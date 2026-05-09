# Review: Entity live metadata save + single-intent action types

**Date**: 2026-05-09
**Scope**: `packages/api/src/commands/{fragments,aspects,notes,references}/update-*.ts`, `packages/api/src/commands/split-update.ts`, `packages/api/src/routes/{fragments,aspects,notes,references}.ts`, `packages/shared/src/schemas/domain/action.ts`, `packages/frontend/src/hooks/useLiveFieldSave.ts`, `packages/frontend/src/components/fragments/{fragment-editor,fragment-metadata-form}.tsx`, `packages/frontend/src/pages/AspectEditorPage/components/AspectEditor.tsx`, `packages/frontend/src/pages/ProjectHistoryPage/renderers/*.tsx`
**Plan**: `references/plans/entity-live-metadata-save.md`
**Spec**: `specifications/action-log.md`

---

## Overall

Stage 1 (single-intent action types) is solid: schema, command diffing, route classification, renderers, and tests are coherent end-to-end and the new action-log entries read like sentences as intended. Stage 2 (live metadata save) has the right shape — the hook is well-tested in isolation — but the integration story has real holes: the optimistic update is wiped by an unconditional `invalidate()` on every successful flush, the AspectEditor shares one mutation instance between live metadata saves and content saves so live saves disable Cmd+S, and the hook does not serialize concurrent flushes. The plan also says 400ms; the hook defaults to 600ms.

---

## Bugs

### 1. AspectEditor: live metadata save disables the content Save button and silently swallows Cmd+S

`packages/frontend/src/pages/AspectEditorPage/components/AspectEditor.tsx:36`, `entity-editor-shell.tsx:103-108,156`

`AspectEditor` calls `useUpdateAspect()` once and shares the resulting `updateAspect` between `onContentSave`, `onKeySave`, and the `makeSave` used by `useLiveFieldSave` for category and notes. React Query's `isPending` from the same hook instance is `true` whenever any of those mutations is in flight.

```
type in category → debounce fires 600ms later → updateAspect runs
  → useUpdateAspect.isPending === true
  → EntityEditorShell.isPending === true
  → Save button disabled, label flips to "Saving…"
  → handleContentSave returns early on Cmd+S (saveContent: `if (!isDirty || isPending) return;`)
```

The user sees "Saving…" on the button while only category is saving, and content saves attempted via Cmd+S are silently no-ops during that window. The fragment side avoids this by using a separate `useUpdateFragment()` instance inside `FragmentMetadataForm`.

Fix: instantiate `useUpdateAspect()` separately for the metadata sidebar (mirroring `FragmentMetadataForm`), or pass a derived `isPending` to `EntityEditorShell` that excludes live-metadata flights.

### 2. Optimistic cache write is overwritten by unconditional `invalidate()` on success

`packages/frontend/src/components/fragments/fragment-metadata-form.tsx:107-109`, `packages/frontend/src/pages/AspectEditorPage/components/AspectEditor.tsx:81-83`

Both `makeSave` helpers `invalidate()` in `finally`. On success this triggers a refetch of the entity that immediately overwrites the optimistic value the user just saw. The optimistic UI is effectively cosmetic for the ~100 ms it survives before the refetch round-trip lands. On a slow network the user sees a brief flicker as the cache snaps back to the server response.

The plan's "Optimistic + invalidation flow" is:

> 1. `onMutate` — snapshot prior cache; write optimistic value.
> 2. PATCH fires. `onError` — restore snapshot; surface a toast.
> 3. `onSettled` — invalidate the entity's query (refetch authoritative value)…

…but the intent of the optimistic write only holds if step 3 doesn't *replace* the optimistic value with a re-read for the common success path. The fragment endpoint already returns the updated `Fragment` in `result.data.fragment`; write that into the cache with `setQueryData` and skip the invalidation on success. Only invalidate the action-log query (which is a separate cache key) for refresh.

### 3. Concurrent saves race when the user keeps editing during an in-flight save

`packages/frontend/src/hooks/useLiveFieldSave.ts:52-86`

The hook sets `isFlushingRef = true` while `await saveRef.current(...)` is in flight, but `onChange` does not check that flag. A keystroke during the in-flight save schedules a new timer; when it fires, `flush` runs concurrently with the previous save. With HTTP/2 (or any parallel sockets) the responses can arrive out of order; whichever PATCH the server processed first determines storage. After both settle, `invalidate()` triggers a refetch and the cache (and shortly after, the local value via the `serverValue` sync `useEffect`) snaps to whichever value won the race — which can be the *older* one.

Reproducer sketch:

```
t=0    user types A → onChange(A)
t=600  flush(A) starts; isFlushingRef=true; PATCH A in flight (slow)
t=700  user types B → onChange(B); timer scheduled
t=1300 flush(B) starts; isFlushingRef already true; PATCH B in flight
t=1400 server processes B (fast path), then A (slow path) — last write A
t=1500 invalidate fires; refetch returns A
       hasPendingRef=false, isFlushingRef=false → setLocalValue(A) — user's intent (B) is lost
```

Fix: queue/coalesce while `isFlushingRef` is true (run the latest pending value once the in-flight save resolves), or cancel the previous save when a new flush starts.

### 4. Default debounce is 600 ms, not the planned 400 ms

`packages/frontend/src/hooks/useLiveFieldSave.ts:22`

`debounceMs` defaults to `600`. None of the call sites in `fragment-metadata-form.tsx` or `AspectEditor.tsx` override it. The plan and spec both specify 400 ms, the hook's own tests pass `debounceMs: 400` explicitly, and the user-facing latency budget changes meaningfully between the two. Either drop the default to 400 or update the plan and call sites to be explicit.

---

## Design

### 5. Programmatic catch-all double-logs alongside single-intent entries

`packages/api/src/commands/aspects/update-aspect.ts:43-72`, `packages/api/src/commands/fragments/update-fragment.ts:66-85`

When `source === "programmatic"` and the patch contains both a content field and a single-intent-eligible field (e.g. `{description, category}` for an aspect), the command emits `aspect:updated` *and* `aspect:category-changed` for the same patch. The `aspect:updated` payload's `changedFields: ["description"]` doesn't even include the category — which is technically correct (category has its own entry) but reads strangely against the spec's framing of `*:updated` as "catch-all when the diff doesn't fit the single-intent set."

The plan's diff-classification rule (Stage 1 § "Diff classification rule" point 3) says the catch-all fires only when "a non-key change doesn't map to a single-intent type." A cleaner mapping: in programmatic mode, content-field changes that have no single-intent type *route* to `*:updated`; relational/scalar fields that *do* have a single-intent type continue to use it. That preserves the catch-all semantics and avoids "two entries from one patch where one half is a single-intent and the other half is a catch-all listing only itself."

This may be intentional (reads as: "here's the catch-all explaining content changed via a programmatic actor; here's the structural change"), but it's worth resolving explicitly.

### 6. `source` classification by patch shape is brittle and conflates intent with structure

`packages/api/src/routes/fragments.ts:28-44`, `packages/api/src/routes/aspects.ts:27-37`, `packages/api/src/routes/notes.ts:226`, `packages/api/src/routes/references.ts:226`

`classifyFragmentSource` infers user intent purely from "which fields are present in this PATCH." This works for today's frontend (Stage 2 sends single-field metadata patches and lone content patches), but it relies on no caller ever shaping a patch the same way for a different reason. The plan acknowledged this: "the diff alone cannot distinguish 'user typed in the editor and pressed Save' from 'another service patched content'" — and the resolution was to add an explicit `source` parameter to the command. The route then re-derives that source from patch shape, recreating exactly the heuristic the parameter was meant to replace.

For now there are no programmatic callers, so this is fine. Worth either documenting in the route as a known limitation, or moving the signal to the request body / a header so callers can opt out of the heuristic.

### 7. AspectEditor sends empty string instead of `undefined` to clear category

`packages/frontend/src/pages/AspectEditorPage/components/AspectEditor.tsx:122-123`

`serverValue: aspect?.category ?? ""` and the patch always sends `{category: value as string}`. Clearing the input fires `category: ""`. The schema models `category` as `optional()`, so the proper "no category" representation is `undefined`/missing. The renderer then falls back to `"none"`, hiding the divergence — but the underlying state is an empty string, not unset. If anything elsewhere distinguishes "missing" from "empty" (e.g. file frontmatter writes, future filters), this is silently wrong.

Fix: when the input is empty, send `category: null`/omit (depending on what the storage layer accepts). Same care for the `category-changed` log entry's `from`/`to` — pass `undefined` not `""`.

### 8. Stage 2 integration tests are checked off but absent

`references/plans/entity-live-metadata-save.md` Stage 2 § Tests

The plan checks off:

- "Integration: `FragmentMetadataForm` — toggle a note → cache updates immediately, PATCH fires after 400ms, toggling back within the window cancels the PATCH."
- "Integration: `AspectEditor` — category live-save, note attach/detach live-save."

Neither integration test exists in the diff. The unit-level coverage of `useLiveFieldSave` is good, but it doesn't catch the bugs above (Save button bleed, optimistic-then-invalidate flicker, in-flight race). The renderer test file (`renderers.test.ts`) is present and covers the new types, but the form-level integration is unverified.

---

## Minor

### 9. Redundant intermediate casts in AspectEditor `makeSave` calls

`packages/frontend/src/pages/AspectEditorPage/components/AspectEditor.tsx:123,129`

```ts
save: makeSave((value) => ({ category: value as string })) as (value: string) => Promise<void>,
```

`makeSave` is typed `(value: string | string[])` then cast back to `(value: string)` at each call site, which violates the "no redundant intermediate casts" rule. Make `makeSave` generic over the field's value type.

### 10. `flushOnUnmount` is fire-and-forget with no error path

`packages/frontend/src/hooks/useLiveFieldSave.ts:96-103`

Cleanup calls `void flushRef.current(pending)`. If the navigation-triggered flush fails, `setError` runs on an unmounted component (React 18 silently drops it). The user sees no indication that their final edit didn't persist. This matches the open suggestion in `references/suggestions.md` about `sendBeacon` — worth noting as a follow-up here too.

### 11. Test description outdated after Stage 2

<!-- cspell:disable-next-line -->
`packages/api/src/__tests__/routes/fragment-update-changedfields.test.ts:44-72`

The test "logs only 'content' when the user edits prose but re-sends unchanged metadata" still passes, but the framing ("the user edits prose…") is misleading post-Stage 2 — the live form no longer bundles unchanged metadata into a content save. The test now exercises the programmatic catch-all path, which is fine, but the description should be reworded.

### 12. Three near-identical `*-update-single-intent.test.ts` files duplicate scaffolding

`packages/api/src/__tests__/routes/{aspect,note,reference}-update-single-intent.test.ts`

`tailEntries`, `findByKey`, the `beforeAll`/`afterAll` test-app boilerplate are copy-pasted across all three. A small `helpers/single-intent-test.ts` module would reduce drift if these grow. Not blocking — typical for action-log integration tests.

### 13. `recordEditSaved` now fires on metadata-only changes

`packages/api/src/commands/fragments/update-fragment.ts:50-52`

`anyNonKeyChanged` is the trigger, so attaching a single note bumps suggestion stats the same as a content edit. This was already the case before this PR (the diff classification only changed the *log* path, not the suggestion path), but it's worth double-checking against the suggestion spec — with live metadata saves, the rate of `recordEditSaved` calls per session goes up significantly.

---

## Non-issues

- **`entry()` helper still uses `z.ZodTypeAny`** — looks like it would erase payload typing, but the discriminated union on `type` is what drives narrowing, and that still works. The plan's "schema fix (bonus)" task is checked off because the test casts (`as { changedFields: string[] }`) are no longer needed in the new tests; payloads narrow on the discriminator. Fine.
- **`fragment:updated` payload schema only has 5 enum values for `changedFields`** — `["content", "readyStatus", "aspects", "notes", "references"]`. This is right: `key` is `*:renamed`, not `*:updated`.
- **Greenfield reset (deleting `<vault>/.maskor/action-log.jsonl`)** — done as a one-time dev step, not as code; matches the plan's intent.
- **`onContentSave` for note/reference doesn't invalidate fragment stats** — different entities, no shared stats today. No bug.
- **Hook tests fail under `bun test` but pass under vitest** — vitest is the frontend's configured runner (`packages/frontend/package.json:test`), so this is expected. Just make sure root `bun run verify` runs vitest for the frontend.
