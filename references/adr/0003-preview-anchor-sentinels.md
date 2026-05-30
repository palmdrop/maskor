# Preview/import anchor navigation via sentinel tokens, not raw HTML

The shared read-only renderer used by preview and import is a single Tiptap instance that keeps `Markdown({ html: false })`. Per-fragment scroll anchors (used by the sidebar to jump to a fragment) are emitted by `@maskor/exporter` as collision-safe **sentinel tokens** embedded in the assembled markdown — optional, off for file export, on for preview/import. A custom markdown-it rule recognizes each sentinel and maps it to a schema-modeled, invisible Tiptap anchor node that renders `id="fragment-<id>"` in the DOM. Anchors are therefore a render-time concern owned by the frontend, not bytes the exporter bakes into the document a user would keep.

## Considered options

**(A) Sentinel token + custom markdown-it rule + schema-modeled Tiptap anchor node** — chosen. `html` stays `false` everywhere. The anchor survives ProseMirror parsing because it is a real schema node, not an unknown element. The exported file stays clean (anchors are opt-in; file export requests none). One definition of the sentinel format lives in the assembler core and is reused by both the sequence and import adapters.

**(B) `Markdown({ html: true })` + injected `<span id>` / HTML comment** — rejected for two independent reasons. First, the `html` flag only controls whether markdown-it *escapes* or *emits* raw HTML; ProseMirror still re-parses through the editor schema, which has no node/mark for a bare `<span id>`, so the (empty, invisible) anchor element is dropped during parse — the anchor would not survive regardless of the flag. Second, turning `html: true` on the shared renderer would execute user-authored fragment content (or pandoc-emitted HTML from `.docx` imports) — re-opening the exact `dangerouslySetInnerHTML` injection surface this refactor exists to remove. The exporter is a trusted concatenator of *untrusted* content; "trusted source" is a false comfort.

**(C) Text-content matching** — rejected. This is import's pre-refactor `scrollToPiece` hack (querying `<strong>` elements and matching on text). It is fragile, breaks on duplicate text, and carries the original author's own "I do not like this at all" TODO. The sentinel approach replaces it.

## Consequences

- The assembler core must own a single, collision-safe sentinel syntax that cannot appear in user content (or is escaped if it does). A custom markdown-it rule and a Tiptap node extension are required — modest, schema-local additions.
- The exported markdown file never contains anchors; only the preview/import wire payload carries them. Preview and file export call the same assembler with different `includeAnchors` options, so the byte difference between a preview document and an exported file is exactly the sentinels.
- `html` remaining `false` on the shared renderer means raw HTML in fragment content is still rendered as escaped text — consistent with the editable `ProseEditor`, and a deliberate non-feature.
