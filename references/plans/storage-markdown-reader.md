# Plan: Storage — Markdown Reader/Writer

Scope: implement markdown parsing, serializing, and vault-level file operations in `packages/storage`.
No DB sync for now — pure file I/O against the vault directory.
Existing files in `packages/storage/src/backend/` can be disregarded and rewritten from scratch.

Reference: `references/SYNC_CONTRACT.md`

---

## Library

Add `gray-matter` for frontmatter parsing.

```
bun add gray-matter --cwd packages/storage
bun add -d @types/gray-matter --cwd packages/storage
```

No library needed for inline fields — a small regex parser handles `key:: value`.

---

## File structure

```
packages/storage/src/
  backend/
    markdown/
      parse.ts          # raw file string → ParsedFile
      serialize.ts      # domain parts → markdown file string
      init.ts           # Piece → new Fragment file
      mappers/
        fragment.ts     # ParsedFile ↔ Fragment
        aspect.ts       # ParsedFile ↔ Aspect + inline fields ↔ FragmentProperties
        note.ts         # ParsedFile ↔ Note
        reference.ts    # ParsedFile ↔ Reference
      vault.ts          # createVault(config) factory
      index.ts          # re-export createVault as the public API
    types.ts            # VaultConfig, VaultError, Vault interface
  index.ts
```

---

## Vault folder layout

```
<vault>/
  fragments/            # active fragments
  fragments/discarded/  # discarded fragments
  aspects/              # aspect definitions
  notes/                # notes
  references/           # references
  pieces/               # consume directory — drop raw pieces here
```

`pieces/` is a consume directory. Any `.md` file dropped there is treated as a raw `Piece`: no frontmatter expected, just a title (from filename) and content. The vault reads it, converts it to a fragment via `initFragment`, writes the result to `fragments/`, and deletes the original file. This is handled by `vault.consumePieces()` — not by the file watcher (that comes later).

---

## Types — `types.ts`

```ts
export type VaultConfig = {
  root: string; // absolute path to vault root
};

export type VaultError = {
  message: string;
  cause?: unknown;
};

export type Vault = {
  fragments: {
    readAll(): Promise<Fragment[]>;
    read(filePath: string): Promise<Fragment>;
    write(fragment: Fragment): Promise<void>;
    discard(uuid: FragmentUUID): Promise<void>;
  };
  aspects: {
    readAll(): Promise<Aspect[]>;
    read(filePath: string): Promise<Aspect>;
    write(aspect: Aspect): Promise<void>;
  };
  notes: {
    readAll(): Promise<Note[]>;
    read(filePath: string): Promise<Note>;
    write(note: Note): Promise<void>;
  };
  references: {
    readAll(): Promise<Reference[]>;
    read(filePath: string): Promise<Reference>;
    write(reference: Reference): Promise<void>;
  };
  pieces: {
    // reads all files in pieces/, converts each to a Fragment, writes to fragments/, deletes source
    consumeAll(): Promise<Fragment[]>;
  };
};
```

---

## Layer 1 — `parse.ts`

Single responsibility: take a raw markdown string, split it into three parts.

```ts
type ParsedFile = {
  frontmatter: Record<string, unknown>; // parsed YAML via gray-matter
  inlineFields: Record<string, string>; // lines matching `key:: value`
  body: string;                         // everything after inline fields
};

export const parseFile = (raw: string): ParsedFile
```

Inline field parsing:

- Scan lines immediately after the closing `---`.
- Match against `/^([\w-]+):: (.+)$/`.
- Stop on the first non-matching, non-empty line — that is the start of `body`.
- Empty lines between inline fields are skipped.

---

## Layer 2 — `serialize.ts`

Single responsibility: take domain-owned parts and produce a valid markdown string.
All file writes go through this function — consistent formatting is guaranteed.

```ts
export const serializeFile = (options: {
  frontmatter: Record<string, unknown>;
  inlineFields?: Record<string, string | number>;
  body: string;
}): string
```

Output:

```
---
<YAML>
---

key:: value

<body>
```

---

## Layer 3 — `mappers/`

Each mapper exposes `fromFile` (ParsedFile → domain type) and `toFile` (domain type → serializable parts).
UUID assignment for missing `uuid` fields is the caller's responsibility — mappers never generate UUIDs.

### `mappers/aspect.ts`

Two responsibilities: mapping aspect definition files to `Aspect`, and mapping fragment inline fields to `FragmentProperties`.

```ts
// aspect file → Aspect domain type
// body → description (optional)
// strings are force-cast to branded UUID types (e.g. uuid as AspectUUID)
export const fromFile = (parsed: ParsedFile): Aspect
export const toFile = (aspect: Aspect): { frontmatter: Record<string, unknown>; body: string }

// inline fields → FragmentProperties
// record key is the aspect key; value is { weight }
// full Aspect resolution is deferred to the DB layer
export const inlineFieldsToProperties = (
  fields: Record<string, string>
): FragmentProperties

// FragmentProperties → inline fields
export const propertiesToInlineFields = (
  properties: FragmentProperties
): Record<string, number>
```

`FragmentProperties` is `{ [aspectKey: string]: { weight: number } }`. The outer key is the aspect key — no need to store it again in the value. Full `Aspect` hydration happens later at the DB layer.

### `mappers/fragment.ts`

```ts
export const fromFile = (parsed: ParsedFile, filePath: string, pool?: Pool): Fragment
export const toFile = (fragment: Fragment): {
  frontmatter: Record<string, unknown>;
  inlineFields: Record<string, number>;
  body: string;
}
```

- `pool` override: if provided (e.g. forced `"discarded"` by folder), takes precedence over frontmatter.
- `filePath` is passed so the mapper can derive `title` from the filename when the frontmatter field is missing.
- Frontmatter fields mapped: `uuid`, `title`, `version`, `pool`, `readyStatus`, `notes`, `references`.
- Inline fields → `properties` via `aspect.ts`.
- `body` → `content: Markdown`.
- `contentHash` and `updatedAt` are NOT written to file (DB-only).
- All string UUIDs are force-cast to their branded types (`uuid as FragmentUUID`, etc.).

**Missing field defaults:**
- `uuid` missing → caller assigns a new UUID before writing back.
- `title` missing → derive from filename (strip `.md` extension, keep as-is). For `initFragment`, fall back to `fragment-<uuid>` when content has no non-empty first line.
- `pool` missing → `"incomplete"` if any other required frontmatter field is also absent; `"unplaced"` if all fields are present.
- `version` missing → default to `1`.
- `readyStatus` missing → default to `0`.
- `notes` / `references` missing → default to `[]`.

### `mappers/note.ts`

```ts
export const fromFile = (parsed: ParsedFile): Note
export const toFile = (note: Note): { frontmatter: Record<string, unknown>; body: string }
```

- No `attachedTo` — the owning fragment/aspect tracks the relationship via its own `notes` array.
- `uuid` missing → caller assigns. `title` missing → derive from filename.
- String UUIDs force-cast to `NoteUUID`.

### `mappers/reference.ts`

Same pattern as `note.ts`, using `name` instead of `title`. No `attachedTo`.
String UUIDs force-cast to `ReferenceUUID`.

---

## Fragment initializer — `init.ts`

Creates a new fragment file from a `Piece`. Entry point for importing raw writing into the vault.

```ts
export const initFragment = (
  config: VaultConfig,
  piece: Piece,
): Promise<Fragment>
```

- `piece.title` is optional. If missing, derive from the first non-empty line of content, or fall back to `fragment-<uuid>` using the fragment's own UUID.
- Generates a UUID via `crypto.randomUUID()`.
- Constructs a `Fragment` with safe defaults:
  - `pool: "unprocessed"`
  - `version: 1`
  - `readyStatus: 0`
  - `properties: {}`, `notes: []`, `references: []`
  - `content`: piece content, unchanged
- Serializes via `serialize.ts`, writes to `fragments/<title>.md`.
- Throws `VaultError` if a file already exists at the target path.
- Returns the created `Fragment`.

---

## Layer 4 — `vault.ts`

### VaultConfig scope — factory pattern

`createVault(config: VaultConfig): Vault`

Returns an object with all read/write methods bound to the given config. No global state. Callers hold a vault instance and pass it around; tests just call `createVault({ root: tmpDir })`.

```ts
export const createVault = (config: VaultConfig): Vault
```

### Filename convention

Filenames are derived from the title/key using a shared `slugify` utility: lowercase, spaces to hyphens, strip non-alphanumeric characters. Example: `"The Bridge"` → `the-bridge.md`. The `title` frontmatter field is always authoritative — the filename is display-only and updated by Maskor on write.

### Path conventions

| Entity             | Path                                    |
| ------------------ | --------------------------------------- |
| Active fragment    | `<root>/fragments/<title>.md`           |
| Discarded fragment | `<root>/fragments/discarded/<title>.md` |
| Aspect             | `<root>/aspects/<key>.md`               |
| Note               | `<root>/notes/<title>.md`               |
| Reference          | `<root>/references/<name>.md`           |
| Piece (consume)    | `<root>/pieces/<filename>.md`           |

### Pool / folder conflict rule

- Fragment read from `fragments/discarded/` → `pool` is always set to `"discarded"`, regardless of frontmatter.
- Fragment read from `fragments/discarded/` but frontmatter `pool` is not `"discarded"` → log a warning, override silently.
- Fragment read from `fragments/` (not discarded) but frontmatter `pool` is `"discarded"` → log a warning, do not override (trust the folder as authoritative for discarded state, not the frontmatter).
- `readAll()` scans both `fragments/` and `fragments/discarded/`.

### `discard(uuid)`

- Scans the vault to find the file path for the given UUID.
- Moves the file to `fragments/discarded/<title>.md`.
- Rewrites frontmatter `pool` to `"discarded"` after move.

### `pieces.consumeAll()`

- Scans `pieces/` for `.md` files.
- For each file: reads raw content, constructs a `Piece` (title from filename, content from body), calls `initFragment`, deletes the source file.
- Returns all created `Fragment`s.
- If `initFragment` throws (e.g. name collision), logs the error, skips that file, and continues.

### File I/O

Use `Bun.file` for reads, `Bun.write` for writes, `node:fs/promises` (`readdir`, `rename`, `unlink`) for directory operations — safer than `Bun.$` shell interpolation.

---

## Tests

Each layer gets its own test file. Parse/serialize/mapper tests use in-memory strings — no file I/O. Vault and init tests use a temp directory fixture.

```
packages/storage/src/__tests__/
  parse.test.ts
  serialize.test.ts
  init.test.ts
  mappers/
    aspect.test.ts      # covers both fromFile/toFile and inlineFieldsToProperties
    fragment.test.ts
    note.test.ts
    reference.test.ts
  vault.test.ts
```

Vault fixtures exist at `packages/storage/fixtures/vault`. This contains some basic fragments, aspects, notes and references for testing purposes.

---

## What is NOT in scope

- DB sync (`contentHash`, `updatedAt`)
- File watcher / chokidar (triggering `consumeAll` automatically comes later)
- `backend/index.ts` wiring to the wider `Backend` type

---

## Implementation order

1. `types.ts` — `VaultConfig`, `VaultError`, `Vault`
2. `parse.ts` + tests
3. `serialize.ts` + tests
4. `mappers/aspect.ts` + tests
5. `mappers/fragment.ts` + tests
6. `mappers/note.ts`, `mappers/reference.ts` + tests
7. `init.ts` + tests
8. `vault.ts` + tests
9. `index.ts` — export `createVault`
