# Prose Editor — TipTap WYSIWYG

**Date**: 18-04-2026
**Status**: Done
**Implemented At**: 20-04-2026

---

## Goal

Replace the current default mode of `ProseEditor` (remark/rehype rendered preview + CM6 edit toggle) with a live TipTap WYSIWYG editor. The user edits rendered prose directly — no markdown syntax visible, no preview/edit toggle. A small toolbar provides formatting controls (headings, bold, italic, etc.). Under the surface, the content field remains raw markdown; the TipTap→markdown serialization is invisible to the user.

**Scope**: `ProseEditor` default mode only. Vim mode (`vimMode = true`) is unchanged. `ProseEditor` props (`content`, `vimMode`, `onSave`) are unchanged. Frontmatter/metadata is handled by `FragmentMetadataForm` and is unaffected.

---

## Round-trip fidelity assessment

`tiptap-markdown` (the serialization layer) round-trips the following correctly:

| Construct                   | Supported                          |
| --------------------------- | ---------------------------------- |
| Paragraphs                  | Yes                                |
| Headings (H1–H6)            | Yes                                |
| Bold, italic, strikethrough | Yes                                |
| Inline code                 | Yes                                |
| Fenced code blocks          | Yes                                |
| Blockquotes                 | Yes                                |
| Bullet and ordered lists    | Yes                                |
| Horizontal rule             | Yes                                |
| Links                       | Yes (via `@tiptap/extension-link`) |

**Constructs that would be silently lost:**

| Construct                              | Risk                                                      |
| -------------------------------------- | --------------------------------------------------------- |
| Raw HTML blocks (`<details>`, `<kbd>`) | Stripped — TipTap has no HTML block node                  |
| Obsidian wiki links (`[[Note Title]]`) | Not valid Maskor syntax — plain text treatment is correct |
| Footnotes                              | Not supported — dropped                                   |
| GFM tables                             | Dropped unless `@tiptap/extension-table` is added         |

For pure prose content these are very unlikely. The main practical risk is wiki links: they survive as text but lose the `[[...]]` wrapper. If fragments contain wiki links in the body, make that visible to the user before adopting TipTap as the default.

**Recommendation**: Before implementing, scan a real vault's fragment bodies for `[[`, raw HTML, and `[^` footnotes. If none are found, proceed with confidence.

---

## Architecture

No changes to component interfaces. `ProseEditor` replaces its internal default-mode implementation:

```
ProseEditor (props: content, vimMode, onSave)
  ├── [vimMode = true]  CodeMirror 6 + vim — unchanged
  └── [vimMode = false] TipTap editor (replaces remark/rehype + CM6 toggle)
        ├── ProseToolbar   (heading, bold, italic, strike, quote, lists)
        └── EditorContent  (TipTap React component, prose-styled)
```

The `isEditing` boolean state and the plain CM6 edit mode are removed entirely.

---

## Dependencies

### Add

```sh
bun add @tiptap/react @tiptap/core @tiptap/starter-kit tiptap-markdown @tiptap/extension-link @tiptap/extension-typography
```

| Package                        | Purpose                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `@tiptap/react`                | React integration (`useEditor`, `EditorContent`)                                                      |
| `@tiptap/core`                 | Core types and extension API                                                                          |
| `@tiptap/starter-kit`          | All prose extensions in one: headings, bold, italic, strike, code, lists, blockquote, horizontal rule |
| `tiptap-markdown`              | Markdown → TipTap doc on load; TipTap doc → markdown on save. This is the key round-trip layer.       |
| `@tiptap/extension-link`       | Link support; adds `editor.chain().setLink()`                                                         |
| `@tiptap/extension-typography` | Smart quotes, em-dashes, ellipsis — good for prose writing                                            |

### Remove (from `packages/frontend/package.json`)

Once TipTap replaces the default mode, these are no longer used:

```sh
bun remove remark remark-gfm remark-rehype rehype-sanitize rehype-react
```

The vim mode still uses CM6 packages — those stay.

---

## Phase 1 — Vault content audit

Before writing any code, verify round-trip safety:

- Open the dev vault's `fragments/` directory and scan body content for: `[[`, `[^`, `<details`, `<kbd`, `<div`, `|---|`
- If wiki links (`[[`) appear in bodies: these are Obsidian-specific syntax with no meaning in Maskor. TipTap rendering them as plain text (dropping the `[[...]]` markers) is the correct behavior.
- If HTML blocks appear: same decision required.
- If neither appears: proceed to Phase 2.

This is a manual check, not a code step.

---

## Phase 2 — Install dependencies

```sh
bun add @tiptap/react @tiptap/core @tiptap/starter-kit tiptap-markdown @tiptap/extension-link @tiptap/extension-typography --cwd packages/frontend
```

Verify no peer dep warnings for React 19. TipTap v2 declares `react@^18 || ^19` as a peer — this is fine.

---

## Phase 3 — `ProseToolbar` component

File: `packages/frontend/src/components/fragments/prose-toolbar.tsx`

Props: `editor: Editor | null`

Controls (all use `editor.chain().focus().<command>().run()`):

| Control                 | Command                                 |
| ----------------------- | --------------------------------------- |
| Paragraph (normal text) | `setParagraph()`                        |
| H1, H2, H3              | `toggleHeading({ level: 1 \| 2 \| 3 })` |
| Bold                    | `toggleBold()`                          |
| Italic                  | `toggleItalic()`                        |
| Strikethrough           | `toggleStrike()`                        |
| Blockquote              | `toggleBlockquote()`                    |
| Bullet list             | `toggleBulletList()`                    |
| Ordered list            | `toggleOrderedList()`                   |
| Horizontal rule         | `setHorizontalRule()`                   |

Use `editor.isActive(...)` to apply an active/pressed visual state to each button. Style with the existing `Button` component (`variant="ghost"`, `size="icon"`).

Keep the toolbar minimal — match the editorial theme (no visible borders, monochrome icons). Use `lucide-react` icons (`Bold`, `Italic`, `Strikethrough`, `Heading1/2/3`, `Quote`, `List`, `ListOrdered`, `Minus`). `lucide-react` is already installed.

---

## Phase 4 — `ProseEditor` default mode rewrite

File: `packages/frontend/src/components/fragments/prose-editor.tsx`

**What changes:**

- Remove `remark`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`, `rehype-react`, `react/jsx-runtime` imports
- Remove `useMarkdownRenderer` hook
- Remove `isEditing` state and the CM6 edit/preview toggle
- Add `useEditor` with `StarterKit`, `Markdown` (from `tiptap-markdown`), `Link`, `Typography`
- Render `<ProseToolbar editor={editor} />` + `<EditorContent editor={editor} />`
- Save button calls `onSave(editor.storage.markdown.getMarkdown())`

**Key `useEditor` configuration:**

```ts
const editor = useEditor({
  extensions: [
    StarterKit,
    Markdown.configure({ html: false, transformPastedText: true }),
    Link.configure({ openOnClick: false }),
    Typography,
  ],
  content: Markdown.parse(content), // parse initial markdown to TipTap doc
  editorProps: {
    attributes: {
      class: "prose prose-stone dark:prose-invert max-w-none focus:outline-none",
    },
  },
});
```

`html: false` in the Markdown extension tells the serializer not to emit raw HTML — safer for Obsidian round-trips.

**Update on external `content` prop change** (when SSE invalidation reloads fragment):

```ts
useEffect(() => {
  if (editor && content !== editor.storage.markdown.getMarkdown()) {
    editor.commands.setContent(Markdown.parse(content));
  }
}, [content, editor]);
```

The guard prevents overwriting in-flight edits when the prop hasn't actually changed.

**Save trigger**: explicit "Save" button only — no auto-save. Vim mode save (`:w`) is unchanged.

---

## Phase 5 — Styling

TipTap renders into a `div.ProseMirror`. The `prose` class from `@tailwindcss/typography` (already installed) handles all typography styling via `editorProps.attributes.class` above.

Additional CSS:

- Font: `var(--font-serif)` on the `.ProseMirror` container (match the editorial theme; currently content displays in sans)
- Remove ProseMirror default focus ring: `focus:outline-none` (already in the class list above)
- Cursor: match theme accent color via `caret-color: var(--color-accent)` or similar

No new CSS files needed — add a scoped `EditorView.theme()` equivalent via a CSS class in the existing global/component styles.

---

## Resolved decisions

| Question               | Decision                                                                   |
| ---------------------- | -------------------------------------------------------------------------- |
| WYSIWYG library        | TipTap v2 + `tiptap-markdown`                                              |
| Vim mode               | CodeMirror 6, unchanged                                                    |
| Markdown serialization | `tiptap-markdown` (community, quasi-official for TipTap v2)                |
| HTML in markdown       | Disabled (`html: false`) — safer round-trips                               |
| Tables                 | Not in scope for now; add `@tiptap/extension-table` later if needed        |
| Wiki links             | Not valid Maskor syntax; plain text treatment (markers dropped) is correct |
| Preview/edit toggle    | Removed — TipTap is always-live WYSIWYG                                    |
| Save trigger           | Explicit save button, no auto-save                                         |
| Toolbar placement      | Fixed above the editor content area                                        |
