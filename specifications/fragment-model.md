# Spec: Fragment Model

**Status**: Draft
**Last updated**: 2026-04-24

---

## Outcome

A fragment is the atomic unit of a writing project. The user creates, enriches, and refines fragments independently of their final order. Fragments move through a lifecycle — raw text to placed and scored — and are eventually merged into a sequence for export. Maskor treats each fragment as a complete, self-describing document that can be worked on in any order.

---

## Scope

### In scope

- What a fragment is and what fields it carries
- Fragment lifecycle: creation, editing, enrichment, discarding, restoration
- Ready status semantics
- Aspect properties on fragments (weights)
- Notes and references attached to fragments
- Piece → Fragment conversion path
- Fragment identity and rename behavior
- Discard and restore behavior

### Out of scope

- How fragments are stored, hashed, and synced with the DB (see `specifications/storage-sync.md`)
- Sequence placement algorithm and fitting score computation (see future `specifications/sequencer.md`)
- Arc and interleaving definitions (see future `specifications/aspect-arc-model.md`)
- Export formatting
- The random prompting mechanism (deferred — intent noted below)
- Custom non-aspect user properties (deferred)
- Markdown file format details (see `specifications/storage-sync.md`)

---

## Behavior

### What a fragment is

A fragment is a titled, UUID-identified piece of writing. It has:

- **Content** — the markdown body. The actual writing. Maskor never modifies this; only the user does (via the fragment editor or Obsidian directly).
- **Title** — a display name. Also determines the filename slug.
- **`readyStatus`** — a float 0–1 the user sets to indicate how finished the fragment is. `1.0` means finished.
- **Aspect properties** — a map of aspect keys to weights (0–1), indicating how strongly the fragment embodies each project aspect. Primary input to the fitting score.
- **Notes** — a list of note titles attached to this fragment.
- **References** — a list of reference names. Same rules as notes.
- **`isDiscarded`** — whether the fragment has been removed from the active working set.

### Lifecycle

1. **Creation** — a fragment is created by the user via the UI (title + content required), or automatically from a Piece dropped into the vault's `pieces/` directory.

2. **Editing** — the user edits content in the fragment editor. Metadata (title, `readyStatus`, notes, references, aspect properties) is edited through the metadata panel.

3. **Enrichment** — the user adds aspect weights, notes, and references over time. This is the primary way Maskor accumulates the data needed for sequencing.

4. **Readiness** — the user manually controls `readyStatus`. A value of `1.0` signals the fragment is finished. Maskor may suggest a value, but the file is always authoritative.

5. **Placement** — the fragment is assigned a position in a sequence. Handled by the sequencer (out of scope here).

6. **Fitting** — once placed, Maskor computes how well the fragment fits its position based on aspects, arcs, and interleaving rules. Handled by the sequencer (out of scope here).

7. **Discard** — the user removes a fragment from the active working set. The fragment is not deleted, and can be restored whenever.

8. **Restore** — a discarded fragment can be moved back to the active set.

9. **Export** — fragments are merged in sequence order into a single text. Out of scope here.

### Prompting mechanism (intent, deferred)

The intended workflow: after finishing work on a fragment, Maskor randomly prompts the user with an unfinished fragment to work on next. This enforces non-linear writing and prevents the user from over-polishing fragments in isolation. The selection mechanism (uniform random, weighted by `readyStatus`, filtered by recency) is not yet designed. Worth preserving as a core design intention — it shapes what fields and states the fragment model needs to expose.

### Aspect properties

Each project aspect can have a weight on a fragment (0–1), expressing how strongly the fragment embodies it. These weights are the primary input to the sequencer's fitting score.

Weights are set by the user via the metadata panel.

### Notes and references

- A fragment can reference existing notes and references by title or name.
- Only notes and references that already exist in the vault can be attached.
- The fragment owns the relationship. Notes and references carry no back-reference to the fragment.
- Removing a note from the fragment removes it from the list only — it does not delete the note file.

### Identity and rename

- A fragment's UUID is its stable identity. Renaming a fragment changes the filename but not the UUID.

### Piece → Fragment conversion

A Piece is a raw writing file without metadata. Maskor detects these files (placed in a certain `pieces` directory) and converts them to fragments automatically.

---

## Constraints

- Maskor never edits fragment content without explicit user edits through the fragment editor.
- Maskor never auto-rewrites fragment files to fix aspect key drift.
- Unknown aspect property keys must be preserved on save, not silently dropped.
- Fragment identity is UUID-based. Filename and title may change; UUID cannot.
- Sequence positions, fitting scores, and arc positions are not part of the fragment model.
- `readyStatus` must be in range 0–1.

---

## Prior decisions

- **Pool removed**: The `pool` field (`unprocessed`, `incomplete`, `unplaced`, `discarded`) was removed entirely. These states introduced persistent divergence risk between frontmatter and filesystem. `isDiscarded` derived from folder location is the only remaining lifecycle state. Do not re-introduce.
- **Folder-based discard**: Discard state is determined solely by file location (`fragments/discarded/`). No frontmatter flag. This eliminates the possibility of the frontmatter and filesystem location disagreeing.
- **`version` removed**: The `version` frontmatter field served no user-facing purpose.
- **Fragment owns note/reference relationships**: Fragment frontmatter lists note titles and reference names. Notes and references carry no back-reference. Keeps notes and references self-contained, with fragments as the attachment point.
- **Piece is transient**: A piece has no UUID and no full metadata. On conversion, the piece file is deleted. There is no conversion back.
- **Only existing notes/references can be attached**: Adding a note or reference that does not yet exist in the vault is not allowed from the fragment editor.
- **`contentHash` computed at write time**: `storageService.fragments.write()` computes the hash from the serialized file and returns the fragment with the correct hash. Route handlers use the return value — no empty hashes are exposed to callers.

---

## Open questions

- [ ] 2026-04-24 — **`updatedAt` for externally-edited files**: when Obsidian edits a fragment directly, `updatedAt` is not updated by Maskor. Accept stale `updatedAt` for external edits, or write it back on every watcher sync?
- [ ] 2026-04-24 — **`isComplete` and `isPlaced` derived states**: removed with pool, no replacement yet. If needed: `isComplete` could be derived from field presence, `isPlaced` from sequence membership. Decide before building the overview or sequencer UI.
- [ ] 2026-04-24 — **Prompting mechanism**: how does Maskor select the next fragment to prompt? Uniform random among unfinished fragments, weighted by `readyStatus`, or filtered by recency/cooldown?
- [ ] 2026-04-24 — **Custom non-aspect properties**: `project_specs.md` mentions "custom properties for outlining, interleaving, and overview views." Currently `properties` is aspect weights only. Does this expand, or do aspects cover all cases?

---

## Acceptance criteria

- A newly created fragment has a UUID, title, `readyStatus: 0`, empty notes and references, empty aspect properties, and `isDiscarded: false`.
- Creating a fragment via the API returns a `Fragment` with a non-empty `contentHash`.
- Updating a fragment's content via the API returns a `Fragment` with a `contentHash` that differs from the pre-update value.
- Discarding a fragment moves its file to `fragments/discarded/` and subsequent reads reflect `isDiscarded: true`.
- Restoring a discarded fragment moves its file back to `fragments/` and subsequent reads reflect `isDiscarded: false`.
- Aspect property keys for deleted aspects are preserved across a save — not removed.
- A fragment's UUID does not change on title rename.
- `readyStatus` values outside 0–1 are rejected.
- Notes and references can only reference titles/names that already exist in the vault.
- A piece file dropped into `pieces/` is converted to a fragment and the piece file is deleted.
