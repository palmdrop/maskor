# Project Settings Consolidation

**Date**: 10-06-2026
**Status**: Done
**Specs**: `specifications/project-config.md`

---

## Goal

> A single `useProjectSetting(path)` hook (the write-half sibling to the existing read-only `useProjectEditorConfig`) owns every project-settings save — local draft, resync, commit, error — and a `SettingRow` module renders label/description/control/error; `GeneralTab` and `EntityEditorShell` both consume them, so no project-setting save logic and no "mirror server value into local state" effect exists in more than one place. "Done" = the 7 duplicated handlers in `GeneralTab` and the duplicate font/margin write cluster in `EntityEditorShell` are gone, with no behavior change.

---

## Context

From the architecture review (candidate 4, absorbing candidate 5). Three problems, one root:

- **`GeneralTab.tsx` (439 lines)** has seven near-identical handlers (`handleToggleVimMode`, `handleFontSizeChange`, `handleReadyStatusThresholdChange`, …), each doing `updateProject.mutateAsync({ data: { <section>: {...} } })` + `invalidateProject` + `catch → setError`. It also keeps three `localX` + `useEffect`-resync slider mirrors.
- **`EntityEditorShell.tsx:148-218`** independently re-implements the *same* editor-settings writes: `localFontSize` / `localMaxParagraphWidth` mirrors, `persistFontSize` / `persistMaxParagraphWidth`, and the `handleIncrease/Decrease` cluster. The editor display settings live in two files.
- **Candidate 5** (the mirror-state pattern) is, in practice, almost entirely these editor-settings sliders. Folding them into the setting hook dissolves the pattern without inventing a generic `useServerMirroredState` — which would over-abstract genuinely different cases.

`useProjectEditorConfig` already exists as the *read* projection of `project.editor`. This plan adds the symmetric *write* path.

### Resolved design decisions

- **No generic mirror hook.** The "draft value during drag, commit on release, resync from server when idle" behavior lives inside `useProjectSetting` (sliders need it); it is not extracted as a standalone cross-cutting abstraction.
- **Scope = GeneralTab + EntityEditorShell.** The hook retires the duplication in both files.
- **Invalidate-only, not optimistic.** Project settings are low-stakes and already feel instant via the local draft; `useProjectSetting` commits with `mutateAsync` + invalidate + surfaced error. It does **not** depend on `references/plans/optimistic-mutation-primitive.md` for the mutation layer.

**Implementation order (3-plan set)**: implement **second**, after `optimistic-mutation-primitive.md`. Both touch `EntityEditorShell` but disjoint parts (that plan removes insert/extract in its Phase 7; this plan removes display settings in Phase 4) — sequencing them avoids concurrent churn on the same file. Independent of `overview-surface-hooks.md`.

### Constraints the implementation must respect

- Boolean settings (switches) commit immediately on change; numeric settings (sliders) hold a local draft and commit on release (`onValueCommit`). The hook exposes both shapes.
- `GeneralTab`'s **non-settings** controls stay as they are: the index Rebuild / Reset buttons (command-dispatched, with their own `indexStatus` feedback) and the project **name** edit (has its own trim/validation path). Only the editor / suggestion / advanced field handlers move to the hook.
- The two-way coupling between `vimMode` and `rawMarkdownMode` (raw is forced on by vim, and disabled while vim is on) must be preserved in the `SettingRow` wiring, not lost in the generalization.
- Errors must remain visible per surface — the hook surfaces a per-field error the row renders.

---

## Tasks

### Phase 0 — Branch

- [x] ~~Create branch~~ — N/A: implemented on the shared worktree branch `agent/frontend-refactor` (per-phase commits)

### Phase 1 — `useProjectSetting` hook

**Goal**: One write hook covering boolean (commit-on-change) and numeric (draft + commit-on-release) project settings. No call sites changed yet.

- [x] Create `src/hooks/useProjectSetting.ts`, keyed by a typed setting path (e.g. `editor.fontSize`, `suggestion.readinessThreshold`, `advanced.showFragmentStats`)
- [x] Read the current value via `useGetProject` (mirror how `useProjectEditorConfig` projects it)
- [x] Expose an immediate shape (`value`, `set`, `isPending`, `error`) for switches
- [x] Expose a draftable shape (`draft`, `setDraft`, `commit`) for sliders — draft resyncs from server when not mid-edit
- [x] Commit performs `updateProject.mutateAsync` for the targeted section, invalidates project + project-list queries, and surfaces an error string on failure
- [x] Unit tests: commit success/failure, draft resync-when-idle, error surfaced
- [x] `git commit`

### Phase 2 — `SettingRow` component

**Goal**: A presentational module for the label / description / control / error layout repeated throughout `GeneralTab`.

- [x] Create `src/pages/ProjectConfigPage/components/SettingRow.tsx` (or a shared location if it reads more broadly)
- [x] Render label, optional description, a control slot (switch or slider), and an optional error line
- [x] Keep it presentational — state comes from `useProjectSetting` at the call site
- [x] `git commit`

### Phase 3 — Migrate `GeneralTab`

**Goal**: Replace the seven handlers and three slider mirrors with the hook + rows.

- [x] Replace each editor / suggestion / advanced handler with a `useProjectSetting` call rendered through `SettingRow`
- [x] Delete the three `localX` + `useEffect`-resync slider mirrors
- [x] Preserve the index buttons, name edit, and vault-path display untouched
- [x] Preserve the vim ↔ raw-markdown coupling
- [x] Confirm existing `GeneralTab` tests pass; add coverage for the coupling if not already present
- [x] `git commit`

### Phase 4 — Migrate `EntityEditorShell` display settings

**Goal**: Remove the duplicate editor-settings write logic from the shell.

- [x] Replace `localFontSize` / `localMaxParagraphWidth` mirrors, `persistFontSize` / `persistMaxParagraphWidth`, and `handleIncrease/Decrease*` with `useProjectSetting`
- [x] `EditorDisplaySettings` keeps its props but sources value/commit from the hook
- [x] Confirm editor tests pass (font/margin adjust still persists)
- [x] `git commit`

### Phase 5 — Candidate 5 leftover audit

**Goal**: Resolve the remaining non-settings mirrors case-by-case (no generic hook).

- [x] Audit `FragmentEditor.fragmentContent` mirror — keep only if it is genuinely tracking live editor content for the Margin (document why); otherwise derive/remove
- [x] Audit the `PreviewPage` mirror — delete if derivable from server state or an uncontrolled input
- [x] `git commit`

### Phase 6 — Verify and close

- [x] `bun run format`
- [x] `bun run verify` — fix any lint / type / test failures
- [x] Remove any `references/suggestions.md` entries made obsolete by this work
- [x] Set this plan's status to `Done` (or `In progress` if partial)
- [x] `git commit`

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

`useProjectSetting` is the new test surface: cover commit success/failure, the slider draft resync-when-idle rule, and error surfacing. The vim ↔ raw-markdown coupling deserves an explicit `GeneralTab` test if one does not already exist. `SettingRow` is presentational and tested through its consumers.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

This is a pure refactor with no behavior change, so `specifications/project-config.md` needs no `shipped` update. If behavior shifts during implementation, treat that as a scope signal and update the spec frontmatter accordingly.
