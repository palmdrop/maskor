# PRD: TODO Triage — Small Fixes

## Introduction

A focused batch of small bug fixes and minor features triaged from `references/TODO.md` (the `## Codebase` section). Scope is deliberately narrow: each story ships in one focused session. Longer/exploratory work (note-system rework, in-line preview editing, graph view, sequencer redesign, clone-sequence, multi-select-into-section) and all workflow/tooling items are **out of scope** — see Non-Goals.

This is a sibling to `tasks/prd-small-improvements.md` (US-001–US-016 there); story numbers here are local to this document.

When a story requires a spec update, the update is part of the acceptance criteria — update the spec first, ship the behavior, then log the slice under the spec's `Shipped:` list.

**Source Specifications:**

- `specifications/fragment-editor.md`
- `specifications/margins.md`
- `specifications/aspect-arc-model.md`
- `specifications/prompting.md`
- `specifications/project-config.md`
- `specifications/project-statistics.md`
- `specifications/storage-sync.md`
- `specifications/navigation.md`

## Goals

- Clear a cluster of small, daily-use bugs (editor save behavior, margin alignment, aspect picker, suggestion-mode state).
- Land two low-cost editor features (auto-typography, vim clipboard toggle).
- Keep every item to one focused session so they queue cleanly into Ralph or a manual loop.
- No shipped behavior outside the spec.

## User Stories

### Features

#### US-001: Automatic typographic substitution in the rich editor

**Description:** As a writer, I want common typographic substitutions applied automatically as I type in the rich editor (`--` → em dash, `...` → ellipsis, straight quotes → curly), so my prose reads like a finished document without entering special characters by hand. (TODO: "find a way to automatically create em-dashes etc.")

**Acceptance Criteria:**

- [ ] Tiptap's `Typography` extension is enabled in rich (Tiptap) mode, giving at minimum `--` → em dash, `...` → ellipsis, and straight → curly quotes (the extension's standard input-rule set).
- [ ] Substitution is always on in rich mode — no project setting (decided 2026-06-04).
- [ ] Raw markdown and vim editor modes are untouched — they edit the literal buffer with no substitution.
- [ ] Substituted characters are stored as the actual Unicode glyph (— / …) in the saved markdown and round-trip byte-stable through save→load.
- [ ] Code spans / code blocks are excluded from substitution (extension default).
- [ ] `specifications/fragment-editor.md` is updated to document rich-mode typography substitution.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-002: Per-project toggle for vim yank/delete → system clipboard

**Description:** As a vim user, I want a per-project setting controlling whether vim `y`/`d` also write to the system clipboard, so Maskor doesn't clobber my OS clipboard when I prefer vim registers only. (TODO: "add project-wide setting for yanking to clipboard or not in vim mode.")

**Acceptance Criteria:**

- [ ] A per-project boolean (in `project.json` editor config) gates the vim yank/delete → system-clipboard sync.
- [ ] Default **on**; when off, vim yank/delete affect only vim registers and leave the system clipboard untouched.
- [ ] When on, `y`/`yy`/`Y` and `d`/`dd`/`D`/`x` mirror the affected text to the system clipboard; vim register behavior and `p`/`P` paste semantics are unchanged.
- [ ] The toggle is exposed wherever existing per-project editor display preferences live (the editor "Aa" display popover / project-config editor section).
- [ ] Coordinate with `prd-small-improvements.md` US-002 (vim clipboard sync): if that story is unshipped when this lands, fold the two together rather than shipping the behavior twice.
- [ ] `specifications/fragment-editor.md` and `specifications/project-config.md` are updated to document the setting.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### Bugs — Editor

#### US-003: Leading blank lines desync the Margin column alignment

**Description:** As a writer, when a fragment begins with one or more blank lines above its first block, the Margin column's rows no longer line up with the blocks they annotate — comments are vertically offset. The Margin should stay flow-aligned regardless of leading blank lines. (TODO: "extra newlines on top of a fragment does not correctly offset the margins alignment.")

**Acceptance Criteria:**

- [ ] Leading blank lines at the top of a fragment do not desync the Margin column; row N still sits beside block N.
- [ ] The editor-driven block geometry / origin-alignment derivation (ADR 0009, `margins.md`) accounts for leading empty blocks in its measured geometry.
- [ ] Adding/removing blank lines at the top live-reconciles the alignment (matching the existing expand/collapse reconcile behavior).
- [ ] Works in both rich (Tiptap) and raw/vim (CM6) modes.
- [ ] `specifications/margins.md` is updated/clarified if the alignment contract needs to state leading-whitespace handling.
- [ ] Test added/extended for block-index alignment with leading blank blocks where geometry is unit-testable; manual browser smoke for the pixel alignment.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-004: Save mutates whitespace and jumps the cursor

**Description:** As a writer, I expect saving after an edit to be deterministic. Currently a save sometimes strips extra whitespace and moves the cursor — sometimes to the top, sometimes the bottom — which reads like data loss and breaks flow. (TODO: "sometimes on save after an edit, extra whitespace is removed and cursor position is updated… Probably a roundtrip or use-effect issue.")

**Acceptance Criteria:**

- [ ] Saving never moves the cursor; the caret stays where it was at save time (consistent with persisted-cursor behavior, `fragment-editor.md` 2026-05-28).
- [ ] When the saved content round-trips identically (server returns byte-equal markdown), the editor's content state is **not** re-set from the response — no remount, no caret reset. (Resolves the TODO's embedded question: a no-op content update on an unchanged save is unnecessary and is removed.)
- [ ] Whitespace handling on save is deterministic — trailing/extra whitespace is either always normalized the same way or never touched, with no run-to-run variance. Decision (normalize-always vs preserve) is recorded in the spec update; **preserve** is the default unless normalization is already an intended feature.
- [ ] Behavior is identical across rich, raw, and vim modes.
- [ ] `specifications/fragment-editor.md` is updated to state the save round-trip contract (no content/caret mutation on an unchanged save).
- [ ] Test added covering: save with unchanged content does not alter the buffer or the caret.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### Bugs — Pickers

#### US-005: Enter in the aspect picker creates a new aspect instead of selecting the highlighted option

**Description:** As a writer adding an aspect to a fragment, when I type a query and arrow-navigate to an existing option, pressing Enter should select that highlighted option. Currently Enter creates a brand-new aspect unless I type the full name, producing accidental duplicate/garbage aspects. (TODO: "when adding an aspect, even when navigating to select an option, enter creates a new aspect, unless the full aspect name is inputted.")

**Acceptance Criteria:**

- [ ] With a highlighted option in the aspect picker, Enter selects the highlighted option and does not create a new aspect.
- [ ] "Create new aspect" fires only when no option is highlighted, or via an explicit "Create '<query>'" affordance — standard combobox semantics.
- [ ] Behavior is consistent across every aspect-add surface (fragment metadata editor's `TagCombobox` and any other entry point).
- [ ] `specifications/aspect-arc-model.md` (or `fragment-editor.md` if the picker behavior is documented there) is updated if a behavior clarification is needed.
- [ ] Test added covering Enter-selects-highlighted vs Enter-creates-when-none-highlighted.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### Bugs — Suggestion mode

> These three are one cluster: all touch suggestion-mode current-fragment state. US-008 (move the pointer out of the manifest) is the likely root cause of US-006 (stale back-navigation) — implement and test them together.

#### US-006: Back-navigation in suggestion mode lands on the wrong (preceding) fragment

**Description:** As a writer in suggestion mode, navigating away from a suggested fragment and back sometimes lands on the fragment _before_ the one I was viewing, not the one I left. The persisted current-fragment pointer appears stale. (TODO: "when navigating away from a suggestion, then back, sometimes the fragment BEFORE the previously viewed fragment is shown… Backend state is probably not updated properly.")

**Acceptance Criteria:**

- [ ] Navigating away from a suggestion and back returns to the exact fragment last shown — never its predecessor.
- [ ] The current-suggestion pointer has a single source of truth, updated synchronously when the shown fragment changes (no off-by-one lag between display and persisted pointer).
- [ ] Root cause investigated; if it stems from `currentFragmentUUID` living in the project manifest, fix is coordinated with US-008.
- [ ] `specifications/prompting.md` (and `navigation.md` if back-nav is specced there) is updated if a behavior clarification is needed.
- [ ] Test added covering away→back returns the same fragment.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-007: Edit counter over-counts in suggestion mode

**Description:** As a writer, the suggestion-mode edit counter (fragment `editCount` telemetry) increments on every save, including saves that change nothing. I expect it to count only editing sessions that actually changed the fragment. (TODO: "edit counter seems off in suggestion mode. Should only count every session that results in a change, not every save.")

**Acceptance Criteria:**

- [ ] A save with no content change does not increment `editCount`.
- [ ] `editCount` increments at most once per editing session that results in a content change — not once per save.
- [ ] "Session" is defined and the definition recorded in the spec update. **Recommended default:** one increment per suggestion-mode visit (fragment open → navigate away) in which at least one save changed content, keyed off the existing fragment-visit boundary.
- [ ] `specifications/prompting.md` (and `project-statistics.md` / `storage-sync.md` where `editCount` semantics live) is updated to state the counting rule.
- [ ] Test added covering: no-op save → no increment; changed save → +1; repeated changed saves within one session → +1 (per the chosen definition).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-008: Move suggestion `currentFragmentUUID` out of the project manifest into a DB table

**Description:** As a developer, `suggestion.currentFragmentUUID` is runtime session state but is stored in the project manifest (`project.json`), where config — not state — belongs. It churns the manifest on every suggestion step and is the suspected cause of US-006. Move it to the DB. (TODO: "suggestion.currentFragmentUUID is state rather than config and should prob not be stored in project manifest. Investigate and move to a table instead.")

**Acceptance Criteria:**

- [ ] `currentFragmentUUID` is stored in the vault DB (a new per-project state table, or a column on an existing per-project state table), not in `project.json` / the project manifest schema.
- [ ] The suggestion read/write path (`packages/storage/src/service/storage-service.ts`) reads and updates the pointer from the DB.
- [ ] The field is removed from the project manifest / project domain schema (`packages/shared/src/schemas/domain/project.ts`); the manifest no longer rewrites on every suggestion advance.
- [ ] Treated as DB-only state (like `fragment_stats` telemetry, `storage-sync.md`): not re-derivable from the vault, not expected to survive a full DB drop — documented as such.
- [ ] Coordinated with US-006 (likely root cause of the stale back-navigation).
- [ ] A DB migration is added for the new table/column.
- [ ] `specifications/project-config.md` (remove from manifest) and `specifications/storage-sync.md` (document DB-only state) are updated.
- [ ] Test added covering pointer persistence across requests via the DB.
- [ ] Typecheck/lint passes.

## Functional Requirements

- FR-1: Per-project UI preferences (US-002) persist in `project.json` under existing or clearly-scoped editor-config keys.
- FR-2: Suggestion-mode current-fragment state lives in the DB, not the manifest (US-008); `editCount` increments per changed session, not per save (US-007).
- FR-3: Editor save is a non-destructive round-trip — an unchanged save mutates neither buffer nor caret (US-004).
- FR-4: Every story that ships a behavior change updates its corresponding spec's `Shipped:` log; specs without a shipped entry for the slice are treated as out-of-sync.

## Non-Goals

- Sequencer/overview redesign, including narrowing the unassigned `PoolZone` (TODO: "pool is unnecessarily wide") — deferred to a planned sequencer-UI redesign.
- A notification/toast/banner component (TODO line 66) — too large for this batch; handled separately.
- Larger/exploratory features: note-system rework, fragment-specific side-by-side notes, in-line editing of fragments in preview, graph view, clone/insert sequence, multi-select fragments into a section, sticky-fragment-title redesign, spelling/language settings.
- The dev-DB-auto-reset / schema-change investigation (TODO line 23) — developer-environment tooling with its own plan (`references/plans/dev-db-auto-reset.md`).
- All `## Workflow / tooling` and `## Exploratory product notes` TODO items.
- Backwards compatibility with pre-fix behavior — greenfield, no users to migrate.

## Technical Considerations

- **US-001 (typography):** verify the Tiptap `Typography` extension does not fire inside code marks and that curly quotes/em dashes serialize back to plain Unicode (not HTML entities) so the markdown stays clean and byte-stable.
- **US-003 (margin offset):** lives in the editor-driven block-geometry / origin-alignment path (ADR 0009, `margins-3`/`margins-4`). The pixel alignment can only be validated in a real browser (jsdom can't measure geometry) — unit-test the block-index logic, smoke-test the alignment.
- **US-004 (save round-trip):** likely a `useEffect` that re-sets editor content from the save response. Check whether the response content is fed back into the editor unconditionally; gate it on actual change (or drop it entirely on an unchanged save).
- **US-006 / US-008 (suggestion state):** implement together. The manifest pointer (`project.json` `suggestion.currentFragmentUUID`) is read at `storage-service.ts:1659` and written at `:1743`; the off-by-one back-nav is plausibly a manifest read/write ordering issue that disappears once the pointer is DB-backed and updated synchronously.
- **US-007 (edit counter):** `editCount` lives in `fragment_stats` (DB-only telemetry, `storage-sync.md`). Tie the increment to the existing fragment-visit boundary rather than the save handler.

## Success Metrics

- All 8 stories shipped with corresponding spec updates and `Shipped:` log entries.
- No regression in `bun run verify` across the slices.
- New tests cover US-003, US-004, US-005, US-006, US-007, and US-008.

## Open Questions

- US-004: normalize-always vs preserve for trailing whitespace — defaulting to preserve unless an existing intended normalization is found during implementation.
- US-007: exact "session" boundary — defaulting to the fragment-visit boundary; confirm at implementation time.
- Implementation order: the editor bugs (US-003, US-004, US-005) block daily writing and should ship before the suggestion-mode cluster (US-006–US-008) and the two features (US-001, US-002).
