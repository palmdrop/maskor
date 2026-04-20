# Fragment Editor Review

**Date**: 2026-04-20

---

## Summary

The core plan requirements are largely met — PATCH route merges correctly, `defineEx` is correctly placed inside `onCreateEditor`, unknown aspect keys are preserved, and `readyStatus` is scaled correctly. The two meaningful correctness bugs are: (1) `setContent(content)` is called instead of `setContent(Markdown.parse(content))` in the external-content `useEffect`, which can corrupt the editor state on fragment reload; and (2) the `handleMetadataSave` cast `as FragmentUpdate` silently accepts any shape, masking type mismatches. There are also several coding-standard violations and one architectural concern (split `isPending` state).

---

## Issues

### prose-editor.tsx

- **[CRITICAL]** `useEffect` calls `editor.commands.setContent(content)` but `content` is a raw markdown string, not a TipTap doc. The plan explicitly requires `setContent(Markdown.parse(content))`. Calling `setContent` with raw markdown here bypasses the `tiptap-markdown` parsing pipeline — TipTap will treat it as HTML, not markdown. The extension's own `setContent` only handles HTML by default; the round-trip breaks silently on any SSE-invalidation reload.
  - Fix: `editor.commands.setContent(Markdown.parse(content))` in the effect, matching the plan exactly (prose-editor-tiptap.md Phase 4).

- **[WARNING]** `MarkdownStorage` is a locally-declared manual type used to cast `editor.storage`. `tiptap-markdown` exports its storage type. Using a hand-rolled type means if the library's storage shape changes (or the field is renamed), the cast silently succeeds and `getMarkdown()` returns undefined at runtime. Should use the exported type or at minimum assert the shape at the call site with a runtime guard.

- **[WARNING]** `editor.commands.setContent(content)` in the `useEffect` and `Markdown.parse(content)` in the initial `useEditor` config use two different paths for the same operation. On first mount, the plan's `content: Markdown.parse(content)` is what feeds the editor. On update, `setContent(content)` (without parse) is what runs. Even once the CRITICAL bug above is fixed, this asymmetry is fragile — it should be one consistent helper used in both places.

- **[WARNING]** Vim mode passes `value={content}` to `CodeMirror` but the `onCreateEditor` closure captures `onSave` at mount time. If `vimMode` switches from false → true after a re-render with a new `onSave` reference, the `:w` binding will call the stale closure. The plan correctly identifies the double-mount risk, but the stale-update risk on prop change is a distinct problem. The plan's fix (`defineEx` inside `onCreateEditor`) avoids the double-mount issue, but not a prop change that re-creates `onCreateEditor`. Since `vimMode` is hardcoded `false` at the call site this is currently latent, but worth a `// TODO:` comment.

- **[STYLE]** `getMarkdown` is a one-liner that duplicates the cast logic from the `useEffect`. Extract a `readMarkdown` helper (or colocate the cast) to avoid repeating `editor.storage as unknown as MarkdownStorage`.

### fragment-metadata-form.tsx

- **[CRITICAL]** `handleFormSubmit` passed to `onSubmit` types the argument as `(update: Partial<Fragment>) => void`, but inside `FragmentEditor.handleMetadataSave` the call is cast `as FragmentUpdate`. `Partial<Fragment>` and `FragmentUpdate` are structurally close but not identical — `Fragment` carries `uuid`, `contentHash`, `updatedAt`, `version`, `content`; these fields are not in `FragmentUpdateSchema`. If any of those fields leak through from `Partial<Fragment>`, the Zod validation on the PATCH endpoint will reject them (400). More precisely: `onSubmit` should accept `FragmentUpdate` directly, not `Partial<Fragment>`, and the cast in `fragment-editor.tsx` line 51 (`data: update as FragmentUpdate`) should be unnecessary.
  - Fix: Change `onSubmit: (update: Partial<Fragment>) => void` → `onSubmit: (update: FragmentUpdate) => void`, remove the cast in `fragment-editor.tsx`, and adjust `handleFormSubmit` to build a `FragmentUpdate` explicitly.

- **[WARNING]** The `useEffect(() => { reset(...) }, [fragment, aspects, reset])` dependency array means the form resets whenever the fragment object reference changes — including after a successful save (since `invalidateFragment` triggers a query refetch which produces a new object). Any in-progress edit is silently discarded if the PATCH response comes back before the user saves the other panel. This is a known concurrent-save hazard that the plan acknowledges, but the reset-on-refetch behavior makes it worse than just a PATCH race — the form will wipe local state after every save. Either gate the reset on a `!isDirty` check from `formState`, or stop invalidating and use `queryClient.setQueryData` to update the cache from the PATCH response body directly.

- **[WARNING]** `availableNotes` and `availableReferences` filter using `note.title` / `reference.name` respectively, but the stored values in `noteFields` are opaque strings from `fragment.notes` and `fragment.references`. There's an inline comment `// NOTE: id/uuid mismatch?!?!?!` acknowledging confusion here. The filter will fail to exclude already-selected items if note titles don't exactly match stored fragment.notes values. This is a data-model question, but the current filtering logic is silently incorrect if there's any mismatch.

- **[WARNING]** `buildDefaultValues` is called both as `defaultValues` in `useForm` and inside the `useEffect` reset. At initial render `aspects` is `[]` (the query hasn't resolved yet), so all `properties` sliders default to `{ weight: 0 }`. When aspects load, the `useEffect` resets correctly. However there's a brief window where the form is live with zeroed aspect weights, and if the user saves in that window, the PATCH will zero out all aspect weights — even for aspects that had non-zero values in the original fragment. This is a silent data-loss risk on slow connections. Consider disabling the save button until `aspectsEnvelope` has resolved.

- **[STYLE]** `noteFields ?? []` on line 93 — `useFieldArray.fields` is always `[]` by default (never `undefined` or `null`). The nullish coalescing is dead code and misleading.

- **[STYLE]** Inline `[value]` destructuring in `onValueChange={([value]) => field.onChange(value)}` is used multiple times across sliders. No issue with correctness, but the `value` parameter inside the destructure is an abbreviated name (`value` is fine — it's the semantic name here, not an abbreviation). This is fine. Noted as a non-issue.

### fragment-editor.tsx

- **[WARNING]** Both `handleProseSave` and `handleMetadataSave` guard on `if (!fragment) return;` but `fragment` is not in their `useCallback` dependency arrays — only `projectId`, `fragmentId`, `updateFragment`, `invalidateFragment` are listed. `fragment` being falsy is the same as "fragment hasn't loaded" — since neither callback can be triggered before the fragment is shown (the loading/error branches render instead), the guard is defensive but the missing dep is technically a lint error. Add `fragment` to both dependency arrays.

- **[WARNING]** `vimMode={false}` is hardcoded. The plan acknowledges this and defers to a settings system. This should have a `// TODO: wire to a settings system when one exists` comment per the coding standards rule for known limitations.

- **[STYLE]** `className="... border"` on the layout container (`div` line 70) looks like a debugging leftover — bare `border` with no variant applied produces an unstyled 1px border that probably shouldn't be in the shipped component.

- **[STYLE]** `w-30` on the `main` element (line 79) — this is a non-standard Tailwind class (`w-30` is not in the default scale; Tailwind's scale goes `w-28`, `w-32`). This is either a typo for `w-32` or was intended as `min-w-0` / `w-full`. Verify this renders correctly.

### packages/api/src/routes/fragments.ts (PATCH handler)

- **[CORRECTNESS — passes]** The merge is correct: `{ ...existing, ...update, version: existing.version + 1, updatedAt: new Date() }`. Spread ensures only provided fields overwrite; `uuid`, `contentHash`, `content` etc. are preserved from `existing` unless explicitly patched.

- **[WARNING]** `properties` in `FragmentUpdateSchema` is `z.record(z.string(), FragmentPropertySchema).optional()`. If the client sends `properties`, it **replaces** the entire `properties` record on disk (spread semantics). The client-side "preserve unknown keys" logic in `handleFormSubmit` (`mergedProperties = { ...fragment.properties, ...renderedProperties }`) correctly handles this — but only if the client always sends the full merged object. If any future caller sends a partial `properties` patch (just the changed keys), unknown keys will be lost. The API has no way to distinguish "replace properties" from "merge properties". This is an implicit contract between client and server that isn't documented. Consider a `// TODO:` on the PATCH handler noting this assumption.

- **[WARNING]** No PATCH test exists in `packages/api/src/__tests__/routes/fragments.test.ts`. The plan (Phase 5) listed a round-trip test as an acceptance criterion. The test file has coverage for GET, POST, DELETE, and stale-index — but zero coverage for PATCH. A PATCH that corrupts YAML frontmatter on write would go undetected.

### packages/api/src/schemas/fragment.ts

- **[STYLE]** `FragmentUpdateSchema` has `content: z.string().optional()` with no `.min(1)` — a PATCH with `content: ""` would zero out the body with no validation error. `FragmentCreateSchema` requires `content: z.string().min(1)`. The inconsistency is probably intentional (allow clearing body?) but should be documented with a comment.

---

## Architecture Notes

- **Split `isPending` state**: `useUpdateFragment` returns a single `isPending` shared by both the prose save and metadata save mutations. Both buttons use the same hook instance, so saving content disables the metadata save button and vice versa. This is probably acceptable given concurrent saves are explicitly deferred, but it's worth a comment. A future auto-save implementation would need separate mutation instances.

- **PATCH properties contract**: The server merges all fields via spread; unknown-key preservation is entirely client-side. If a second client (e.g. Obsidian edit → watcher picks it up → SSE fires → frontend refetches) runs between a form open and a save, the stale `fragment.properties` in the `handleFormSubmit` closure will be used for the merge. Any keys added externally between open and save will be silently dropped. This is the same class of problem as the optimistic-locking gap called out in the plan. The plan flags this correctly — just making it concrete.

- **`fragment-detail.tsx` scope preserved**: Confirmed — `ProjectShellPage.tsx` still uses `fragment-detail.tsx`; `FragmentPage.tsx` correctly uses `FragmentEditor`. Plan scope is respected.

- **YAML round-trip**: The server-side pipeline (`toFile` → `serializeFile` → `matter.stringify`) is correct. Properties serialize through `propertiesToInlineFields` (inline fields, not YAML frontmatter), and `inlineFieldsToProperties` parses them back. The round-trip is structurally sound. The one gap: if `matter.stringify` re-orders YAML keys, Obsidian will see a diff on next sync even if no values changed. This is a cosmetic issue, not data loss.

---

## Questions

1. `fragment.notes` and `fragment.references` are stored as plain strings (titles/names). `availableNotes` filters by `note.title` and `availableReferences` by `reference.name`. Is the canonical identifier for notes their title, or their UUID? The inline comment `// NOTE: id/uuid mismatch?!?!?!` suggests this is unresolved. If you later switch to UUID-keyed references, the tag filtering logic will need to change.

2. `POOL_OPTIONS` is hardcoded in `fragment-metadata-form.tsx` with a `// TODO: infer from backend`. Since `PoolSchema` is already exported from the API schemas and re-exported via the generated client's `maskorAPI.schemas.ts`, you could derive this from the generated Zod schema instead of redeclaring it. Is that export already present?

3. The `Typography` TipTap extension converts straight quotes to smart quotes and hyphens to em-dashes. This will modify content that wasn't explicitly edited by the user on load — it fires during paste and on `setContent`. For Obsidian vault fragments that use standard markdown punctuation, this could corrupt the round-trip. Intentional?
