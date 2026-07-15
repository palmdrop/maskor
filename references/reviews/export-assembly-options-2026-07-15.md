# Review: Export-owned assembly options + page-break separator

**Date**: 2026-07-15
**Status**: Resolved
**Scope**: `packages/api`, `packages/exporter`, `packages/frontend`, `packages/shared`, `packages/storage`
**Spec**: `specifications/export.md` (2026-07-15 Shipped entry)

---

## Overall

Implementation matches the shipped entry. The `export` config block cleanly takes ownership of the assembly options (titles, section headings, separator) with per-export overrides, mirroring the annotation-toggle pattern exactly — same `useProjectSetting` lifecycle in the dialog, same `input ?? config` fallback in the command, same optional action-log fields. The page-break separator is handled at both ends: form feed emitted by the assembler, lowered to a real `<w:br w:type="page"/>` in docx. Old manifests without the new fields merge safely over `PROJECT_CONFIG_DEFAULTS` in `toProjectRecord`. Tests cover the config-fallback path, the override path, the assembler emission, and the docx lowering; all pass. No bugs found. One design issue (enum duplication) and a small docx output wart worth fixing.

---

## Bugs

None.

---

## Design

### 1. Export separator enum is duplicated in four places

`packages/shared/src/schemas/domain/project.ts:37` and `:94`, `packages/shared/src/schemas/domain/action.ts:297`, `packages/api/src/schemas/export.ts:32` — the literal `z.enum(["blank-line", "horizontal-rule", "page-break", "none"])` appears four times. When `custom` (already modeled in `AssemblySeparator` and named in the spec's scope) lands, all four must change in lockstep; miss one and the schemas silently diverge (e.g. a project config accepts a value the action log rejects). Extract a shared `ExportSeparatorSchema` (and derived type) in `@maskor/shared` and reference it everywhere, including the API body schema.

---

## Minor

### 2. Docx page break rides its own empty paragraph

`packages/exporter/src/markdown-to-docx.ts:234` — `new Paragraph({ children: [new PageBreak()] })` puts the break in a standalone paragraph, so the paragraph mark lands at the top of the new page: every fragment after a page break starts with one stray blank line. Setting `pageBreakBefore: true` on the *following* paragraph avoids the extra paragraph entirely. Needs a small lookahead/flag when flattening blocks, but produces cleaner Word output.

### 3. Unchecked separator cast in the export request

`packages/frontend/src/components/ExportDialog.tsx:132` — `separator.draft as Separator` trusts the value read from the project config. A hand-edited manifest with an out-of-set separator flows straight into the request and 400s at the API (and leaves the Select rendering blank). `editor.language` gets a coerce-on-read guard in `toProjectRecord`; `preview.separator` and `export.separator` don't. Same pre-existing pattern as the preview toolbar's `value as SeparatorType`, so noting rather than demanding a fix here.

### 4. Form-feed-only paragraph in a fragment body is indistinguishable from the separator

`packages/exporter/src/markdown-to-docx.ts:204` — `isPageBreakParagraph` matches any paragraph that is exactly one `\f` text node, so a fragment body containing one becomes a page break in docx. Conversely, a `\f` embedded *inside* a text line still reaches the XML un-lowered (invalid XML 1.0 character — pre-existing exposure, not introduced by this diff). Both sit squarely in the spec's "behaviour is undefined for unsupported content" territory. Note only.

---

## Non-issues

- **Dialog always sends every override** — `handleExport` sends `showTitles`/`showSectionHeadings`/`separator` unconditionally, so the command's config-fallback path is never hit from the dialog. Intentional: identical to the annotation-toggle precedent, and the fallback path is what non-dialog API clients get; it has its own test.
- **`Object.keys(SEPARATOR_LABELS)` for Select order** — string-key insertion order is guaranteed in JS; the record doubles as the ordered option list.
- **Defaults duplicated between `useProjectSetting` call sites and `PROJECT_CONFIG_DEFAULTS`** — existing pattern for every setting; the hook default only covers the load gap before the project record (which always carries merged defaults) arrives.
- **Old manifests lacking the new `export` fields** — `toProjectRecord` spreads `config?.export` over `PROJECT_CONFIG_DEFAULTS.export`, so pre-existing projects read back with defaults; `updateProject`'s manifest write deep-merges partial patches. No migration needed.
- **`specifications/obsidian-port.md` table reflow** — prettier formatting noise, committed separately as a chore commit; no content change.
- **`custom` separator not shipped** — in the spec's scope but explicitly modeled as future in `AssemblySeparator`; the spec is Draft and the shipped entry doesn't claim it.

---

## Resolution

1. **Fixed.** Extracted `ExportSeparatorSchema` (+ inferred `ExportSeparator` type) into `packages/shared/src/schemas/domain/project.ts` — the project config owns the setting, and the domain barrel already re-exports `project.ts`. Enum value order preserved. Replaced all four literals: both `export` blocks in `project.ts`, the `sequence:exported` payload in `action.ts` (imports the shared schema), and `ExportSequenceBodySchema.separator` in `packages/api/src/schemas/export.ts` (`ExportSeparatorSchema.optional().openapi(...)`, keeping the existing metadata — same pattern as `AspectColorSchema`). Also dropped the local `type ExportSeparator = Project["export"]["separator"]` alias in `packages/api/src/commands/exports/export-sequence.ts` for the shared type. `bun run codegen` regenerated the OpenAPI snapshot as a no-op (identical values/order) — `openapi.json` unchanged.

2. **Fixed.** The docx page break no longer rides its own empty paragraph. `markdownToDocx`'s root walk now intercepts the form-feed-only separator paragraph, skips it, and flags the next block's first Paragraph with `pageBreakBefore: true` (threaded through `blockToDocx` and applied to the first emitted paragraph across every block type — heading, paragraph, blockquote, code, thematicBreak, list). A trailing separator with no following block is dropped; consecutive separators collapse to one flag; a block that emits no paragraph keeps the flag pending so the break rides the next real block. The `isPageBreakParagraph` guard is retained inside the paragraph case as a defensive net for a `\f` paragraph nested inside a blockquote/footnote definition (not seen by the root walk), where it still lowers to a standalone `PageBreak` rather than leaking a raw form feed. Test updated: the assertion now expects `<w:pageBreakBefore/>` (not `<w:br w:type="page"/>`), verifies exactly two body paragraphs (no empty separator paragraph), keeps the no-raw-`\f` and both-fragments-survive assertions, and a new case covers a heading following the break. Spec line in `specifications/export.md` ("lowered to a real Word page break") remains accurate — no change.

3. **Won't fix.** Unchecked `separator.draft as Separator` cast in `ExportDialog.tsx` — pre-existing pattern (same as the preview toolbar's `value as SeparatorType`); noted only, no coerce-on-read guard added.

4. **Won't fix.** A form-feed-only paragraph in a fragment body being indistinguishable from the separator (and an embedded `\f` reaching the XML un-lowered) sits in the spec's "behaviour is undefined for unsupported content" territory. Note only.
