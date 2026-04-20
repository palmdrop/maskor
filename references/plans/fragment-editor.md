# Fragment Editor — Prose + Metadata Editing

**Date**: 18-04-2026
**Status**: Done
**Implemented At**: 18-04-2026

---

## Goal

A focused, single-fragment editing view. Two distinct surfaces:

1. **Prose editor** — edit the markdown body of the fragment; vim mode is a hardcoded toggle prop for now (no settings system yet)
2. **Metadata panel** — edit frontmatter fields through a typed, schema-constrained form

Obsidian remains the file owner. The editor reads the full `.md` file, splits frontmatter from body, shows them in separate surfaces, and re-assembles on save. The file on disk must be bitwise-correct after every save.

**Scope**: `FragmentPage` only. `fragment-detail.tsx` remains in use on the project shell page and is not replaced.

---

## Editor decision: CodeMirror 6

**Chosen over**: TipTap (no real vim, WYSIWYG round-trip risk), Milkdown (same + maintenance), Monaco (bundle size), Lexical (no vim).

| Concern          | Decision                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Default mode     | Rendered markdown preview (remark/rehype pipeline with `rehype-sanitize`)                                                                   |
| Vim mode         | Source-only via CM6 + `@replit/codemirror-vim` — full modal editing (normal/insert/visual, text objects, macros, `:` commands)              |
| Vim toggle       | Hardcoded `vimMode: boolean` prop on `ProseEditor`; wire to a real settings system later                                                    |
| React wrapper    | `@uiw/react-codemirror` — actively maintained (v4.25.x), React 19 peer-compatible                                                           |
| Markdown support | `@codemirror/lang-markdown` — syntax highlight, folding (used in vim/source mode)                                                           |
| Theming          | Custom `EditorView.theme()` reading existing CSS variables; `@tailwindcss/typography` prose styles for rendered preview (already installed) |

**Key risk — React 19 strict-mode double-mount**: CM6 uses an imperative DOM ref. `@uiw/react-codemirror` handles `EditorView` creation in a `useEffect` with cleanup, but `defineEx("w", ...)` for the vim `:w` binding must be called inside `onCreateEditor` callback (not at component top level) to avoid capturing a stale view reference on remount.

---

## Metadata decision: react-hook-form + zod

**Chosen over**: AutoForm / schema-driven generation (breaks on dynamic record keys from API).

Fragment schema fields and their UI treatment:

| Field         | Type                                 | Input                                                                                   |
| ------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `title`       | `string`                             | Text input                                                                              |
| `pool`        | `enum`                               | Select (shadcn `Select`)                                                                |
| `readyStatus` | `number` (0–1)                       | Slider displayed as percentage (0–100); multiply ×100 for default value, ÷100 on submit |
| `notes`       | `string[]`                           | Tag input (useFieldArray)                                                               |
| `references`  | `string[]`                           | Tag input (useFieldArray)                                                               |
| `properties`  | `Record<string, { weight: number }>` | Per-aspect sliders, keys from `/aspects` API                                            |

The `properties` section — keys come from `useListAspects(projectId)` (generated hook). Iterate the fetched aspect list, render one slider per aspect (0–100%, ÷100 on submit), register each via `register("properties.aspectKey.weight")`.

**Unknown aspect keys**: If a fragment contains `properties` keys for aspects that no longer exist in the project, those keys must be **preserved on save** (merged back into the submit payload). Do not discard keys that have no rendered slider — this would silently delete user data.

---

## Architecture

```
FragmentPage
  └── FragmentEditorLayout              (two-panel split or stacked)
        ├── ProseEditor                 (vimMode: boolean hardcoded for now)
        │     ├── [default]  MarkdownPreview   (remark/rehype render, @tailwindcss/typography)
        │     │              "Edit" / "Save" toggle → switches to CM6 source, back to preview on save
        │     └── [vim mode] CodeMirror 6 source editor
        │                   content = fragment.content (body only)
        │                   onSave → PATCH /fragments/:id
        └── MetadataPanel
              └── FragmentMetadataForm  (react-hook-form + zod)
                    useListAspects(projectId) → dynamic properties section
                    onSubmit → PATCH /fragments/:id
```

**Save contract**: Both surfaces save independently. The prose editor saves the body; the metadata form saves frontmatter fields. Both call `PATCH /fragments/:id` with their respective subset of the fragment schema.

**Concurrent save risk**: Two independent PATCHes writing to the same file can race. Auto-save is explicitly deferred to avoid this. When auto-save is added later, the API must use the `version` field (already present on `Fragment`) as an optimistic lock — reject stale writes with 409.

**Frontmatter split**: The API strips frontmatter — `fragment.content` is the body only, and metadata fields are first-class properties. No client-side YAML parsing needed. The YAML round-trip (fragment fields → `.md` file on disk) is the server's responsibility; test it explicitly in Phase 5.

---

## Phase 0 — PATCH endpoint (blocker)

The entire save contract depends on `PATCH /fragments/:id`, which does not exist yet.

- Add `FragmentUpdateSchema` (zod) in `packages/api/src/routes/fragments.ts` — partial of fragment fields: `title`, `content`, `pool`, `readyStatus`, `notes`, `references`, `properties`
- Add `PATCH /:id` route handler — read existing file, merge fields, write back
- The write-back must regenerate YAML frontmatter correctly; treat bitwise round-trip correctness as an acceptance criterion
- Regenerate the orval client after the route is added so `useUpdateFragment` is available in the frontend

---

## Phase 1 — Dependencies

In `packages/frontend`:

```sh
bun add @uiw/react-codemirror @codemirror/lang-markdown @replit/codemirror-vim
bun add react-hook-form @hookform/resolvers zod
bun add remark@15 remark-gfm@4 remark-rehype rehype-sanitize@6 rehype-react@8
```

Package status (verified April 2026):

- `@replit/codemirror-vim` — canonical CM6 vim implementation, no official `@codemirror/vim` exists; actively maintained (latest v6.3.0, Feb 2026 fixes)
- `@uiw/react-codemirror` — v4.25.x, React 19 peer-compatible (React 19 CI validation in progress upstream, not a blocker)
- `rehype-react@8` — current, not deprecated; uses jsx-runtime internally; pass `{ Fragment, jsx, jsxs }` from `react/jsx-runtime`
- `remark@15`, `remark-gfm@4`, `remark-rehype`, `rehype-sanitize@6` — all current under unified v11, ESM-only (Vite/Bun handle this fine)

**ESM note**: The entire remark/rehype stack is pure ESM. If a "require() of ES module" error appears, fix the importing module — not these packages.

**`rehype-sanitize` schema note**: Default schema mirrors GitHub's allowlist. GFM tables and task lists survive; raw HTML blocks (e.g. `<details>`, `<kbd>`) are stripped. If Obsidian notes contain HTML that must render, extend the default schema.

No other new dependencies. shadcn `Select`, `Slider`, `Input`, `Form` components are already available or can be added via `bunx shadcn add`.

---

## Phase 2 — Prose editor component

File: `packages/frontend/src/components/fragments/prose-editor.tsx`

Props: `content: string`, `vimMode: boolean`, `onSave: (body: string) => void`

**Default mode (vimMode = false):**

- Render markdown via remark → rehype → React: `remark-gfm` for GFM, `rehype-sanitize` to strip unsafe HTML/scripts, `rehype-react@8` to produce React elements (pass `{ Fragment, jsx, jsxs }` from `react/jsx-runtime`)
- Apply `prose` typography classes from `@tailwindcss/typography`
- Include a visible "Edit" / "Save" toggle to switch to a plain CM6 source editor, back to preview on save
- No vim keybindings in this mode

**Vim mode (vimMode = true):**

- CM6 source editor, always visible (no preview toggle)
- Extensions: `markdown()`, `vim()`
- Custom `EditorView.theme()` reading `var(--color-*)` and `var(--font-mono)` CSS variables
- Wire `:w` inside `onCreateEditor` callback: `defineEx("w", "", () => onSave(view.state.doc.toString()))` — must not be called at component top level to avoid stale-closure bugs on React 19 remount

**XSS note**: `rehype-sanitize` is required whenever rendering markdown as HTML. It strips `<script>`, event handlers, and `javascript:` hrefs. This matters especially in Tauri where webview scripts can reach local IPC.

---

## Phase 3 — Metadata form

File: `packages/frontend/src/components/fragments/fragment-metadata-form.tsx`

- Define `fragmentFormSchema` with zod — use `z.record(z.string(), z.object({ weight: z.number() }))` for `properties` (keys are dynamic, validated by shape not enumeration)
- `useForm` with `zodResolver(fragmentFormSchema)`, default values from `fragment` prop
  - `readyStatus` default: `fragment.readyStatus * 100` (display scale); divide by 100 on submit
- `useFieldArray` for `notes` and `references` — minimal tag input built in-house (text input + enter to add, × to remove)
- `useListAspects(projectId)` from the generated client for dynamic `properties`
- Render each aspect as a labeled Slider (0–100 display, ÷100 on submit) in a grid
- **Preserve unknown keys**: on submit, merge rendered aspect values over the original `fragment.properties` rather than replacing entirely — this keeps keys for aspects that were deleted from the project
- Explicit save button; no auto-save for now

---

## Phase 4 — Layout and wiring

File: `packages/frontend/src/components/fragments/fragment-editor.tsx`

- Update `FragmentPage.tsx` to import from `fragment-editor.tsx` (not `fragment-detail.tsx` — that file stays for the project shell page)
- Side-by-side layout on wide screens, stacked on narrow: metadata left/top, prose right/bottom
- Fetch fragment with `useGetFragment`, pass body to `ProseEditor`, pass metadata to `FragmentMetadataForm`
- Handle loading/error states

---

## Phase 5 — Polish and round-trip test

- Style the CM6 editor to match the editorial theme (serif font in content area, no visible borders, cursor matches theme accent)
- Add a `readyStatus` visual indicator (color or dot) next to the title in the editor header
- Keyboard shortcut to toggle focus between prose and metadata panels
- **Round-trip test**: load a fragment → edit body and metadata → save → reload → assert file on disk has correct YAML frontmatter and body with no corruption or field loss

---

## Resolved decisions

| Question              | Decision                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Save trigger          | Explicit — save button (metadata) and `:w` + button (vim). No auto-save.                                |
| Tag input             | Build minimal in-house: text input + Enter to add, × to remove, backed by `useFieldArray`               |
| Aspect weight display | Percentage (0–100) in UI; ×100 for defaults, ÷100 before submitting to API                              |
| Content preview       | Rendered markdown (remark/rehype) in default mode; raw source in vim mode                               |
| Vim mode              | Hardcoded `vimMode: boolean` prop. Wire to a real config system later.                                  |
| Unknown aspect keys   | Preserve on save — merge rendered values over original `fragment.properties`                            |
| Concurrent saves      | No auto-save; manual saves only until `version`-based optimistic locking is in the API                  |
| Fragment detail       | `fragment-detail.tsx` stays on the project shell page; `fragment-editor.tsx` is for `FragmentPage` only |
