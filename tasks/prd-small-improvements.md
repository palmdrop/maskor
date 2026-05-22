# PRD: Small Improvements

## Introduction

A rolling PRD covering small, low-design-cost features and bug fixes that don't warrant a dedicated spec or plan. Items here are triaged from `references/TODO.md`. Each story is small enough to ship in one focused session.

When a story requires a minor spec update, the spec update is part of the acceptance criteria — the implementer updates the spec first, then ships the behavior, then logs the slice under the spec's `Shipped:` list.

**Source Specifications:**

- `specifications/fragment-editor.md`
- `specifications/navigation.md`
- `specifications/overview.md`
- `specifications/command-palette.md`
- `specifications/action-log.md`
- `specifications/project-statistics.md`
- `specifications/project-config.md`
- `specifications/aspect-arc-model.md`
- `specifications/project-management.md`
- `specifications/storage-sync.md`
- `specifications/import-pipeline.md`

## Goals

- Close a backlog of bug reports and tiny feature requests in one consolidated surface
- Keep individual items small (one focused session each) so they queue cleanly into Ralph or a manual implementation loop
- Force every behavioural change to land in the corresponding spec — no shipped behavior outside the spec

## User Stories

### Features

#### US-001: Cmd/Ctrl+S saves the current document

**Description:** As a writer, I want `Cmd+S` (macOS) / `Ctrl+S` (Windows/Linux) to save the document I'm editing, so that muscle memory from every other editor works in Maskor and I don't trigger the browser's "Save Page As" dialog.

**Acceptance Criteria:**

- [ ] `Cmd/Ctrl+S` saves the open fragment, note, reference, or aspect body when any of those editors is focused.
- [ ] The browser's default "Save Page As" behavior is suppressed when an entity editor is the active focus surface.
- [ ] The shortcut works identically in rich (Tiptap), raw markdown, and vim editor modes.
- [ ] The save hotkey is registered through the command system per `command-palette.md` (a `*.save` command with `hotkey: '⌘S'`), not as a free-standing keydown handler.
- [ ] `specifications/fragment-editor.md` is updated to list the Save hotkey under the editor's view-scoped commands.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-002: Vim yank and delete write to the system clipboard

**Description:** As a vim user, I want `y` and `d` in vim mode to also copy the affected text into the system clipboard so that I can paste into other apps without manually re-selecting and copying.

**Acceptance Criteria:**

- [ ] Yanking (`y`, `yy`, `Y`) in the vim-mode editor writes the yanked text to the system clipboard.
- [ ] Deleting (`d`, `dd`, `D`, `x`) in the vim-mode editor writes the deleted text to the system clipboard.
- [ ] The vim register behavior is unchanged — `"<reg>p` still pastes from the corresponding register.
- [ ] Paste (`p`, `P`) prefers vim register content, falling back to the system clipboard only when explicitly invoked via the unnamed clipboard register.
- [ ] `specifications/fragment-editor.md` is updated to document the system-clipboard sync behavior under the vim-mode section.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-003: Color picker for aspects and arcs

**Description:** As a writer arranging fragments, I want to assign a color to each aspect (and its associated arc) so that overview chips and arc curves are visually distinguishable at a glance.

**Acceptance Criteria:**

- [ ] The aspect editor surfaces a color picker; the chosen color is persisted on the aspect's frontmatter.
- [ ] The picker offers a constrained palette (recommended) or a full color picker — decision recorded in the spec update.
- [ ] Aspect chips in the fragment editor and overview render with the chosen color.
- [ ] Arc curves in the overview render with the corresponding aspect's color.
- [ ] An aspect without a color falls back to a deterministic default (e.g. hash of key) so existing aspects render sensibly.
- [ ] `specifications/aspect-arc-model.md` is updated to document the color field.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-004: Quick margin and font-size adjustment in the fragment editor

**Description:** As a writer, I want to adjust margin width and font size from inside the fragment editor (not in project config) so I can dial in reading comfort without breaking flow.

**Acceptance Criteria:**

- [ ] The fragment editor surfaces an inline control (toolbar button, sidebar panel, or hotkey) to adjust margin width and font size.
- [ ] Adjustments persist per-project via `project.json` editor config (existing key, no new top-level setting).
- [ ] Adjustments apply to the rich, raw, and vim editor modes.
- [ ] The control is invokable via a command in the palette as well as the inline affordance.
- [ ] `specifications/fragment-editor.md` is updated to describe the in-editor adjustment surface.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-005: Arrow-key navigation moves a focused fragment within a sequence

**Description:** As a writer arranging in the overview, I want to focus a fragment tile and move it with the arrow keys so I can reorder without dragging.

**Acceptance Criteria:**

- [ ] A fragment tile can receive keyboard focus.
- [ ] `Left` / `Right` (or `Up` / `Down`, decided in the spec update) move the focused fragment one position within its section.
- [ ] Moving past the start/end of a section moves the fragment to the adjacent section's boundary, if any.
- [ ] Moves emit the same action-log entry as a drag-and-drop placement (no new action type).
- [ ] `specifications/overview.md` is updated to describe keyboard fragment movement.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-006: Re-order sections within a sequence

**Description:** As a writer, I want to re-order sections within a sequence — not just fragments within sections — so I can restructure my draft at the chapter level.

**Acceptance Criteria:**

- [ ] Sections can be reordered via drag-and-drop in the overview.
- [ ] Sections can be reordered via keyboard (matching US-005's pattern, scaled up to sections).
- [ ] Section reorder is recorded in the action log under a new or existing `sequence:section-reordered` action type (decision recorded in spec update).
- [ ] `specifications/overview.md` is updated to describe section reordering.
- [ ] `specifications/action-log.md` is updated if a new action type is introduced.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-007: Stats table toggle to include discarded fragments

**Description:** As a writer reviewing project stats, I want to optionally include discarded fragments in the per-fragment table so I can see what I've cut without leaving the Stats page.

**Acceptance Criteria:**

- [ ] The Stats page exposes a toggle "Include discarded fragments" above the per-fragment table.
- [ ] Toggle off (default) matches current behavior — discarded fragments excluded.
- [ ] Toggle on lists discarded fragments in the same table, visually distinguished (strikethrough or muted row).
- [ ] Global aggregates (counts, histogram, word count totals) remain unaffected by the toggle — they continue to exclude discarded per the spec.
- [ ] Toggle state is local to the session (not persisted) unless persistence is decided in the spec update.
- [ ] `specifications/project-statistics.md` open question "Should the per-fragment table optionally include discarded fragments behind a toggle?" is resolved and the spec updated.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### Bugs

#### US-008: Renaming a fragment to a different capitalization loses the fragment

**Description:** As a writer, I expect renaming a fragment from `Chapter One` to `chapter one` (or any case-only change) to succeed and preserve the fragment. Currently the rename causes a "no such file" error and the fragment becomes inaccessible.

**Acceptance Criteria:**

- [ ] Renaming a fragment to a case-different variant of its current key succeeds without error on case-insensitive filesystems (macOS default APFS, Windows NTFS).
- [ ] The fragment's UUID and content survive the rename.
- [ ] All sequence placements, attachment references, and inline links continue to resolve.
- [ ] The action log records a single `fragment:renamed` entry.
- [ ] `specifications/fragment-editor.md` (or `attachments.md` if the rename logic is shared) is updated if a behavior clarification is needed.
- [ ] Test added covering case-only rename on a case-insensitive filesystem.
- [ ] Typecheck/lint passes.

#### US-009: New project folder skeleton is missing required subdirectories

**Description:** As a writer creating a new project, I expect Maskor to create the full vault folder skeleton (`fragments/`, `fragments/discarded/`, `aspects/`, `notes/`, `references/`, `pieces/`) at project-creation time. Currently `fragments/discarded/` is missing until a manual mkdir, which makes "Discard fragment" fail until the folder is created by hand.

**Acceptance Criteria:**

- [ ] Project creation writes the full vault subdirectory skeleton up-front, including `fragments/discarded/`.
- [ ] Discarding a fragment in a brand-new project succeeds without any pre-warming step.
- [ ] Existing projects missing one or more skeleton folders are repaired on startup (lazy idempotent mkdir).
- [ ] `specifications/project-management.md` is updated to list the skeleton folders that project bootstrap guarantees.
- [ ] Test added covering project-creation skeleton and the lazy-repair path.
- [ ] Typecheck/lint passes.

#### US-010: File import is missing from the action log

**Description:** As a writer reviewing the action log, I expect to see an entry whenever I import a file. Currently the import flow completes without writing any `*:imported` event, leaving a gap in the audit trail.

**Acceptance Criteria:**

- [ ] Completing an import via the Stage 2 preview commits a single action-log entry per import operation.
- [ ] The entry uses the `fragment:imported` action type (or a new `import:completed` type, decision recorded in spec update).
- [ ] Payload includes `sourceFileName`, `fragmentCount`, and the chosen delimiter / heading level.
- [ ] If the import created N fragments, the log shows one entry, not N (matches existing convention for batch operations).
- [ ] `specifications/action-log.md` is updated with the new action type and payload shape.
- [ ] `specifications/import-pipeline.md` is updated to reference the action-log entry.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-011: Palette "Create…" commands only navigate, never prompt creation

**Description:** As a writer, I expect a palette command like "Create fragment…" to actually create a new entity (or at minimum open the creation modal). Currently selecting it just navigates to the entity list view without any creation affordance triggered.

**Acceptance Criteria:**

- [ ] Each global `Create <entity>…` command in the palette opens the appropriate creation flow directly (modal or inline form) instead of routing to the list view.
- [ ] Cancelling the creation flow returns focus to the previous surface (not the list view, unless the user was already there).
- [ ] `specifications/command-palette.md` is updated to clarify the expected behavior of `Create…` commands.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-012: Drag-and-drop in sequences is slow and clunky

**Description:** As a writer rearranging a long sequence, I expect drag-and-drop to feel responsive. Currently it lags noticeably and the drop target indicator drifts.

**Acceptance Criteria:**

- [ ] Investigate the dnd implementation; identify the dominant cost (re-renders, layout thrash, server round-trips per drag-over).
- [ ] Drag-over indicator updates within one frame of pointer movement on a 200-fragment sequence on a typical laptop.
- [ ] Drop commits within 250ms of release on the same sequence size.
- [ ] No new full-sequence re-render fires during the drag — only the affected positions update.
- [ ] No spec update required unless the investigation surfaces a behaviour change.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-013: Overview does not remember density mode across navigation

**Description:** As a writer, I expect the overview's density toggle to remember my last choice when I navigate away and back. Currently it resets to the default every time.

**Acceptance Criteria:**

- [ ] The overview's density choice persists across navigation within the same session.
- [ ] The density choice persists across page reloads via `project.json` (matches `preview` toggle persistence in `preview.md`).
- [ ] No additional action-log entry is generated for density changes — it remains a UI-local preference.
- [ ] `specifications/overview.md` is updated to document the persistence behavior.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-014: Deleting an aspect leaves orphan references on fragments

**Description:** As a writer, I expect deleting an aspect from the project config to clean up references to it on all fragments. Currently the aspect entries persist in fragment frontmatter and continue to show up in the overview and sequencer as ghost dimensions.

**Acceptance Criteria:**

- [ ] Deleting an aspect through Maskor either (a) strips the aspect from every fragment's frontmatter atomically, or (b) marks the aspect entries as orphaned and excludes them from overview/sequencer rendering. Decision recorded in spec update.
- [ ] Whichever path is taken, the overview and sequencer never render or score against a deleted aspect.
- [ ] If path (a): the action log records the cascade (single entry per fragment touched, or one summary entry — decided in spec).
- [ ] If path (b): the project-config page surfaces orphaned aspect entries and offers a manual cleanup affordance.
- [ ] `specifications/aspect-arc-model.md` is updated to document the chosen behavior.
- [ ] Test added covering the post-delete state of fragments that referenced the deleted aspect.
- [ ] Typecheck/lint passes.

#### US-015: First registration / DB rebuild shows empty state until refresh

**Description:** As a writer opening Maskor for the first time (or after a DB loss), I expect a loading indicator while the index is being rebuilt. Currently the views show "no fragments" until I manually refresh, which suggests data loss.

**Acceptance Criteria:**

- [ ] During an in-progress DB rebuild, the fragment list, overview, and project-config views render a loading state instead of an empty state.
- [ ] The loading state names the operation ("Rebuilding project index…") rather than a generic spinner.
- [ ] When the rebuild completes, all views reflect the rebuilt data without requiring a manual refresh (SSE or query invalidation).
- [ ] `specifications/storage-sync.md` is updated to describe the rebuild-in-progress UX contract.
- [ ] Test or manual scenario added covering first-launch and post-DB-loss flows.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

#### US-016: Orphaned aspects are invisible in the fragment metadata editor

**Description:** As a writer, I expect to see orphaned aspect entries on a fragment's metadata editor (with an "orphan" indicator) so I can clean them up manually. Currently they're visible in the overview but absent from the metadata editor, making it impossible to remove them from the affected fragment.

**Acceptance Criteria:**

- [ ] The fragment metadata editor lists all aspect entries on the fragment, including those whose aspect definition no longer exists.
- [ ] Orphaned aspect entries render with a distinct indicator (icon, muted color, "orphan" badge).
- [ ] The user can detach an orphaned aspect entry from the metadata editor with the same affordance as a live aspect.
- [ ] Note: this story may be partially or fully resolved by US-014's chosen path — coordinate the two during implementation.
- [ ] `specifications/fragment-editor.md` is updated to document orphan rendering in the metadata editor.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

## Functional Requirements

- FR-1: All hotkeys land through the command system (US-001) — no free-standing keydown handlers.
- FR-2: Per-project UI preferences (US-004, US-013) persist in `project.json` under existing or new clearly-scoped keys.
- FR-3: Any new action-log entry types (US-006, US-010, possibly US-014) are added to `ActionTypeSchema` and documented in `specifications/action-log.md` in the same slice that emits them.
- FR-4: Every story that ships a behavior change updates its corresponding spec's `Shipped:` log; specs without a shipped entry for the slice are treated as out-of-sync.

## Non-Goals

- Cross-story refactors (e.g. unifying density and preview toggle persistence into a shared editor-config layer). Acceptable as a follow-up; not required by any story here.
- Backwards compatibility with the existing (pre-fix) behavior. Greenfield — no users to migrate.
- Larger features that warrant their own spec or plan (extract command redesign, draft export, trash folder lifecycle, pieces removal — handled separately).

## Technical Considerations

- US-008 (case-only rename): test on a case-insensitive filesystem (default macOS/Windows). The Linux test container is case-sensitive and will not reproduce the bug.
- US-012 (dnd performance): start with a profiling pass before changing code; the cause may be a stale render path that's fixable without an architectural change.
- US-014 (aspect delete cascade): coordinate with US-016 — both touch the orphan-aspect surface and should be implemented and tested together.
- US-001, US-011: stories explicitly land through `command-palette.md`'s command system; resist re-introducing direct keydown handlers or inline mutations.

## Success Metrics

- All 16 stories shipped with corresponding spec updates and `Shipped:` log entries.
- No regression in `bun run verify` across the slices.
- New tests cover the bug stories (US-008 through US-016 where applicable).

## Open Questions

- Story ordering / batching for implementation: which cluster ships first? Default suggestion — bugs that block daily use (US-008, US-009, US-011, US-015) before features.
- US-014's chosen path (cascade-strip vs. surface-orphans): defer to implementation-time grilling.
