# PRD: Project Management

## Introduction

A single page where a writer opening Maskor can register a project (by adopting an existing folder, creating one at a custom path, or letting Maskor create one for them under a configurable global root), rename a project, locate a vault that has moved on disk, and deregister a project — without typing filesystem paths by hand. The page also exposes one setting: where Maskor stores managed projects by default.

This work replaces the existing `ProjectSelectionPage` with a fuller-featured `ProjectManagementPage`, adds a backend-driven folder picker (no native shell), closes the known manifest re-register gap by reusing UUIDs from `.maskor/project.json` during adoption, and wires up the previously dormant `ProjectUpdateSchema` to a `PATCH /projects/:uuid` route. Lifecycle only — per-project content (aspects, arcs, interleaving, typography, etc.) stays owned by `project-config.md`.

**Source Specifications:**

- `specifications/project-management.md`

## Goals

- Replace `ProjectSelectionPage` with `ProjectManagementPage`, listing all registered projects with per-row actions.
- Offer three registration affordances (Adopt existing / Create at custom path / Maskor-managed) on top of a unified `POST /projects` endpoint with `mode: "adopt" | "create"`.
- Provide a backend-driven directory browser usable from any browser, with hidden directories off by default and a UI toggle.
- Close the manifest re-register gap: re-adopting a folder with `.maskor/project.json` reuses the manifest UUID.
- Make project rename work end-to-end (registry row + manifest, never the folder).
- Provide "Locate vault…" for moved/missing vaults, with a confirmation prompt on UUID conflict.
- Deregister with an opt-in "Also delete files" path that defaults off, requires name-typing confirmation, and prefers OS trash via the `trash` npm package.
- Persist a single setting (maskor-managed root) to `~/.config/maskor/settings.json` with OS-aware defaults.

## User Stories

### US-001: Settings file with maskor-managed root key

**Description:** As a developer, I need a persisted settings file so the maskor-managed root can be configured and read across the app.

**Acceptance Criteria:**

- [ ] Add a `settings-service` (or equivalent) that reads/writes `~/.config/maskor/settings.json` (path resolved via `os.homedir()`).
- [ ] Schema includes `maskorManagedRoot: string` with OS-aware defaults: `~/Documents/Maskor/` on macOS/Linux, `%USERPROFILE%\Documents\Maskor\` on Windows.
- [ ] Missing keys fall back to defaults; an unparsable file is treated as empty and a warning is surfaced (returned alongside settings reads so the UI can show it).
- [ ] File is created on first write only.
- [ ] Unit tests cover defaults, missing-key fallback, unparsable-file handling.
- [ ] Typecheck/lint passes.

### US-002: Directory-browse backend endpoint

**Description:** As a developer, I need a backend endpoint that lists directory contents so the frontend folder picker can navigate the host filesystem without a native shell.

**Acceptance Criteria:**

- [ ] `GET /fs/list?path=<absolute>` returns `{ path, parent, entries: [{ name, kind: "file" | "directory", hidden, hasMaskorManifest, hasObsidianDir }] }`.
- [ ] `hasMaskorManifest` is true when the directory contains `.maskor/project.json`; `hasObsidianDir` is true when it contains `.obsidian/`. Both are only computed for `kind === "directory"`.
- [ ] `hidden` is true for entries whose name starts with `.`.
- [ ] Endpoint accepts any absolute path on the host; rejects relative paths with 400.
- [ ] Endpoint is bound to localhost only (matches existing server config; verify and document).
- [ ] Returns 404 if the path does not exist, 403 if it exists but is not readable.
- [ ] Unit tests cover entry classification, hidden flag, missing path, permission denied.
- [ ] Typecheck/lint passes.

### US-003: `POST /projects` accepts `mode` and reuses manifest UUID on adopt

**Description:** As a developer, I need the registration endpoint to accept `mode: "adopt" | "create"` and reuse an existing manifest UUID on adopt, closing the long-standing re-register gap.

**Acceptance Criteria:**

- [ ] `POST /projects` body adds `mode: "adopt" | "create"`; existing callers updated.
- [ ] `mode: "adopt"`: validates the path exists; if `.maskor/project.json` is present, the new registry row's UUID equals the manifest UUID and manifest-stored metadata (name, etc.) is reused (name may be overridden by request body).
- [ ] `mode: "create"`: creates the directory if missing (`mkdir -p`), assigns a new UUID, writes the manifest.
- [ ] `vaultPath` uniqueness in the registry is preserved (existing constraint, regression test added).
- [ ] Existing storage-service note about manifests not being reusable on re-register is removed.
- [ ] Unit/integration tests cover: adopt-with-manifest reuses UUID; adopt-without-manifest assigns new UUID; create-when-missing creates dir; vaultPath conflict rejected.
- [ ] Typecheck/lint passes.

### US-004: Vault skeleton init on create

**Description:** As a user creating a new project, I expect Maskor to set up the vault structure so the project is immediately usable.

**Acceptance Criteria:**

- [ ] On `mode: "create"`, Maskor writes `.maskor/`, `.maskor/project.json`, and an empty `aspects/` directory inside the vault path.
- [ ] Other vault structure (arcs config, vault DB) stays lazily created by its owning feature — verify no regressions.
- [ ] Init is idempotent: re-running it on an already-initialized folder does not error or overwrite.
- [ ] Unit tests cover empty-folder init, existing-skeleton no-op, manifest contents.
- [ ] Typecheck/lint passes.

### US-005: `PATCH /projects/:projectId` for rename

**Description:** As a developer, I need to wire `ProjectUpdateSchema` to an HTTP route so project rename works end-to-end.

**Acceptance Criteria:**

- [ ] `PATCH /projects/:projectId` accepts `{ name: string }` validated by `ProjectUpdateSchema`.
- [ ] Updates the registry row's name and the `name` field in `.maskor/project.json`.
- [ ] Never moves or renames the on-disk folder — verified by test.
- [ ] Returns 404 when project is not found.
- [ ] Returns the updated project record.
- [ ] Unit/integration tests cover: success, missing project, folder name unchanged after rename.
- [ ] Typecheck/lint passes.

### US-006: Trash helper using `trash` npm package

**Description:** As a developer, I need a single helper that moves a path to OS trash via the `trash` npm package so deregister-with-delete prefers reversible deletion.

**Acceptance Criteria:**

- [ ] Add `trash` as a backend dependency.
- [ ] Helper `moveToTrashOrDelete(absolutePath): { method: "trash" | "hard-delete" }` tries trash first, falls back to hard delete if trash throws.
- [ ] Unit tests mock `trash` and verify the trash-then-fallback path.
- [ ] Typecheck/lint passes.

### US-007: Folder picker UI component

**Description:** As a user, I want to browse my filesystem inside Maskor and pick a folder so I never have to type an absolute path.

**Acceptance Criteria:**

- [ ] Reusable `<FolderPicker>` component opens at the user's home directory by default.
- [ ] Up button navigates to parent; clicking a directory navigates into it; clicking a file does nothing (files visible but disabled).
- [ ] Address bar shows the current absolute path; user can navigate to root and to other volumes by editing it.
- [ ] "Show hidden" toggle (off by default) reveals entries whose `hidden` flag is true.
- [ ] Each directory row badges `.maskor` (Maskor project) and `.obsidian` (Obsidian vault) when those flags are set on the entry.
- [ ] "Choose this folder" button returns the current path to the caller.
- [ ] Empty state, loading state, and permission-error state are handled (the latter is surfaced inline, not as a fatal error).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-008: ProjectManagementPage replaces ProjectSelectionPage

**Description:** As a user, I want a single page that lists all my registered projects so I can act on them in one place.

**Acceptance Criteria:**

- [ ] Rename `ProjectSelectionPage` → `ProjectManagementPage` and update all references (router, links).
- [ ] Page lists registered projects (name + vault path), one row per project.
- [ ] Each row exposes: **Open**, **Rename**, **Locate vault…** (conditional), **Deregister**.
- [ ] Page has three sections in this order: project list, "Register project" (three entry points), "Settings".
- [ ] No sort/search/filter affordances (out of scope) — plain unordered list.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-009: Adopt-existing registration flow

**Description:** As a user, I want to point Maskor at an existing folder so I can use Maskor with an Obsidian vault or a prior Maskor project without losing my UUID.

**Acceptance Criteria:**

- [ ] "Adopt existing folder" entry point opens the folder picker.
- [ ] After pick, a confirmation step shows: derived project name (manifest name > folder basename, editable) and the detected folder kind: Maskor project (manifest present), Obsidian vault, writing folder (markdown), empty, or other.
- [ ] When the folder contains non-markdown files unrelated to writing, a warning shows the non-markdown file count.
- [ ] Submitting calls `POST /projects` with `mode: "adopt"`.
- [ ] If the folder has `.maskor/project.json`, the registry row's UUID equals the manifest UUID (verified in test).
- [ ] No markdown content is auto-imported — verified by checking that the fragment index is unchanged post-adopt.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-010: Create-at-custom-path registration flow

**Description:** As a user, I want to pick (or type) any path on my disk and have Maskor initialize a project there.

**Acceptance Criteria:**

- [ ] "Create new project" entry point opens the folder picker; user can also type a path that does not yet exist.
- [ ] If the path does not exist, Maskor creates it via `mkdir -p`.
- [ ] If the path exists and is non-empty with unrelated content, the same warning surface as adopt is shown.
- [ ] Submitting calls `POST /projects` with `mode: "create"`.
- [ ] Post-submit the folder contains `.maskor/project.json` and an empty `aspects/` directory.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-011: Maskor-managed registration flow

**Description:** As a user who doesn't want to think about filesystem paths, I want to type a name and have Maskor create the project folder for me under a managed root.

**Acceptance Criteria:**

- [ ] "Use Maskor-managed folder" entry point shows only a name input — no folder picker.
- [ ] Slug derivation: lowercase, ASCII-fold, replace non-alphanumerics with `-`, collapse repeats, strip leading/trailing `-`. Empty slug after stripping falls back to `project`.
- [ ] On slug collision within the managed root, suffix `-2`, `-3`, … silently.
- [ ] Confirmation step shows the resolved absolute path (e.g. "Project will be created at `~/Documents/Maskor/my-novel-2/`") before commit.
- [ ] If the configured managed root does not exist on disk, Maskor `mkdir -p`s it before creating the project folder (no user prompt).
- [ ] Submitting calls `POST /projects` with `mode: "create"` and the resolved path.
- [ ] Unit tests cover slug derivation edge cases (non-ASCII, leading numbers, empty-after-strip, collision).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-012: Rename action on each row

**Description:** As a user, I want to rename a project from the management page so its display name stays meaningful over time.

**Acceptance Criteria:**

- [ ] Row-level "Rename" action opens an inline editor (or modal) seeded with the current name.
- [ ] Submit calls `PATCH /projects/:projectId`.
- [ ] On success, the row updates and the manifest on disk reflects the new name.
- [ ] The on-disk folder name is unchanged after rename (verified in test).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-013: Locate vault action for missing paths

**Description:** As a user whose vault folder moved on disk, I want to re-point its registry entry so I can keep using the project.

**Acceptance Criteria:**

- [ ] At page load, for each registry row, check whether `vaultPath` exists on disk; if not, show **Locate vault…** instead of **Open**.
- [ ] Clicking "Locate vault…" opens the folder picker.
- [ ] Picking a folder updates the row's `vaultPath` via a new backend endpoint (e.g. `PATCH /projects/:projectId/vault-path`).
- [ ] If the picked folder contains a `.maskor/project.json` whose UUID differs from the row's UUID, a confirmation dialog ("This folder belongs to a different Maskor project. Re-point anyway?") appears; on confirm, the row's UUID is preserved and the manifest is rewritten with the row's UUID.
- [ ] If `vaultPath` uniqueness would be violated by the new path, the action errors with a clear message.
- [ ] Tests cover: simple re-point, UUID-conflict prompt + rewrite, uniqueness violation.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-014: Deregister with optional file deletion

**Description:** As a user, I want to deregister a project, with an optional irreversible-feeling step to also delete its files.

**Acceptance Criteria:**

- [ ] Row-level "Deregister" opens a confirmation dialog.
- [ ] Dialog has an **Also delete the vault folder from disk** checkbox, unchecked by default.
- [ ] When checked, a text input appears requiring the user to type the project name exactly; the confirm button stays disabled until names match.
- [ ] Confirmation copy distinguishes "moved to Trash" vs "permanently deleted" based on whether trash is available on the platform (helper from US-006 surfaces this).
- [ ] Without the checkbox: registry row removed, vault files untouched.
- [ ] With the checkbox: vault files trashed (preferred) or hard-deleted, then registry row removed.
- [ ] Tests cover both paths and the trash-fallback transition.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-015: Settings section on the management page

**Description:** As a user, I want to change where Maskor stores managed projects so I can keep them somewhere other than `~/Documents/Maskor/`.

**Acceptance Criteria:**

- [ ] "Settings" section at the bottom of `ProjectManagementPage` exposes a single field: **Where to keep Maskor-managed projects** (text input + "Browse…" button that opens the folder picker).
- [ ] Submitting writes the value via a settings endpoint, which persists to `~/.config/maskor/settings.json`.
- [ ] Changing the value does not move or re-link existing maskor-managed projects (verified in test).
- [ ] If the settings file is unparsable, the warning from US-001 is surfaced inline in this section.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

## Functional Requirements

- FR-1: `POST /projects` accepts `mode: "adopt" | "create"` and dispatches accordingly inside a single route handler.
- FR-2: On `mode: "adopt"`, if `.maskor/project.json` is present in the picked folder, the registry UUID is taken from the manifest; otherwise a new UUID is assigned.
- FR-3: On `mode: "create"`, Maskor `mkdir -p`s the target path if missing, then initializes the vault skeleton: `.maskor/`, `.maskor/project.json`, `aspects/`.
- FR-4: `PATCH /projects/:projectId` updates the registry row's name and the manifest's `name` field; never renames the folder.
- FR-5: `GET /fs/list?path=<absolute>` returns directory contents with per-entry `name`, `kind`, `hidden`, `hasMaskorManifest`, `hasObsidianDir`.
- FR-6: A new endpoint (e.g. `PATCH /projects/:projectId/vault-path`) re-points an existing project's vault path; if the new folder has a conflicting Maskor UUID, the request must include an explicit override flag, and the manifest is rewritten with the registry row's UUID.
- FR-7: `DELETE /projects/:projectId` accepts `{ deleteFiles: boolean }`; when true, the vault folder is moved to OS trash via the `trash` npm package, falling back to hard delete if trash throws.
- FR-8: Settings persist to `~/.config/maskor/settings.json`; the only supported key is `maskorManagedRoot`. Defaults: `~/Documents/Maskor/` (macOS/Linux), `%USERPROFILE%\Documents\Maskor\` (Windows).
- FR-9: Maskor-managed slug derivation: lowercase, ASCII-fold, replace non-alphanumerics with `-`, collapse repeats, strip leading/trailing `-`; empty result falls back to `project`. Collisions inside the managed root resolve via `-2`, `-3`, … suffixes.
- FR-10: If the managed root does not exist on disk at project-creation time, Maskor `mkdir -p`s it without prompting.
- FR-11: The folder picker hides entries whose `hidden` flag is true by default, with a "Show hidden" UI toggle.
- FR-12: `ProjectManagementPage` replaces `ProjectSelectionPage`; the new page lists all registered projects, each row exposing Open / Rename / Locate vault (conditional) / Deregister, with separate sections for "Register project" and "Settings".
- FR-13: Project names are not unique; identity is `(uuid, vaultPath)`. `vaultPath` uniqueness in the registry is preserved.
- FR-14: Maskor never auto-imports markdown content during adoption or creation; the existing import flow remains the only path into the fragment index.

## Non-Goals

- Per-project configuration (aspects, arcs, interleaving, notes, references, typography) — stays in `project-config.md`.
- A general settings page covering anything beyond the maskor-managed root.
- Listing affordances beyond an unordered list: sorting, search, filtering, pinning, recents.
- Auto-discovery of maskor-managed projects on disk that are not in the registry.
- Registry recovery as a dedicated flow.
- Native OS file dialogs and any desktop-shell features (Tauri/Electron).
- Cross-machine sync of registry or settings.
- Multi-user / shared projects.
- Moving on-disk folders on project rename, including for maskor-managed projects.

## Design Considerations

- Single page, three vertically stacked sections: list (top), registration entry points (middle), settings (bottom).
- Registration entry points are three distinct cards/buttons; each opens its own modal or expanded panel rather than a multi-step wizard with mode-switching.
- Reuse existing UI primitives (buttons, modals, form inputs) — no new component library.
- Folder picker is a single reusable component (US-007) consumed by Adopt, Create-at-path, Locate vault, and the Settings "Browse…" button.
- Confirmation copy on the deregister dialog must read clearly when trash is unavailable: prefer plain "Permanently delete" over euphemisms.

## Technical Considerations

- Existing `storage-service.ts` note that manifests cannot be used to re-register is treated as a bug to fix in US-003, not a deliberate limitation.
- `ProjectUpdateSchema` already exists; US-005 is wiring it to a route, not redesigning it.
- `trash` npm package is the chosen cross-platform helper; isolate it behind the helper in US-006 so it can be swapped if needed.
- Directory-browse endpoint must remain localhost-only — verify the existing server binding before exposing it.
- Settings file is plain JSON; missing keys fall back to defaults; an unparsable file surfaces a non-fatal warning, never blocks the app.
- Vault skeleton init must be idempotent so re-running adopt/create paths on the same folder is safe.

## Success Metrics

- A user can register a project without ever typing a filesystem path (via Maskor-managed or via the folder picker).
- Re-adopting a folder with `.maskor/project.json` always produces the same UUID it had on prior registration (regression coverage for the known gap).
- Rename round-trips through the API and is reflected both in the registry and on disk in the manifest, without moving the folder.
- Deregister-with-delete uses OS trash on supported platforms and falls back to hard delete elsewhere, with confirmation copy that reflects which path runs.
- `~/.config/maskor/settings.json` is the single source of truth for the managed root; defaults apply when the file is missing or partial.

## Open Questions

- Trash-on-delete cross-platform reliability via the `trash` npm package — to be validated during US-006; if Windows or Linux fail, the helper's fallback to hard delete is the safety net.
- On "Locate vault" UUID conflict: current spec preserves the registry row's UUID and rewrites the manifest. Revisit if user testing finds this confusing — alternative is steering the user to deregister-then-adopt.
- Should `GET /fs/list` ever expose `.git` directories' contents, or only flag the directory as hidden? Current plan treats them the same as any other dotfile (hidden, with toggle).
- The spec's recorded concern about in-app file deletion being irreversible stands — revisit if data-loss reports surface even with the opt-in + name-typing + trash mitigations.
