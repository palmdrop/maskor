# Maskor

**NOTE:** I tend to not use LLMs to actually write code. However, the software development industry is moving in the direction of using AI as another abstraction layer above the code itself. I figured it is good to learn the tools. This project is an opinionated, personal app I've been thinking about for a while. I'm using this as an opportunity develop this app quickly, while also learning to leverage new AI technologies. Development has relied heavily on Claude Code, mainly using agents and a `references` folder for storing context, plans and reviews.

A fragmented writing app. Write in disconnected pieces — **fragments** — then sequence them into a coherent whole.

An Obsidian vault acts as the human-editable source of truth. The database is a derived cache that can always be fully rebuilt from markdown.

---

## Core concepts

- **Fragment** — a self-contained writing unit with a `readyStatus` (0–1).
- **Aspect** — a named dimension (e.g. `grief`, `city`) with a per-fragment weight (0–1). Used to measure thematic fit.
- **Sequence / Section** — an ordered arrangement of fragments. DB-only; managed through the UI.
- **Piece** — a raw `.md` file dropped into `pieces/` that gets imported as a new fragment.
- **Arc** — a curve describing how an aspect should evolve across a sequence. Used by the sequencer to score fragment placement.

See [`references/SYNC_CONTRACT.md`](references/SYNC_CONTRACT.md) for the full field ownership table and sync rules.

---

## Packages

| Package     | Role                                                              |
| ----------- | ----------------------------------------------------------------- |
| `shared`    | Domain types and shared utilities                                 |
| `storage`   | Vault read/write — parse, serialize, map markdown ↔ domain types  |
| `api`       | HTTP API exposing fragments, aspects, sequences                   |
| `processor` | Processing queue — enriches and validates incoming fragments      |
| `sequencer` | Scores and orders fragments within sequences using arc fitting    |
| `importer`  | Converts external files (`.docx`, etc.) into fragments via Pandoc |
| `frontend`  | React UI for browsing, editing, and sequencing fragments          |

---

## Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Frontend:** React + Vite
- **Storage:** Markdown vault (Obsidian-compatible) + SQLite/Postgres (cache)
- **ORM:** Drizzle (planned)
- **File watching:** Chokidar (planned)
- **API:** Hono (planned)

---

## Getting started

```bash
bun install
```

Run all tests:

```bash
bun test
```

Typecheck:

```bash
bun run typecheck
```

---

## Vault layout

```
<vault>/
  fragments/            # active fragment files
  fragments/discarded/  # discarded fragments
  aspects/              # aspect definitions
  notes/                # notes
  references/           # references
  pieces/               # drop raw .md files here to import as fragments
```
