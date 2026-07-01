# Code Review: language-spelling

**Date**: 2026-07-01  
**Branch**: `agent/language-spelling`  
**Reviewer**: Claude Sonnet 4.6 (7-angle multi-agent review, high effort)  
**Commit**: `2ab8fe3`

---

## Summary

The implementation is architecturally sound. The `SpellProvider` seam, the language catalog, `resolveLanguage`, and the storage/API/UI layers are all coherent. Seven findings survived verification, ranked most-severe first. Two correctness bugs exist at the storage boundary around the empty-string `LanguageCode`. Three PLAUSIBLE issues are latent risks that aren't broken today.

---

## Findings

### 1. `readFragmentLanguage` drops `""` — the empty-string LanguageCode cannot round-trip through frontmatter (CONFIRMED)

**File**: `packages/storage/src/vault/markdown/mappers/fragment.ts:24`

```ts
const readFragmentLanguage = (raw: unknown): LanguageCode | undefined => {
  if (typeof raw !== "string" || raw === "") return undefined;  // ← drops ""
```

`language.ts` declares `""` (LANGUAGE_INHERIT) a *meaningful per-fragment override* distinct from `undefined`/absent — a fragment can explicitly opt back to the browser default even when the project sets a language. But `readFragmentLanguage` conflates `""` with "absent": if `lang: ""` ever appeared in frontmatter, it reads back as `undefined` (inherit), silently losing the override.

**Why it matters**: The schema (`FragmentUpdateSchema`) accepts `language: ""` via a direct API PATCH. There is no API-level guard preventing a client from sending it. The write-path bug (#2) happens to prevent `""` from ever being persisted today, so both bugs must be fixed together.

**Fix**: Change the early-return guard to only reject non-string/null, then let `LanguageCodeSchema.safeParse` handle `""` (it is in the enum).

---

### 2. `toFile` falsy-guards `fragment.language` — `""` override silently omitted on write (PLAUSIBLE)

**File**: `packages/storage/src/vault/markdown/mappers/fragment.ts:90`

```ts
...(fragment.language ? { lang: fragment.language } : {})
```

`""` is falsy in JS. A fragment with `language: ""` writes no `lang:` key to frontmatter. A direct API PATCH `{ language: "" }` sets the domain object to `language: ""`, but on the next GET the field is `undefined`. The API response after PATCH shows `language: ""`, the next read returns `language: undefined` — silent state divergence.

The UI avoids this today by filtering `""` out of the fragment language dropdown, but the API path is unguarded.

**Fix**: Use `fragment.language !== undefined` as the guard (or `fragment.language != null && fragment.language !== undefined`), and handle `""` explicitly:

```ts
...(fragment.language !== undefined ? { lang: fragment.language } : {})
```

---

### 3. Three `useProjectEditorConfig` mocks missing the new `language` field (CONFIRMED)

**Files**:
- `packages/frontend/src/components/entity-editor-shell.test.tsx:103`
- `packages/frontend/src/pages/__tests__/PreviewPage.test.tsx:38`
- `packages/frontend/src/pages/__tests__/FragmentImportPage.test.tsx:26`

All three `vi.mock` factories return the config object without `language: string` (now a required field on `ProjectEditorConfig`). `vi.mock` factory objects bypass TypeScript checking, so no compile error surfaces. At runtime, `entity-editor-shell.tsx` reads `editorConfig.language` as `undefined`, casts it `as LanguageCode`, and passes it to `resolveLanguage` and `spellProvider.codeMirrorExtension(undefined)`. The entity-editor-shell test file directly exercises this code path.

**Fix**: Add `language: ""` to each mock return value.

---

### 4. CM6 `useMemo` triggers a full `StateEffect.reconfigure` on every language change (PLAUSIBLE)

**File**: `packages/frontend/src/components/prose-editor.tsx:303`

`spellProvider.codeMirrorExtension(language)` is called inside `useMemo([..., language])`, producing a new `Extension` reference on each language change. `@uiw/react-codemirror` detects the changed array reference and dispatches `StateEffect.reconfigure.of(allExtensions)` — a **full** reconfiguration (confirmed in `node_modules/@uiw/react-codemirror/src/useCodeMirror.ts:163`). This tears down and rebuilds vim, markdown, theme, anchor, and document-link extensions, not just the spell-check facet.

Language only changes on a deliberate settings action (not per-keystroke), so this is not a typing-path performance problem. However, a language switch causes a visible editor reinit (cursor may reset, undo history may clear).

**Fix**: Initialise the spell-check extension in a `Compartment`, keep the `Compartment` reference stable in `useMemo`, and dispatch `compartment.reconfigure(spellProvider.codeMirrorExtension(language))` in a `useEffect` when `language` changes. That replaces one facet without touching the rest of the extension set.

---

### 5. Tiptap language-sync `useEffect` fully replaces `editorProps` — latent clobber risk (PLAUSIBLE)

**File**: `packages/frontend/src/components/prose-editor.tsx:361`

```ts
useEffect(() => {
  editor.setOptions({
    editorProps: {
      attributes: { class: `...`, ...spellProvider.proseAttributes(language) },
    },
  });
}, [editor, language]);
```

Tiptap's `setOptions` merges at the **top-level options** but **replaces `editorProps` entirely**. Currently the `useEditor` call only sets `attributes` inside `editorProps`, so nothing is dropped. But if a future change adds `handlePaste`, `handleKeyDown`, or `transformPastedText` to the `useEditor` `editorProps`, this effect will silently clobber those handlers on every language change and on initial editor mount.

**Fix**: Read back `editor.options.editorProps` and spread-merge `attributes` into it:

```ts
editor.setOptions({
  editorProps: {
    ...editor.options.editorProps,
    attributes: { class: `...`, ...spellProvider.proseAttributes(language) },
  },
});
```

---

### 6. `useProjectEditorConfig` returns `language: string` instead of `LanguageCode` — unsafe cast at call site (PLAUSIBLE)

**File**: `packages/frontend/src/hooks/useProjectEditorConfig.ts:11`

```ts
export type ProjectEditorConfig = {
  // ...
  language: string;   // ← should be LanguageCode
};
```

`entity-editor-shell.tsx` casts this `as LanguageCode`. The registry reads `project.json` via a plain object spread with no Zod validation on the `language` field (unlike fragment `lang`, which goes through `LanguageCodeSchema.safeParse`). A hand-edited `manifest.json` with `"language": "pt-BR"` passes through undetected; the cast silences TypeScript; `lang="pt-BR"` (not in the catalog) is set on the editor element, silently disabling spell-check.

**Fix**: Type `ProjectEditorConfig.language` as `LanguageCode` directly (the hook already defaults to `""` which is a valid member). Optionally add a `LanguageCodeSchema.safeParse` guard in `toProjectRecord` in `registry.ts` mirroring `readFragmentLanguage`.

---

### 7. Two divergent local sentinels for the same Radix Select empty-string workaround (PLAUSIBLE)

**Files**:
- `packages/frontend/src/components/fragments/fragment-metadata-form.tsx:30` — `LANGUAGE_INHERIT_SENTINEL = "__inherit__"`
- `packages/frontend/src/pages/ProjectConfigPage/tabs/GeneralTab.tsx:37` — `LANGUAGE_DEFAULT_SENTINEL = "__default__"`

Both exist because Radix `SelectItem` rejects empty-string values. They also differ in the coercion operator used (`??` vs `||`). If either sentinel or operator is changed in one file independently, the two language dropdowns silently diverge — one would save the sentinel literal as the stored language value.

**Fix**: Export a single `LANGUAGE_EMPTY_SENTINEL` constant (e.g. from `language.ts` or a shared UI util), used consistently in both components, with a single helper that maps `"" ↔ sentinel`.

---

## Resolution (implemented 2026-07-01)

- **1 & 2** — Resolved via **Design B** (developer choice): `""` is not a valid fragment override, aligning schema + storage + UI. Added `FragmentLanguageCode` / `FragmentLanguageCodeSchema` (catalog minus `""`) in `language.ts`; `FragmentLanguageSchema` now excludes `""`, so the API rejects `language: ""` for fragments. `readFragmentLanguage` parses with the non-empty schema; `toFile` uses an explicit `!== undefined` guard. Corrected the misleading "meaningful empty-string override" comments. Tests: mapper `lang: ""` → inherit; API PATCH `language: ""` → 400.
- **3** — Added `language: ""` to the two `useProjectEditorConfig` mocks that exercise the language path (`entity-editor-shell.test.tsx`, `PreviewPage.test.tsx`). `FragmentImportPage.test.tsx` left as-is — it's an intentionally minimal mock and never reads `language`.
- **4** — **Not fixed (intentional).** `cmTheme` already depends on `[fontSize]`, so the CM extensions array already fully-reconfigures on any font-size settings change; `language` follows the identical established pattern. `StateEffect.reconfigure` preserves editor state (doc/selection/undo live in `EditorState`, not extensions), so the review's "cursor may reset / undo may clear" concern does not hold. A spellcheck-only `Compartment` would be inconsistent with every other settings-driven extension here for negligible benefit.
- **5** — Fixed: the Tiptap language-sync effect now spreads `...editor.options.editorProps` before overriding `attributes`, so it can't clobber other handlers.
- **6** — Fixed: `ProjectEditorConfig.language` is now `LanguageCode` (cast removed at the call site), and `registry.ts` coerces an out-of-catalog `editor.language` to `""` on read (mirrors the fragment `lang` read guard), so an invalid stored value never reaches the API.
- **7** — Fixed: both dropdowns share `LANGUAGE_SELECT_EMPTY_VALUE` (exported from `language.ts`); the two divergent local sentinels are gone.

`bun run verify` passes (903 tests, typecheck, lint, openapi-sync).

## Not findings

- **`FragmentUpdateSchema.language` optional chain** — `FragmentLanguageSchema.nullable()` where `FragmentLanguageSchema = LanguageCodeSchema.optional()` correctly accepts `undefined | null | LanguageCode`. Zod delegates `isOptional()` through `ZodNullable` to the inner `ZodOptional`. REFUTED.
- **`{ ...existing, ...patch, language: ... }` intermediate null** — TypeScript resolves the explicit `language:` key as the authoritative type, overriding the `...patch` spread. No type error, no runtime issue. REFUTED.
- **`SpellProvider` seam location** — frontend-only is correct; the interface imports `EditorView` from `@uiw/react-codemirror`. Moving to `@maskor/shared` would pull a frontend dep into the shared package.
