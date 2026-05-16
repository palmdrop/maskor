# Spec: Project Management

**Status**: Draft
**Last updated**: 2026-05-16

**Shipped**:

- 2026-05-16 — Baseline registration lifecycle migrated from `project-config.md`: manual name + absolute-path registration via `POST /projects`, UUID assignment and `.maskor/project.json` manifest written at `<vault>/.maskor/`, registry list backed by `~/.config/maskor/registry.db`, deregister via `DELETE /projects/:projectId` leaving vault files untouched, `vaultPath` uniqueness enforced, and project rename via `PATCH /projects/:projectId` (`storageService.updateProject` + `registry.updateProject`, exercised from the project config tabbed UI). (plan: pre-existing; not produced by a Ralph run.)

---

## Outcome

A writer opening Maskor can create a new project, adopt an existing folder (Obsidian vault or previous Maskor project), or let Maskor create and own a project folder for them — without typing filesystem paths by hand. From the same page they can rename a project, locate a vault that has moved on disk, deregister a project (optionally deleting its files), and configure where Maskor stores its managed projects by default.

---

## Scope

### In scope

- A single **Project Management** page that lists registered projects and exposes all lifecycle actions.
- Three registration flows surfaced as distinct UI affordances:
  - **Adopt existing** — point Maskor at an existing folder (Obsidian vault, previously-used Maskor vault, or any folder with markdown).
  - **Create at custom path** — pick (or create) a folder on disk, Maskor initializes it.
  - **Maskor-managed** — Maskor creates the folder for the user under a configurable global root.
- A backend-driven directory browser endpoint that powers folder selection across browsers without a native shell.
- Re-adoption of a folder that already has `.maskor/project.json` reuses the existing UUID and manifest data (closes a known gap).
- Project rename after registration.
- "Locate vault…" action to re-point a registry entry whose stored path no longer exists on disk.
- Deregister, with an opt-in "Also delete files" choice gated by a name-typing confirmation.
- A single configurable setting: the global root for maskor-managed projects, edited from the same page.
- Settings stored at `~/.config/maskor/settings.json`.

### Out of scope

- Per-project configuration (aspects, arcs, interleaving, notes, references, typography, advanced toggles). Owned by `project-config.md`.
- A general settings page covering anything beyond the maskor-managed root.
- Listing affordances beyond an unordered list: sorting, search, filtering, pinning, recents.
- Auto-discovery of maskor-managed projects on disk that are not in the registry (see `references/suggestions.md`).
- Registry recovery as a dedicated flow (the manifest-reuse rule below partially covers it; full recovery tracked separately).
- Native OS file dialogs and any desktop-shell features (Tauri/Electron).
- Cross-machine sync of registry or settings.
- Multi-user / shared projects.

> The out-of-scope list is as important as the in-scope list. Close every door you can.

---

## Behavior

### Project Management page

- A single page lists all registered projects (name + vault path) and exposes lifecycle actions.
- Each row carries: **Open**, **Rename**, **Locate vault** (only shown when the stored path is missing on disk), and **Deregister**.
- A "Register project" section offers three entry points: **Adopt existing folder**, **Create new project**, **Use Maskor-managed folder**.
- A "Settings" section on the same page exposes the global maskor-managed root.
- The frontend page replaces `ProjectSelectionPage` and is renamed `ProjectManagementPage`.

### Folder picker

- A backend endpoint lists directory contents for a given absolute path, returning entries with name, kind (file / directory), and a flag for whether each directory contains `.maskor/project.json` and/or `.obsidian/`.
- The picker UI opens at a default root (user home directory) and lets the user navigate up to root or jump to another volume.
- Files are visible but not selectable; only directories can be chosen.
- The picker is used by **Adopt existing**, **Create at custom path**, and **Locate vault**. **Maskor-managed** does not use the picker.

### Registration: Adopt existing

- User picks an existing directory.
- Detection rules applied to the picked directory:
  - `.maskor/project.json` present → adoption reuses the manifest's UUID, name, and any other manifest-stored metadata. The user can override the name before submit.
  - `.obsidian/` present (no Maskor manifest) → treat as an Obsidian vault. Init Maskor structure, assign a new UUID. Default the project name to the folder name.
  - Markdown files present (neither `.maskor/` nor `.obsidian/`) → treat as a writing folder. Init Maskor structure, new UUID, default name to folder name.
  - Empty folder → init, new UUID, default name to folder name.
  - Contains non-markdown content unrelated to writing → allow, but surface a warning showing the non-markdown file count so the user is not blindsided.
- Maskor never auto-imports existing markdown content; the user uses the fragment import flow to bring fragments into the index.

### Registration: Create at custom path

- User either picks an existing empty folder or supplies a path that does not yet exist.
- If the path does not exist, Maskor creates it (`mkdir -p`).
- If the path exists and is non-empty, the same warning surface as Adopt's "unrelated content" branch applies.
- A new UUID is assigned and the full vault skeleton is initialized.

### Registration: Maskor-managed

- The user types a project name. No folder is picked.
- Maskor derives a slug from the name and creates `<maskor-managed-root>/<slug>/`.
- On slug collision within the root, Maskor silently suffixes `-2`, `-3`, etc.
- The resulting absolute path is shown in a confirmation step ("Project will be created at `~/Documents/Maskor/my-novel-2/`") before commit.
- A new UUID is assigned and the full vault skeleton is initialized.

### Single registration endpoint

- The existing `POST /projects` endpoint takes an additional `mode: "adopt" | "create"` parameter and branches internally. There is no separate "adopt" route. The same endpoint:
  - Validates the path exists (adopt) or creates it (create).
  - Reads or writes the vault manifest.
  - Reuses an existing UUID iff a Maskor manifest is found during adopt; otherwise assigns a new UUID.
  - Writes the registry entry.

### Init on create

- A newly created project (custom path or maskor-managed) is initialized with the full vault skeleton:
  - `.maskor/` directory
  - `.maskor/project.json` manifest
  - `aspects/` directory
- Other vault structure (arcs config, vault DB) is still created lazily by the features that own it.

### Name handling

- Default project name comes from, in order: existing Maskor manifest > folder basename > user-typed (for maskor-managed mode).
- The name is always editable in the registration form before submit.
- Project names are not unique. Two projects may share a name; UUID and vault path are the identity.

### Rename

- A project can be renamed from its row on the management page.
- Rename updates the registry row and the `name` field in `.maskor/project.json`.
- Rename does not move or rename the project's folder on disk, including for maskor-managed projects. The slug-derived folder name reflects the name at creation time only.
- This closes the existing gap in the API: `ProjectUpdateSchema` is wired up to a `PATCH /projects/:uuid` route.

### Locate vault

- When the registry contains a row whose `vaultPath` does not exist on disk at app start, that row shows a **Locate vault…** action instead of **Open**.
- The action opens the folder picker. Picking a folder updates the row's `vaultPath`.
- If the picked folder contains a `.maskor/project.json` whose UUID differs from the registry row's UUID, surface a confirmation ("This folder belongs to a different Maskor project. Re-point anyway?"). The user can override; the registry row's UUID is preserved (the manifest is rewritten on confirmation).

### Deregister

- Deregister removes the registry row.
- A checkbox **Also delete the vault folder from disk** is offered, **unchecked by default**.
- When checked, the user must type the project name to confirm.
- File deletion prefers the OS-level trash (Finder Trash on macOS, freedesktop trash on Linux, Recycle Bin on Windows) over hard delete. If trashing is unavailable on the platform, fall back to hard delete and surface that distinction in the confirmation copy.
- Deregister without the delete checkbox leaves all vault files untouched, matching current behavior.

### Settings: maskor-managed root

- The Settings section on the management page exposes a single field: **Where to keep Maskor-managed projects**.
- Default: `~/Documents/Maskor/` on macOS and Linux; `%USERPROFILE%\Documents\Maskor\` on Windows.
- Changing this setting only affects projects created after the change. Existing maskor-managed projects are not moved.
- Setting is persisted to `~/.config/maskor/settings.json` (created on first write).

---

## Constraints

- Backend has filesystem access; the frontend runs in a browser without a desktop shell, so all folder selection goes through the backend directory-browse endpoint.
- The directory-browse endpoint must accept any absolute path on the host filesystem (the local-first model makes this acceptable) but is invoked from a local-only API and is not exposed to the network.
- All vault paths stored in the registry remain absolute, matching the current contract.
- `vaultPath` uniqueness in the registry is preserved: a folder can back at most one project.
- Existing manifest re-adoption must not fork identity: if the picked folder has `.maskor/project.json`, the registered UUID equals the manifest UUID.
- Maskor-managed slug collisions resolve silently with numeric suffixes; the user never sees an error for "name taken".
- The "Also delete files" option must be off by default and require name-typing confirmation; OS trash is preferred over `rm -rf`.
- Project rename never renames the on-disk folder, even for maskor-managed projects, to avoid breaking external references and Obsidian links.
- Settings file format is human-readable JSON. Missing keys fall back to documented defaults; an unparsable file is treated as empty and a warning surfaced on the management page.

---

## Prior decisions

- **Three UI affordances, two backend operations.** Adopt / Create-at-path / Maskor-managed are conceptually distinct to the user but collapse to `adopt | create` at the API. Surfacing them separately makes the maskor-managed option discoverable to users who do not want to think about filesystem paths.
- **Backend-driven directory browser, not `window.showDirectoryPicker()`.** The browser API returns an opaque `FileSystemDirectoryHandle`, not an absolute path; the registry needs paths. A backend endpoint also works cross-browser and is straightforward to swap for a native dialog if a desktop shell is added later.
- **Manifest re-use closes the re-register gap.** The existing `storage-service.ts` note that manifests cannot currently be used to re-register is treated as a bug, not a deliberate limitation. Adoption reuses UUIDs.
- **Folder content is never auto-imported.** Adopting a folder with markdown does not pull those files into the fragment index. Existing import flows remain the only path into the index.
- **No filesystem move on rename.** Renaming a project updates the registry and manifest only. Moving files would require updating every internal link and external reference, breaking Obsidian's mental model.
- **Settings as a JSON file, not a DB table.** Human-readable, hand-editable during development, and matches the vault-side principle that human-readable storage wins where possible. The registry DB stays scoped to project records.
- **This spec owns lifecycle; `project-config.md` owns per-project content.** `project-config.md` retains aspects, arcs, interleaving, notes, references, typography. Its existing "Project registration" subsection becomes a redirect to this spec.

---

## Open questions

- [ ] 2026-05-16 — Concern recorded against the decision to offer in-app file deletion on deregister: this is an irreversible action against the user's prose, which the vision treats as the durable artifact that outlives the tool. Mitigations in this spec (opt-in, name-typing confirmation, OS trash preferred) reduce but do not eliminate the risk. Revisit if any data-loss reports surface.
- [ ] 2026-05-16 — Trash-on-delete cross-platform reliability: macOS via `osascript`/Finder, Linux via `gio trash` / freedesktop spec, Windows via shell APIs. A small wrapper library (e.g. `trash` on npm) is the obvious candidate but adds a dependency; alternative is per-platform shell-outs. To be decided at implementation.
- [ ] 2026-05-16 — Should the directory-browse endpoint include hidden directories (e.g. `.obsidian`, `.maskor`, `.git`) in its listing? Hidden by default with a toggle is one option; always hidden is another. UX TBD.
- [ ] 2026-05-16 — Slug derivation rules for maskor-managed folder names: how aggressively to transliterate non-ASCII (e.g. "Möbius" → `mobius` vs `m-bius`), how to handle leading numbers or empty slugs after stripping. To be specified at implementation.
- [ ] 2026-05-16 — What happens if the configured maskor-managed root does not exist on first use? Auto-create on first project creation under it, or require the user to confirm? Auto-create is the lighter UX but commits Maskor to creating directories under arbitrary user-chosen paths.
- [ ] 2026-05-16 — On "Locate vault" where the picked folder has a different Maskor UUID: is preserving the registry row's UUID and overwriting the manifest the right call, or should the user be steered toward deregister-then-adopt? Current spec keeps registry UUID for minimal disruption; revisit if the behavior is confusing in practice.

---

## Acceptance criteria

- The Project Management page replaces the previous Project Selection page and lists all registered projects with Open, Rename, Locate vault (conditional), and Deregister actions.
- A user can adopt an existing folder by browsing to it; if the folder has `.maskor/project.json`, the resulting registry row's UUID equals the manifest UUID.
- A user can create a new project at a custom path; if the path does not exist, Maskor creates it, and the resulting folder contains `.maskor/project.json` and an empty `aspects/` directory.
- A user can create a maskor-managed project by typing a name only; the resulting folder appears under the configured maskor-managed root, with a slug-derived folder name and `-2`, `-3` suffix on collisions.
- The folder picker opens at the user's home directory by default and allows navigation to root and to other volumes.
- A user can rename a project; the change is reflected in the registry row and the `.maskor/project.json` manifest; the folder name on disk is unchanged.
- A user can re-point a project whose stored path no longer exists; choosing a folder updates `vaultPath`. If the chosen folder has a conflicting Maskor UUID, the user is prompted and can confirm.
- A user can deregister a project with no file deletion (default), and the registry row is removed while vault files remain intact.
- A user can deregister a project with "Also delete files" checked; after name-typing confirmation, the vault folder is moved to OS trash where supported, otherwise hard-deleted, and the registry row is removed.
- The Settings section persists changes to `~/.config/maskor/settings.json`; the file is human-readable JSON.
- The maskor-managed root setting affects only future maskor-managed project creation; existing projects are unaffected.
- The single `POST /projects` endpoint accepts `mode: "adopt" | "create"` and dispatches the correct flow internally.
