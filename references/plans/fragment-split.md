# Fragment Split

**Date**: 13-06-2026
**Status**: In Progress
**Specs**: `specifications/fragment-split.md`

---

## Goal

A user can divide one existing fragment into multiple fragments along a chosen structural delimiter (heading level, thematic break, or blank-line): they preview the resulting pieces in a dialog and confirm, the original keeps its identity as the first piece, and the new pieces inherit aspects + references and slot in immediately after the original in every sequence it is placed in.

---

## Tasks

### Phase 0 — Branch

- [x] Stay in the current branch, and commit the plan and other documentation changes.

### Phase 1 — Shared split engine (`@maskor/importer`)

Extend the shared engine so both import and split draw from one delimiter set. See `specifications/fragment-split.md` (Shared engine) and `specifications/import-pipeline.md` (Shared split engine).

- [x] Add a thematic-break delimiter mode: cut at each `thematicBreak` mdast node (extend the `splitMarkdown` traversal — do not route `---` through `splitPlainText`, to avoid misfiring inside code blocks / setext underlines).
- [x] Add a blank-line / paragraph delimiter mode: cut at each blank-line boundary between top-level blocks.
- [x] Settle the engine's delimiter shape so a single call site can express heading-level / thematic-break / blank-line (a discriminated delimiter config), keeping `deriveKey` title derivation working for each mode.
- [x] Unit-test each new mode in `packages/importer/src/__tests__/splitting.test.ts` (including: no occurrence → single piece; leading content before first delimiter; `---` inside a fenced code block is not a cut).
- [x] Commit.

### Phase 2 — Split-preview command + route (`packages/api`)

Mirror `preview-import` exactly: it is a `Command` run through `executeCommand` (label e.g. `split:preview`) returning empty `logEntries` (read-derivation, no action-log entry), called from a normal `OpenAPIHono` route — see `src/commands/fragments/preview-import.ts` + `src/routes/import-preview.ts`. Writes nothing.

- [x] Add a `createPreviewSplitCommand` under `src/commands/fragments/` that takes `fragmentId` + delimiter config, loads the fragment, runs the shared engine, and returns a **lean** payload: a piece list (`pieceIndex`, key, excerpt) + count. Piece 1 reports the original's existing key; pieces 2…N report `deriveKey`-derived keys computed against existing keys (which still include the original's — no false collision). Do **not** assemble a full `{ markdown, sections }` document (unlike `preview-import`); the dialog renders a list.
- [x] Add the `split:preview` command label to `command-labels.ts`.
- [x] Add the route + request/response schemas (JSON body with `fragmentId` + delimiter config — no multipart/file upload, unlike import).
- [x] `bun run codegen` (regenerate OpenAPI snapshot + orval client).
- [x] Tests for the preview command (piece derivation, piece-1-keeps-key, single-piece no-op case, count reporting).
- [x] Commit.

### Phase 3 — Split command + orchestration (`packages/api`)

The commit path. One command, going through the commands pipeline (`packages/api/CLAUDE.md`). See ADR 0014.

- [x] Add a `splitFragment` command under `src/commands/fragments/`:
  - Truncate the original fragment to piece 1's content (preserve UUID, key, aspects, readiness, references, unmanaged frontmatter).
  - Create pieces 2…N as new fragments via the existing create path: `deriveKey`-derived key with `_N` suffixing against existing + just-minted keys; inherit the original's aspects + references; `readiness: 0`; `isDiscarded: false`.
  - Strip Margin anchor markers (`<!--c:ID-->`) from the new pieces' content; leave the original's Margin to the existing orphaned-comment path.
  - For every sequence the original is placed in, insert the new pieces in order immediately after it (compose `placeFragment`; add a small orchestration helper if needed — no parallel placement logic).
  - Record a single non-undoable `fragment:split` action-log entry `{ sourceFragmentUuid, delimiter, createdCount, createdUuids }`; do **not** emit per-piece `fragment:created` entries.
- [x] Add the `fragment:split` command label to `command-labels.ts` and the action-log entry type.
- [x] Add the route + schemas; `bun run codegen`.
- [x] Tests: identity preservation, metadata inheritance, multi-sequence insert-after ordering, key conflict suffixing, single-piece no-op rejection, single log entry shape.
- [x] Commit.

### Phase 4 — Split dialog UI (`packages/frontend`)

A dialog with live preview, modelled on the extract-to-entity dialog + the import preview list.

- [ ] Build the split dialog: delimiter selector, live piece list (key + excerpt + count) driven by the generated `previewSplit` hook, Confirm disabled when count ≤ 1 ("1 piece — nothing to split"), and a non-blocking warning when count > 10 ("This will create N fragments") — never blocking, just a heads-up for aggressive blank-line splits.
- [ ] Wire Confirm to dispatch the split command via the command system (`onFailure` declared; uses `mutateAsync`).
- [ ] Tests for the dialog (preview rendering, no-op disabled state, confirm dispatch).
- [ ] Commit.

### Phase 5 — Surfaces (`packages/frontend`)

- [ ] Add `fragment-editor:split` in the `fragment-editor` scope (opens the dialog for the current fragment), mirroring how `editor.extract-to-*` is surfaced.
- [ ] Add a parameterized "Split fragment…" command in the Overview and fragment-list scopes that picks a fragment then opens the same dialog (shared dialog takes a `fragmentId`).
- [ ] Register new commands in the scope barrels (`scopes/index.ts`).
- [ ] Tests for command wiring + scope registration.
- [ ] Commit.

### Phase 6 — Deferred: Margin comment migration

Final, separately-shippable phase. Replaces the interim strip-and-orphan behavior. See `specifications/fragment-split.md` Open questions.

- [ ] In the split orchestration, for each comment whose anchored block moves into a piece 2…N, move the comment into that piece's Margin and re-anchor it (keep the anchor marker on the moved block instead of stripping it; create the new piece's Margin as needed).
- [ ] Update the spec: orphaning → migration; close the Open question.
- [ ] Tests: comment follows its block into the correct new piece; comment whose block stays in piece 1 is untouched; orphaning still applies when a block is deleted rather than moved.
- [ ] Commit.

### Phase 7 — Close-out

- [ ] `bun run format` then `bun run verify`; fix lint/test failures.
- [ ] Update `specifications/fragment-split.md` `Shipped` frontmatter and flip plan `Status`.
- [ ] Tick the fragment-splitter item in `references/TODO.md`.
- [ ] Commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Engine modes and the split command are unit-testable in `packages/importer` and `packages/api`. The dialog's live preview, no-op guard, and command dispatch are testable in `packages/frontend`; CM6/TipTap geometry and the Margin re-anchor (Phase 6) need a manual browser smoke since jsdom can't validate editor geometry — note any owed manual smoke in `references/suggestions.md`.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO update the relevant spec frontmatter — add an item to the `Shipped` property describing the feature, without implementation details.
