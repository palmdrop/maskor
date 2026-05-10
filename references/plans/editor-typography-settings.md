# Editor Typography Settings

**Date**: 10-05-2026
**Status**: Done
**Closed**: 10-05-2026
**Specs**: `specifications/fragment-editor.md`

---

## Goal

Users can configure `fontSize` and `maxParagraphWidth` per project from the General tab in Project Config; settings persist to `.maskor/project.json` and are applied live in the fragment editor for all three editor modes (TipTap, raw markdown, vim).

---

## Tasks

### Phase 1: Shared domain schema

- [x] Add `fontSize: z.number().int().min(12).max(24)` to `ProjectSchema.editor` in `packages/shared/src/schemas/domain/project.ts`
- [x] Add `maxParagraphWidth: z.number().int().min(40).max(120)` to `ProjectSchema.editor`
- [x] Add optional equivalents (`fontSize?: ...`, `maxParagraphWidth?: ...`) to `ProjectUpdateSchema.editor`

### Phase 2: Storage layer

- [x] Add `fontSize?: number` and `maxParagraphWidth?: number` to `ProjectManifest.config.editor` in `packages/storage/src/registry/registry.ts`
- [x] Add `fontSize: number` and `maxParagraphWidth: number` to `ProjectRecord.editor` in `packages/storage/src/registry/types.ts`
- [x] Extend `toProjectRecord` to read both fields from manifest with defaults: `fontSize ?? 16`, `maxParagraphWidth ?? 72`
- [x] Extend `updateProject` patch type to accept `editor?: { ..., fontSize?: number; maxParagraphWidth?: number }`
- [x] Add `fontSize: 16` and `maxParagraphWidth: 72` to the default config block written in `registerProject` (only affects new project registrations — existing projects fall back to defaults in `toProjectRecord`)

### Phase 3: Frontend generated types

- [x] Regenerate via `bun run codegen` in `packages/frontend`. Assume the API is running.

### Phase 4: Frontend hook

- [x] Extend `ProjectEditorConfig` type in `useProjectEditorConfig.ts` with `fontSize: number` and `maxParagraphWidth: number`
- [x] Return both fields from the hook with the same defaults used in storage (`fontSize ?? 16`, `maxParagraphWidth ?? 72`)

### Phase 5: ProseEditor component

- [x] Add `fontSize: number` and `maxParagraphWidth: number` to `Props` in `prose-editor.tsx`
- [x] **TipTap mode**: wrap the `ProseToolbar` + `EditorContent` area in a div with `style={{ fontSize: `${fontSize}px`, maxWidth: `${maxParagraphWidth}ch` }}` and `mx-auto` centering; remove `max-w-none` from TipTap's `editorProps.attributes.class` if adding an outer constraint
- [x] **CM6 raw-markdown mode**: apply font size via a `useMemo`-derived `EditorView.theme` (extend `vimEditorTheme` pattern); wrap in a div with `maxWidth` style for the width constraint
- [x] **CM6 vim mode**: same theme approach as raw-markdown

### Phase 6: EntityEditorShell

- [x] Pass `fontSize` and `maxParagraphWidth` from `editorConfig` through to `ProseEditor` in `entity-editor-shell.tsx`

### Phase 7: GeneralTab UI

- [x] Add a font size `Slider` (12–24, step 1) to the Editor section in `packages/frontend/src/pages/ProjectConfigPage/tabs/GeneralTab.tsx`, with an `onValueCommit` handler calling `updateProject` (matches the pattern used by `readyStatusThreshold`)
- [x] Add a paragraph width `Slider` (40–120, step 4) with the same save pattern; label unit as `ch` in the helper text
- [x] Display current value as a numeric label next to each slider (match `readyStatusThreshold` display pattern)

### Phase 8: Tests

- [x] Update `packages/storage/src/__tests__/registry.test.ts`: assertions on `project.editor` must include the two new fields with their defaults
- [x] Add test cases for `updateProject` with the new editor fields

---

## Notes

**Applying maxParagraphWidth in TipTap**: The current class `max-w-none` on the prose content div disables width capping. The plan is to move the width cap to a wrapping div (so CM6 editors also benefit from a single pattern) rather than fighting Tailwind's prose class. `mx-auto` on the same wrapper keeps the content centered when narrower than the panel.

**Dynamic CM6 theme**: `vimEditorTheme` is currently a module-level constant. To make font size reactive, extract it into a component-level `useMemo(() => EditorView.theme({...}), [fontSize])`. The extension array passed to `<CodeMirror extensions={[...]}>` will update when the memo changes; `@uiw/react-codemirror` handles extension diffing.

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

DO NOT IMPLEMENT until clearly stated by the developer.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented.
