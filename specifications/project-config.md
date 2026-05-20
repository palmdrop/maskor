# Spec: Project Configuration

**Status**: Stable
**Last updated**: 2026-04-27

**Shipped**:

- 2026-04-04 — The suggestion eligibility cutoff ("Ready status threshold") is configurable per project, controlling which fragments are eligible for suggestion mode. (plan: references/plans/suggestion-mode.md)
- 2026-04-30 — User can manage project configuration from a dedicated tabbed UI: edit project name, create/rename/delete aspects and their arcs, manage notes and references. (plan: references/plans/project-config-page.md)
- 2026-05-08 — Project configuration is stored in the vault, making vaults portable — moving a vault preserves all configuration without registry dependency. (plan: references/plans/project-config-vault-storage.md)
- 2026-05-08 — The fragment stats inspector panel can be toggled per project from an Advanced section in the General tab. (plan: references/plans/project-statistics.md)
- 2026-05-10 — Font size and paragraph width are configurable per project from the General tab and applied live across all editor modes. (plan: references/plans/editor-typography-settings.md)

---

## Outcome

The user can create a project (pointing at a vault on disk), give it a name and optional notes/references, define the aspects that matter to their writing, configure an arc for each aspect, and set interleaving rules that govern how those aspects mix in the final sequence. The configuration is persistent, human-readable where possible, and survives a DB loss.

---

## Scope

### In scope

- Project registration: name + vault path → assigns UUID, writes vault manifest
- Project metadata: name, notes, references (user-editable)
- Aspect management: create, rename, delete aspects within a project
- Arc configuration: define an arc (a curve of weight values over time) for each aspect
- Interleaving rules: a minimal, configurable set of constraints on how aspects can sequence — e.g. weights, exclusion rules, section constraints
- A dedicated project configuration UI view
- Future consideration: derive arcs and interleaving config FROM an existing rough sequence (user arranges fragments manually, then generates config from that ordering)

### Out of scope

- Fragment content — fragments belong to a project but are not configured here
- Sequencer logic — arcs and interleaving rules are inputs to the sequencer; how the sequencer uses them is out of scope for this spec
- Multi-user or cross-project fragments
- Hosting or remote project registration
- Automatic arc fitting or sequencer-generated arcs (tracked as a future feature; not built here)

> The out-of-scope list is as important as the in-scope list. Close every door you can.

---

## Behavior

### Project registration

Project registration, adoption, creation, deregistration, rename, vault relocation, and the configurable maskor-managed root are owned by `project-management.md`. The behavior summarized below is preserved for context but the authoritative spec is the project management one.

- A project is created with a name and an absolute vault path.
- On registration, a UUID is assigned and a manifest is written to `<vault>/.maskor/project.json`
- The registry DB (`~/.config/maskor/registry.db`) stores the UUID → vault path mapping.
- A project can be deleted (deregistered). Deletion removes the registry entry; vault files are not touched (unless the user opts in to file deletion — see `project-management.md`).
- Project name can be updated after creation.

### Aspects

See `aspect-arc-model.md`

- Aspects are the building blocks of project configuration. Each represents a thematic dimension: a character, theme, place, event, time period, etc.
- Each aspect is stored as a markdown file in `<vault>/aspects/<slug>.md` (vault-owned).
- An aspect has: a unique key (slug), an optional category, and optional notes.
- Aspects can be created, renamed, and deleted from the configuration view.
- Deleting an aspect does not modify fragment files

### Arcs

See `aspect-arc-model.md`

- An arc describes how one aspect rises and falls in weight across the sequence — a curve, not a frequency rule.
- Each arc is associated with exactly one aspect.
- An arc is defined as an ordered list of control points `{ x, y }` — both in [0, 1] — where `x` is the normalized sequence position and `y` is the target weight. At least two points are required. The sequencer interpolates between points; the method (linear, cubic spline) is a sequencer concern.
- Arc data is stored at `<vault>/.maskor/config/arcs/<aspect-key>.yaml`, one file per aspect. See `aspect-arc-model.md`.
- Arcs are inputs to the sequencer's fitting score calculation; they are not evaluated here.

### Interleaving

See `interleaving.md`

- Interleaving controls how aspects mix across the sequence: frequency, switching rate, constraints on adjacency.
- A minimal interleaving config must support at minimum:
  - Per-aspect weights (how often an aspect should appear)
  - Exclusion rules (aspect A cannot directly follow aspect B)
- Extended rules (time-specific weights, section constraints, hand-drawn interaction patterns) are future scope — the data model should not preclude them.
- Interleaving belongs to a project. Storage location is TBD (see open questions).

### Configuration UI

- A dedicated view in the frontend allows the user to: register/deregister projects, edit project metadata, manage aspects, define arcs, and configure interleaving rules.
- Arc editing UI: at minimum a simple curve editor (draggable control points or editable value array). Exact UX TBD.

---

## Constraints

- Vault is the source of truth for aspects (files in `<vault>/aspects/`). The DB is a derived index.
- Aspect keys are slugs — stable identifiers that fragment properties reference. Renaming an aspect means renaming its key; this propagates as a sync warning until fragment files are updated.
- Project registration requires the vault path to be an existing directory on disk.
- `vaultPath` must be unique per registry entry (no two projects pointing at the same vault).
- All vault paths are stored relative to vault root internally; absolute paths are used only at registration.
- Interleaving type is currently a stub (`// TODO`). Any data model introduced must be serializable (no function fields) if it is to be persisted.

---

## Prior decisions

- **Aspects live in vault files**: Aspect definitions are stored as markdown files in `<vault>/aspects/`. This keeps them human-readable and Obsidian-compatible, consistent with the vault-as-source-of-truth principle.
- **Project registry is separate from vault DB**: The registry DB lives in `~/.config/maskor/` (global, user-scoped). The vault DB lives in `<vault>/.maskor/vault.db` (travels with the vault). This separation means a user can move a vault without losing the content index.
- **Vault manifest on registration**: `project.json` is written to `<vault>/.maskor/` on `registerProject`. Intended to support DB recovery, though recovery logic is not yet implemented.
- **Arc schema defined, not yet implemented**: `arc.ts` in shared defines `ArcPoint`, `Arc`, `ArcCreate`, `ArcUpdate`. No Arc storage, API routes, or UI exist yet.
- **Interleaving schema is unbuilt**: `interleaving.ts` in shared is a `// TODO`. No design has been settled.
- **Project update route**: `PATCH /projects/:projectId` is wired end to end (route handler, `storageService.updateProject`, `registry.updateProject`), exposing the `ProjectUpdateSchema` fields. Project rename and editor-config updates flow through it. Owned by `project-management.md`.

---

## Open questions

- [x] 2026-04-27 — Where does arc data live? Vault files (like aspects) or DB only? Vault files would make arcs human-readable and Obsidian-visible; DB-only simplifies the watcher but loses vault portability. **Resolved**: Vault-stored. Each arc is a file at `<vault>/.maskor/config/arcs/<aspect-key>.yaml`. See `aspect-arc-model.md`.
- [ ] 2026-04-27 — Where does interleaving config live? If vault, what format? YAML frontmatter in a project config file (`<vault>/.maskor/interleaving.yaml`)? Or DB-only since it is algorithmic config rather than writing data?
- [ ] 2026-04-27 — Should arcs reference aspects by key (slug) or UUID? Key is more human-readable in vault files; UUID is safer against renames. Currently aspects are referenced by key everywhere (fragment properties, domain model).
- [x] 2026-04-27 — What is the minimal shape of an Arc? **Resolved**: sparse control points `{ x, y }` both in [0, 1], minimum 2 points. See `aspect-arc-model.md`.
- [ ] 2026-04-27 — What is the data model for interleaving?
- [ ] 2026-04-27 — How does renaming an aspect key propagate? Current design leaves orphaned keys as sync warnings. Should the config view warn the user or offer a bulk-rename across fragment files?
- [ ] 2026-04-27 — Future feature: generate project config from an existing rough sequence. What does the UX look like? This is flagged as important but design is entirely open.

---

## Acceptance criteria

- A project can be registered with a name and vault path; a `project.json` manifest is present at `<vault>/.maskor/project.json` afterward.
- A registered project appears in the project list and can be retrieved by UUID.
- A project can be deregistered; the registry entry is gone and vault files are untouched.
- Aspects created in the config view appear as markdown files in `<vault>/aspects/`.
- Deleting an aspect removes its vault file; fragments that referenced its key show `UNKNOWN_ASPECT_KEY` warnings on the next rebuild, not errors.
- An arc can be created for an aspect and its weight curve can be saved and retrieved.
- An interleaving config with at least per-aspect weights and one exclusion rule can be saved and retrieved for a project.
- The configuration view displays existing aspects, arcs, and interleaving rules for the active project.
