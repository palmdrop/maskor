# Spec: Drafting

**Status**: Draft
**Last updated**: 2026-05-18
**Shipped**: 2026-05-18 — first slice (create, list, delete, restore) shipped end-to-end with crash recovery and the in-flight watcher drain. Rename is deferred to a follow-up slice. See `references/plans/drafting-first-slice.md`.

---

## Outcome

The user can create a named "draft" at any time — a complete snapshot of the project at that moment, including all fragment content, aspects, notes, references, sequences, arcs, configuration, and the action log. Drafts persist alongside the project and can be listed, renamed, and deleted. The user can restore the project to any prior draft, with the current state automatically saved as a new draft first by default.

The mental model mirrors how writers traditionally work: keeping older versions of a manuscript alongside the current rewrite, so nothing is ever lost when an experimental direction needs to be abandoned.

---

## Scope

### In scope

- Manual creation of named drafts that capture the full project state
- Listing all drafts for a project with name, creation date, optional note, and entity counts
- Renaming and deleting drafts
- Restoring the project to a prior draft, with optional "save current first" safety net
- Atomic snapshot creation (no half-built drafts left on disk)
- Crash-recovery cleanup of staging and restore-aside directories
- Action-log integration: `draft:created`, `draft:renamed`, `draft:deleted`, `draft:restored` entries
- **Full-state export on draft creation** (opt-in checkbox): alongside writing the snapshot, produce a companion exportable bundle that represents the project's prose state at that moment — see "Full-state export" below

### Out of scope

- In-app draft preview / overview surfaces (deferred — see `references/suggestions.md`)
- Automatic snapshots, time-based history, or session checkpoints
- Content-addressed deduplication between drafts
- Draft forking, branching, or diffing UI
- Multi-project draft operations
- Export of an individual draft outside the vault, beyond the full-state export described below

---

## Behavior

### What a draft contains

A draft is a complete copy of the vault directory at the moment of creation. It includes:

- All fragment files (`fragments/`, including `fragments/discarded/`)
- All aspect files (`aspects/`)
- All note files (`notes/`)
- All reference files (`references/`)
- Maskor configuration and per-vault state (`.maskor/sequences/`, `.maskor/config/`, `.maskor/vault.db`, `.maskor/project.json`, `.maskor/action-log.jsonl`)
- A `manifest.json` with the draft's UUID, name, creation date, optional note, and entity counts

A draft excludes:

- `.maskor/drafts/` itself (recursion)
- `.obsidian/` (editor UI state, not project content)

### Draft storage layout

Drafts live in `<vault>/.maskor/drafts/<slug>-<short-uuid>/`. The folder name is the slugified name plus a short UUID fragment for on-disk uniqueness. The full UUID is the canonical id, stored in `manifest.json`.

Renaming a draft updates `manifest.json` and renames the folder on disk to reflect the new slug.

### Naming and uniqueness

- Names are required, free-text, and case-insensitively unique within a project (matches the fragment-key convention).
- The default name on the create dialog is `Draft N`, where N is the count of non-deleted drafts plus one. The user can override before confirming.
- An optional plain-text note accompanies each draft for the user's own reference.

### Creating a draft

Draft creation is a stop-the-world operation:

1. Pre-check: available disk space must be at least `2 × (vaultSize + dbSize)`. Refuse otherwise.
2. Acquire the storage write lock; drain in-flight write handlers.
3. Pause the vault watcher.
4. Stage the new draft in `<vault>/.maskor/drafts/.staging/<uuid>/`:
   - Copy `fragments/`, `aspects/`, `notes/`, `references/`, `.maskor/sequences/`, `.maskor/config/`, `.maskor/project.json`, `.maskor/action-log.jsonl` into the staging directory.
   - Produce a consistent DB snapshot via `VACUUM INTO` targeting the staging directory.
   - Write `manifest.json`.
5. Atomically rename the staging directory to `<vault>/.maskor/drafts/<slug>-<short-uuid>/`.
6. Resume the watcher; release the write lock.
7. Append a `draft:created` entry to the action log.

If any step fails before the atomic rename, the staging directory is deleted and a clear error is surfaced. The user never sees a half-built draft.

Only one draft create or restore operation can be in progress at a time. Concurrent attempts return `DRAFT_OPERATION_IN_PROGRESS`.

### Listing drafts

The drafts list shows each draft's name, creation date, optional note, and entity counts (fragments, aspects, sequences) read from `manifest.json`. The list is the primary way the user identifies which draft to restore. Snapshot DBs are not opened during listing.

### Renaming a draft

The user provides a new name; it must satisfy the same case-insensitive uniqueness rule as creation. The operation:

1. Updates `manifest.json` in place.
2. Renames the folder on disk to reflect the new slug.

If the folder rename fails after the manifest is updated, the manifest remains authoritative; the on-disk slug is stale but functional. The next "fix slugs" pass (future) can reconcile.

A `draft:renamed` entry is appended to the action log.

### Deleting a draft

The user can delete any draft. A confirmation modal is required, but there are no restrictions on which drafts can be deleted. Deletion removes the draft directory entirely and appends a `draft:deleted` entry to the action log.

### Restoring a draft

Restore is destructive: it overwrites the current vault state with the snapshot's. The flow:

1. Confirmation modal with a "Save current state as a draft first" checkbox, on by default. The user can name the pre-restore draft or accept the default `Pre-restore — {timestamp}`.
2. If the checkbox is on: a regular draft creation runs first (same path as normal creation, including disk space check). If it fails, restore aborts before touching the live vault.
3. Acquire the storage write lock; drain in-flight write handlers.
4. Pause the vault watcher.
5. For each top-level vault subdirectory being replaced (`fragments/`, `aspects/`, `notes/`, `references/`, `.maskor/sequences/`, `.maskor/config/`, `.maskor/vault.db`): rename the live copy to `<vault>/.maskor/drafts/.restore-aside/<original-name>/`, then copy the snapshot's version into the live location. `.maskor/project.json` and `.maskor/action-log.jsonl` are deliberately excluded — see below.
6. If any step fails, roll back by renaming the aside copies back into their original locations. Surface a clear error.
7. On success, delete `.restore-aside/`.
8. Trigger a full DB rebuild from the restored vault files. The snapshotted `vault.db` is present, but is not trusted as the live DB — vault remains source of truth.
9. Resume the watcher; release the write lock.
10. Emit a single `vault:restored` SSE event with the draft id.
11. Append a `draft:restored` entry to the action log.

`.maskor/action-log.jsonl` is **not** overwritten during restore. The log is meta-history about the user's process and is preserved across restores; the `draft:restored` entry is appended to the existing log.

`.maskor/project.json` is **not** overwritten during restore. It carries per-project settings (name, editor preferences, suggestion thresholds, advanced flags) that belong to the user's current working environment, not to the snapshotted moment. The snapshot still contains a copy of `project.json` as a backup, recoverable manually if the user ever needs to inspect or revert settings.

### Crash recovery

On project resolve at startup, if `<vault>/.maskor/drafts/.staging/` or `<vault>/.maskor/drafts/.restore-aside/` exists, it is evidence of an interrupted operation. Both are deleted; a warning is logged so the user knows recovery happened. The pre-restore draft (if a restore was in progress) remains intact as the primary recovery surface.

### Full-state export

A draft snapshot captures everything needed to restore inside Maskor. But a writer also wants a readable artifact of the project at that moment — something to skim, print, share, or compare to a future version — without having to manually export afterwards.

When creating a draft, the user can opt into producing a **full-state export bundle** alongside the snapshot. The bundle is written into the draft's own directory (`<vault>/.maskor/drafts/<slug>-<short-uuid>/export/`) and contains:

- One file per sequence (main sequence first, then any secondary sequences), assembled via `@maskor/exporter` using the project's current default export options.
- One file containing **all unplaced fragments** (those not in any sequence at draft creation time), assembled in alphabetical order by `key`.
- One file containing **all discarded fragments**, assembled in alphabetical order — same shape as the discarded-fragment dump in `export.md`.

Notes, references, and aspects are **not** included in the export bundle in v1. The bundle is prose-focused; metadata documents are intentionally left to a future iteration if the use case proves out.

The export bundle's format defaults to Markdown. Other formats (`.txt`, `.docx`, `.pdf`) follow `export.md`'s decisions once they land there.

Generating the bundle is part of the draft-creation transaction:

- The bundle is written into the staging directory before the atomic rename, so a failed bundle aborts the entire draft creation cleanly.
- A bundle-generation failure surfaces a clear error and rolls back the staged draft (matching the existing all-or-nothing creation contract).

The export bundle is independent of restore: restoring a draft does not regenerate or modify the bundle. The bundle is a frozen artifact tied to the draft's creation moment.

The "Per-draft markdown export at creation time" previously listed as deferred is replaced by this section.

---

## Constraints

- Drafts are stored entirely within `<vault>/.maskor/drafts/`. They travel with the vault and are not registered globally.
- A draft is meant to be internally consistent — the storage layer enforces a full stop-the-world snapshot rather than a best-effort copy.
- The DB inside a snapshot is captured via `VACUUM INTO`, never via raw file copy.
- The live `action-log.jsonl` and `project.json` are preserved across restore. Both are snapshotted for backup purposes but not overwritten when restoring.
- Snapshot creation must drain in-flight write handlers, not just set a flag (closes the async race window from `references/suggestions.md`).
- Disk space sanity checks must run before any file is written.
- Only one draft create-or-restore operation can be in flight at a time.

---

## Prior decisions

- **Filesystem snapshots, not git**: A Maskor-managed git repository was considered but rejected. Git's main wins (delta storage, cheap branching) are not load-bearing for the stated goals (list + restore). Costs are real: collision with users who already maintain their own git on the vault, known corruption risks when `.git` lives inside a cloud-synced directory (iCloud/Dropbox), opaque hidden state, and the SQLite DB binary blobs that bloat history without diffing usefully. Semantic diffs between drafts (fragments added/removed, sequences reordered) are richer than git's line diffs and must be computed by Maskor regardless of storage layer.
- **Full directory copy, not delta storage**: Disk usage is acceptable for typical vault sizes. If draft counts and vault sizes grow into territory where this matters, content-addressed dedup (`blobs/<sha>` + manifest of `{path, sha}` pairs) can be added later without changing the user-facing model.
- **Snapshot includes the DB**: Justified by future preview use cases (read-only inspection of a draft can open the snapshot DB directly). Not used during restore — restore rebuilds the DB from the snapshotted vault files to preserve the "vault = source of truth" invariant from `storage-sync.md`.
- **Manual creation only for v1**: User-driven snapshots mirror the way many writers work (keeping copies of older drafts during rewrites). Automatic snapshotting introduces rotation, dedup, and UX-disambiguation complexity that is out of scope. Granular history is better served in the future by deriving it from the action log.
- **Disallow inclusion of `.obsidian/`**: It is editor UI state (last opened file, pane layout), not project content. Snapshotting it would mean restoring a draft resets the user's editor view.
- **Pre-restore draft via opt-out checkbox**: Default-on safety, but visible. An always-silent auto-snapshot before restore would produce "Before restore" graveyards from repeated experimentation. A confirmation modal alone, without the checkbox, would force the user to remember to snapshot first.
- **Stop-the-world snapshot, not best-effort**: A partial snapshot (some files post-edit, some pre-edit, DB in a third state) is a latent bug that surfaces only after a restore. The cost — a brief write freeze during a rare user-initiated operation — is acceptable. The same write lock is useful for future bulk operations.
- **Action log preserved across restore**: The action log is the user's audit trail of what they did. Rewinding it as part of a restore would erase the ability to answer "what did I do this week?" — which is exactly the kind of context the user may want after a restore.
- **`project.json` preserved across restore**: It carries the user's current working environment (settings, editor preferences, suggestion thresholds) rather than snapshot-bound content. Restoring an old draft and finding the user's settings rolled back too would be surprising. The snapshot still captures `project.json` as a backup for manual recovery, mirroring the action log's treatment.
- **Names are case-insensitively unique**: Matches the fragment-key convention from `storage-service.ts`. Avoids the case-sensitivity wart flagged for sequence names in `references/suggestions.md`.

---

## Open questions

- [ ] 2026-05-18 — Should there be a soft-cap on the number of drafts per project, with a warning surfaced when approaching it? Disk-space pre-checks cover the hard failure, but heavy users with hundreds of drafts may want explicit feedback before it becomes a problem.
- [ ] 2026-05-18 — What is the user-facing label for "Pre-restore — {timestamp}" drafts, and should they be visually distinguished in the drafts list from user-created drafts? Affects UX only, not storage.
- [x] 2026-05-19 — Drain fix landed in the same slice as the first draft implementation. The watcher's `pause()` is now async and drains in-flight handlers via a per-watcher tracker; storage callers `await` it before snapshotting.

---

## Acceptance criteria

- Creating a draft produces a `<vault>/.maskor/drafts/<slug>-<short-uuid>/` directory containing `manifest.json`, the full vault contents, a consistent DB snapshot, and `action-log.jsonl`.
- A draft directory never appears unless it is complete — failed creations leave no partial draft on disk.
- Two drafts cannot share a name, regardless of case (`Draft 1` and `draft 1` collide).
- Renaming a draft updates both `manifest.json` and the on-disk folder slug.
- Restoring a draft, with "save current first" enabled, results in two operations in the action log: a `draft:created` (the pre-restore safety draft) followed by a `draft:restored`.
- The live `action-log.jsonl` is byte-for-byte identical before and after a restore, except for the appended `draft:restored` entry.
- The live `project.json` is byte-for-byte identical before and after a restore, regardless of the snapshot's `project.json` content.
- A single `vault:restored` SSE event is emitted after restore completes, carrying the restored draft's id.
- Concurrent draft-create or draft-restore attempts return `DRAFT_OPERATION_IN_PROGRESS` without affecting the in-progress operation.
- Stale `.staging/` or `.restore-aside/` directories present at project resolve are cleaned up before any user-facing operation runs.
- After a successful restore, fragment / aspect / note / reference / sequence counts in the live DB match the counts recorded in the restored draft's manifest.
- The disk-space pre-check refuses creation when free space is less than `2 × (vaultSize + dbSize)`.
- Snapshot creation does not interleave with any in-flight write — handlers are drained before the snapshot begins.
- When the user opts in to a full-state export on draft creation, the resulting bundle is present under `<vault>/.maskor/drafts/<slug>-<short-uuid>/export/` and contains one file per sequence, one for unplaced fragments, and one for discarded fragments.
- A bundle-generation failure aborts the draft creation atomically — no draft directory appears on disk.
- Restoring a draft does not regenerate or modify any previously written export bundle.
