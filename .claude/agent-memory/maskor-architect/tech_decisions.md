---
name: Technology decisions — settled and open
description: What's decided, what's not, and why
type: project
---

**How to apply:** Check here before suggesting a new technology. Don't re-propose rejected or settled choices.

## Settled

- Runtime: Bun (all backend packages)
- Language: TypeScript (strict)
- Frontend: React 19 + Vite + Vitest (not Bun test)
- ORM: Drizzle (bun-sqlite adapter)
- DB: SQLite via bun:sqlite (two DBs: registry + per-vault index)
- Markdown parse: gray-matter
- Logger: pino (in shared, passed via config)
- UUID branding: ts-brand
- Monorepo: Bun workspaces (no Turborepo/Nx)
- File I/O: Bun.file / Bun.write (not node:fs readFile/writeFile)
- Testing: bun test (backend), vitest (frontend)

## Open / not yet decided

- API framework: Hono listed in CLAUDE.md — not yet installed in @maskor/api. NestJS mentioned in TODO. Hono is correct call (lightweight, Bun-native).
- File watcher: chokidar planned, not yet integrated
- Frontend shell: Tauri vs Electron vs browser-only — undecided
- Processing queue: Redis mentioned, not started. Bun.redis available natively.
- Import: Pandoc dependency for .docx — not yet wired

## Rejected / not used

- express → Bun.serve() or Hono
- better-sqlite3 → bun:sqlite
- ioredis → Bun.redis
- pg / postgres.js → Bun.sql
- dotenv → Bun auto-loads .env
- execa → Bun.$`cmd`
- jest/vitest → bun test (except frontend which uses vitest)
