---
name: Editor library evaluation
description: CodeMirror 6 evaluated as the best fit for Maskor's fragment editor; vim mode, theming, and markdown round-trip rationale documented
type: project
---

CodeMirror 6 (`@codemirror/lang-markdown` + `@replit/codemirror-vim`) is the recommended editor for the Maskor fragment editor.

**Why:**

- `@replit/codemirror-vim` is the only production-quality vim implementation across all React editor options. TipTap's only vim option (Vimirror) is a community experiment with no official support. Lexical has no vim mode at all.
- Maskor stores content as raw markdown files. CodeMirror treats text as text — it reads and writes the string directly. TipTap's ProseMirror model converts markdown to an internal document graph, requiring a serialize step back to markdown; round-trip fidelity is still imperfect for edge cases (nested marks, custom frontmatter-adjacent syntax).
- Bundle: CodeMirror 6 core + markdown + vim ≈ 135–150kb gzipped total. TipTap StarterKit + markdown extension is comparable but requires more packages.
- Theming: CM6 uses a CSS-in-JS extension system. Custom themes can be built as plain JS objects, and Maskor's CSS variables (OKLCH palette, IBM Plex Mono, EB Garamond) can be wired in directly without fighting a component library.
- React integration: no official wrapper; `@uiw/react-codemirror` is the community standard and actively maintained.

**Ruled out:**

- TipTap: WYSIWYG (hides markdown syntax) — wrong UX for a writing tool that co-exists with Obsidian and raw files. Vim mode is unofficial/low quality.
- Milkdown: WYSIWYG ProseMirror fork, maintainer sustainability concerns, React integration awkward.
- Lexical (Meta): No vim mode, no real markdown source editing — rich text only.
- Monaco: Overkill (VS Code engine), large bundle, LSP-oriented — wrong fit for prose.

**How to apply:** When implementing the editor component, start from `@uiw/react-codemirror` with `@codemirror/lang-markdown`, `@replit/codemirror-vim`, and a custom CM6 theme that reads Maskor's CSS variables.
