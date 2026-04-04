# @maskor/storage

Reads and writes the Maskor vault — a directory of human-editable markdown files that act as the source of truth for fragments, aspects, notes, and references.

The database is a cache derived from the vault and can be fully rebuilt from markdown at any time.

---

## Vault layout

```
<vault>/
  fragments/            # active fragment files
  fragments/discarded/  # discarded fragments
  aspects/              # aspect definitions
  notes/                # notes
  references/           # references
  pieces/               # consume directory — drop raw .md files here to import
```

---

## Usage

```ts
import { createVault } from "@maskor/storage";

const vault = createVault({ root: "/path/to/vault" });

// fragments
const fragments = await vault.fragments.readAll();
const fragment  = await vault.fragments.read("/path/to/vault/fragments/the-bridge.md");
await vault.fragments.write(fragment);
await vault.fragments.discard(fragment.uuid);

// aspects, notes, references
const aspects    = await vault.aspects.readAll();
const notes      = await vault.notes.readAll();
const references = await vault.references.readAll();

// consume all files in pieces/ → converts to fragments, deletes source files
const newFragments = await vault.pieces.consumeAll();
```

---

## File format

Fragment files use YAML frontmatter + Dataview-compatible inline fields + markdown body:

```md
---
uuid: "frag-uuid-here"
title: "The Bridge"
version: 3
pool: unplaced
readyStatus: 0.8
notes:
  - "bridge observation"
references:
  - "city research"
---

grief:: 0.6
city:: 0.9

She crossed it every morning without looking down.
```

See [`references/SYNC_CONTRACT.md`](../../references/SYNC_CONTRACT.md) for all entity formats and the full field ownership table (markdown-owned vs. DB-only).

---

## Key concepts

**Source of truth.** All frontmatter and inline fields are user-editable. Maskor never modifies body content.

**Pool / folder rule.** The `fragments/discarded/` folder is authoritative for discarded state — placing a file there overrides the `pool` frontmatter field. Maskor logs a warning when the two conflict.

**Pieces.** `pieces/` is a drop-in consume directory. Any `.md` file placed there is converted to a fragment (pool: `unprocessed`), written to `fragments/`, and the source file is deleted. Triggered manually via `vault.pieces.consumeAll()` — file watching comes later.

**Slugified filenames.** Filenames are derived from `title`/`key` via `slugify()` (lowercase, spaces → hyphens, strip special chars). The `title` frontmatter field is always authoritative.

**UUIDs.** Mappers never generate UUIDs. If a file is missing a `uuid`, the caller (or a future sync layer) assigns one and writes it back.

---

## Internal architecture

Four layers, each with a single responsibility:

| Layer     | File           | Role                                                           |
| --------- | -------------- | -------------------------------------------------------------- |
| Parse     | `parse.ts`     | Raw string → `ParsedFile` (frontmatter + inline fields + body) |
| Serialize | `serialize.ts` | Domain parts → formatted markdown string                       |
| Mappers   | `mappers/*.ts` | `ParsedFile` ↔ domain types (`Fragment`, `Aspect`, etc.)      |
| Vault     | `vault.ts`     | File I/O + path resolution via `createVault(config)`           |

---

## Tests

```
bun test --cwd packages/storage
```

Fixtures live at `packages/storage/fixtures/vault/`. Mapper and parse/serialize tests are in-memory. Vault tests copy the fixture directory to a temp directory and operate on that.
