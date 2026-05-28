# Review: Import Pipeline — Stage 2

**Date**: 2026-05-16
**Scope**: `packages/api/src/{commands,routes,schemas}/{import-preview,preview-import,import}*`, `packages/frontend/src/pages/{FragmentImportPage,FragmentListPage}.tsx`, `packages/frontend/src/router.ts`, `specifications/import-pipeline.md`
**Plan**: `tasks/prd-import-pipeline-stage-2.md`
**Spec**: `specifications/import-pipeline.md`

---

## Overall

Backend is clean: `createPreviewImportCommand` mirrors `createImportCommand` exactly, the new route goes through `executeCommand`, tests cover the happy paths, and the spec annotations match the PRD. Frontend has two real bugs that surface for any user who has tweaked project typography or imports a large `.docx`: the preview ignores per-project font-size and paragraph-width settings, and there is effectively no loader while the first preview is being built. One design issue around the sidebar scroll-to-piece behavior is worth queuing.

---

## Bugs

### 1. Preview ignores per-project typography settings

`packages/frontend/src/pages/FragmentImportPage.tsx:58-72` — `ReadonlyEditor` hardcodes `prose prose-stone dark:prose-invert max-w-none px-1 py-2` with no `fontSize` or `maxParagraphWidth`. Every other prose view in the app reads `useProjectEditorConfig(projectId)` and applies the values via inline `style` on a centered wrapper — see `packages/frontend/src/components/prose-editor.tsx:142-152` and `packages/frontend/src/components/entity-editor-shell.tsx:178-189`. Per `specifications/project-config.md` ("Font size and paragraph width are configurable per project from the General tab and applied live across all editor modes."), the preview is the only place the setting has no effect — and it's the place where a wide-text user is most likely to notice, because the rendered document also has no max-width and sprawls edge-to-edge.

```
user sets project fontSize=20, maxParagraphWidth=80
→ opens fragment editor → 20px text, 80ch column     ✓
→ opens import preview  → 16px (Tailwind prose default), full width   ✗
```

Fix: call `useProjectEditorConfig(projectId)` in `FragmentImportPage`, pass `fontSize` and `maxParagraphWidth` to `ReadonlyEditor`, wrap `<EditorContent>` in `<div className="mx-auto w-full" style={{ fontSize: \`${fontSize}px\`, maxWidth: \`${maxParagraphWidth}ch\` }}>`to match the`ProseEditor` non-vim branch.

### 2. No prominent loader during initial preview of large docs

`packages/frontend/src/pages/FragmentImportPage.tsx:329-342` — render branching for the main area:

```
previewError              → error block
pieceCount===0 && !isPreviewPending → empty-state hint
otherwise                 → <ReadonlyEditor content={previewMarkdown} />
```

On mount with a fresh file, `previewResult` is null → `pieceCount===0`, but `isPreviewPending` is true, so the empty-state branch is skipped and the editor renders with `content=""`. The only loading signal is the small `Loader2Icon` top-right (`:293`) and `opacity-60` on an already-empty area (`:326`). For a 2–5s `.docx` going through mammoth + turndown the page looks dead.

Fix: add an explicit branch before the empty-state check:

```tsx
if (isPreviewPending && !previewResult) {
  return centered <Loader2Icon /> + "Converting…" hint;
}
```

Or fold it into the existing chain: `pieceCount === 0 && isPreviewPending` → centered spinner. Either way the user gets feedback before the first preview lands.

---

## Design

### 3. Sidebar scroll-to-piece is text-match brittle

`packages/frontend/src/pages/FragmentImportPage.tsx:194-203` — `scrollToPiece` selects every `<strong>` in the main area and matches by `textContent.startsWith("Piece N ·")`. Any user content that contains a bold `Piece 3 · whatever` snippet collides; the first match wins, so the wrong block scrolls into view.

This was flagged explicitly in the PRD ("Technical Considerations" → "Banner anchor for scroll-to-piece"), which recommended either a tiptap node-view or a post-mount DOM tag-by-index pass. Neither was done. Not breaking for normal use, but it's a future debugging trap once someone imports a document that happens to mention "Piece" in bold.

Fix: after `setContent` finishes, walk the rendered DOM and tag the Nth banner `<strong>` with `data-piece-index={N}` (or an `id`). Match on that attribute instead of text. Cheap, robust.

---

## Minor

### 4. Reload-redirect path relies on `File` not surviving history.state

`packages/frontend/src/pages/FragmentImportPage.tsx:86-87, 104-111` — the page reads `useRouterState({ select: s => s.location.state })` and redirects if `file` is missing. TanStack Router persists `location.state` into `history.state`, which goes through structured-clone serialization on actual browser reload. `File` does survive structured clone in modern browsers, so reload may _not_ redirect — the file would re-appear and the page would try to preview a hydrated `File`. AC requires reload → redirect to fragment list.

The Ralph progress note flagged that browser verification wasn't available in the sandbox. Worth one manual check: open preview → reload → confirm redirect fires. If the `File` does survive, either guard explicitly (`window.performance.getEntriesByType("navigation")[0].type === "reload"` → redirect) or stash a session-only token instead of the `File` and look it up from a `useRef` registry that resets on hard reload.

### 5. `previewError` shape buckets all failures as "please try again"

`FragmentImportPage.tsx:130-134` — both non-200 responses and network errors collapse to a single string. The corrupt-docx 500 path returns `body.message` (verified in `routes/import-preview.test.ts:212-230`); surfacing that to the user would explain _why_ the preview failed (e.g. "not a valid .docx"). Cheap improvement, not a defect.

### 6. Mount-only initial preview suppresses lint rule

`FragmentImportPage.tsx:140-146` — `// eslint-disable-next-line react-hooks/exhaustive-deps` on the mount effect. Fine given the page only ever sees a single `file` per mount (caller navigates afresh each time), but worth a one-line comment so the next reader doesn't try to "fix" it.

---

## Non-issues

- **Preview route goes through `executeCommand` even though `logEntries` is always `[]`.** Matches `packages/api/CLAUDE.md` ("Every state-changing API operation must go through `src/commands/`"); preview isn't state-changing but routing it the same way keeps the entry-point shape uniform and costs nothing.
- **`PreviewPiece` and `PreviewImportResult` defined in the command file rather than a shared schema module.** Stage 1 did the same for `ImportInput`/`ImportResult`/`ImportError`; consistency wins. If a third consumer appears, promote.
- **`convertedMarkdown` round-trips the entire document over the wire on every options change.** Documented and justified in PRD "Technical Considerations" (avoids client/server split drift; sub-MB for typical docs). `references/suggestions.md` already carries the backend-session-cache follow-up.
- **`z.any()` for the multipart `file` field on the preview schema** (`packages/api/src/schemas/import.ts`) — same Orval/multipart limitation called out in the Stage 1 review; route handler enforces `instanceof File` at runtime.
- **`pieceCount > 0` length check instead of `!!pieces.length`** (`FragmentImportPage.tsx:304`) — `CODING_STANDARDS.md` prefers `!!`/`!` for length checks. Minor, but worth a pass with `replace_all` if cleaning up.
- **PRD AC requires "Verify in browser using dev-browser skill"; Ralph couldn't and noted it manually.** The two browser-visible defects above are exactly what that check would have caught — manual browser verification is the remaining gate.
