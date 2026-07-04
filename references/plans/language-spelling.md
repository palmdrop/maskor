# Language settings & spelling

**Date**: 25-06-2026
**Status**: Done
**Specs**: `specifications/fragment-editor.md`, `specifications/project-config.md`, `specifications/fragment-model.md`
**Branch**: agent/language <!-- actual branch name; plan stem differs -->
**Merged**: 607c013287b6c72bf7c1860da193df0efbd4da15 <!-- work landed on main as cee5dee + 607c013 (review fixes) -->
**Closed**: 01-07-2026

---

## Goal

> A writer sets a project-wide writing language and can override it per fragment; the editor (rich, raw, and vim modes) then shows native browser spell-check squiggles in the resolved language. The spell-check mechanism sits behind a `SpellProvider` seam so the native engine can be swapped for a bundled-dictionary engine later (needed if/when maskor is ported to Tauri, where native webview spell-check is unreliable).

---

## Background (why these choices)

- No editor currently sets `spellcheck` or `lang`. CodeMirror (raw/vim) hard-sets `spellcheck: "false"` on `.cm-content`, so those modes show nothing. Tiptap (rich) inherits the browser default with no `lang`, so it spell-checks against the browser UI locale — useless for non-matching prose.
- Decision (confirmed with developer): **native browser spell-check now, behind a swap seam.** Native is great in the browser today; in a future Tauri port it is a per-platform gamble (WebKitGTK on Linux needs host config; WKWebView on macOS is inconsistent), so the engine must be replaceable without re-plumbing config.
- Language input: **curated dropdown → BCP-47 codes**, not a free text field.
- Override scope: **fragments only**, stored in fragment frontmatter as `lang:`. Notes/references/aspects inherit the project language (no per-entity override this pass).
- Resolution rule: `resolveLanguage = fragment.language ?? project.editor.language`.

---

## Tasks

### Phase 0 — Branch

- [ ] Create branch `agent/language-spelling` from the plan title.

### Phase 1 — Shared schema & language catalog

- [ ] Add a single source-of-truth language catalog in `packages/shared` (curated list: BCP-47 code + display label). Initial list to confirm at implementation: Swedish (`sv`), English US (`en-US`), English UK (`en-GB`), German (`de`), French (`fr`), Spanish (`es`), plus an explicit "None / browser default" sentinel. Export the code union type.
- [ ] Add `language` to the `editor` block in `ProjectSchema` and `ProjectUpdateSchema` (`packages/shared/src/schemas/domain/project.ts`), validated against the catalog. Decide the default representation (likely an empty/None default = browser default — confirm in implementation).
- [ ] Add optional `language` to `FragmentSchema` and `FragmentUpdateSchema` (`packages/shared/src/schemas/domain/fragment.ts`).
- [ ] Add the pure `resolveLanguage(fragmentLanguage, projectLanguage)` helper (shared), with tests for the override-falls-back-to-project precedence.

### Phase 2 — Storage (frontmatter + defaults)

- [ ] Register `lang` (frontmatter key) in `MANAGED_FRONTMATTER_KEYS` and map it in `packages/storage/src/vault/markdown/mappers/fragment.ts` (`fromFile` read, `toFile` write). An absent `lang:` maps to undefined (inherit). Confirm the chosen frontmatter key name (`lang` vs `language`) — `lang` is shortest and Obsidian-neutral.
- [ ] Add `editor.language` default to `PROJECT_CONFIG_DEFAULTS` and the merge paths in `packages/storage/src/registry/registry.ts`.
- [ ] Tests: fragment round-trips `lang` frontmatter (read → domain → write, and absent-key case); registry default applied when config omits `language`.

### Phase 3 — API & codegen

- [ ] Confirm the project patch + fragment update commands already pass the new fields through (schema-driven). Add explicit coverage where a command whitelists fields.
- [ ] Run `bun run codegen` from repo root to refresh the OpenAPI snapshot + orval client.
- [ ] Route/command tests: PATCH project `editor.language`; fragment update `language` persists to frontmatter.

### Phase 4 — SpellProvider seam (frontend)

- [ ] Define a `SpellProvider` interface that, given a resolved language, supplies what each editor backend needs to enable spell-check. The editor depends on the interface, not on `spellcheck`/`lang` directly.
- [ ] Implement the `native` provider:
  - Tiptap: apply `spellcheck="true"` + `lang` via `editorProps.attributes`.
  - CodeMirror: an extension using `EditorView.contentAttributes.of({ spellcheck: "true", lang })` to override CM6's hard `spellcheck: "false"`.
- [ ] Add a resolved-language hook (mirrors `useProjectEditorConfig`) returning the language for a given fragment, applying `resolveLanguage`.
- [ ] Thread the resolved `language` prop from `entity-editor-shell.tsx` into `ProseEditor`, and apply it to both backends via the provider. (Fragments supply the fragment override; other entity shells pass project language only.)

### Phase 5 — Config & metadata UI

- [ ] Add a project language setting to `ProjectConfigPage/tabs/GeneralTab.tsx` using a dropdown `SettingRow` bound to `useProjectSetting(projectId, "editor.language", …)`.
- [ ] Add a per-fragment language override control to the fragment metadata sidebar (alongside readiness/aspects/references), defaulting to "inherit project" and saving live like other metadata fields.

### Phase 6 — Verify, specs, commit

- [ ] `bun run format` then `bun run verify`; fix lint/test failures.
- [ ] Manual in-browser confirmation: rich, raw, and vim modes show squiggles in the resolved language; per-fragment override beats project language; "None" disables. (Note OS dictionary dependence.)
- [ ] Update `Shipped` frontmatter in `specifications/project-config.md` (project `editor.language`), `specifications/fragment-model.md` (fragment `lang` frontmatter + override), and `specifications/fragment-editor.md` (spell-check in the editor behind the SpellProvider seam).
- [ ] Final `git commit`.

---

## Open questions to resolve during implementation

- Default project language: `None` (browser default) vs a concrete default. Leaning `None`.
- Initial curated language list (above is a starting set).
- Frontmatter key name: `lang` (preferred) vs `language`.
- Whether `ReadonlyProse` (preview/overview) should also carry `lang` — harmless but spell-check doesn't render on non-editable content, so likely skip this pass.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Focus test surfaces: `resolveLanguage` precedence; fragment `lang` frontmatter round-trip (present + absent); registry default; project PATCH + fragment update persisting language; the native provider applies the correct attributes per backend.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`. ALSO update the relevant frontmatter of the relevant specs — add an item to the `Shipped` property with the features implemented. Do not include implementation details or granular tasks.
