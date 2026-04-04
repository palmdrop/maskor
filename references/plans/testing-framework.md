# Testing Framework Plan

**Date:** 2026-04-04  
**Status:** Done

---

## Summary

Two-runner strategy: `bun test` for all backend/shared packages (zero config, native), `vitest` for the frontend (Vite-native, RTL-compatible). Playwright for E2E in a later phase.

---

## 1. Tooling Decisions

### Backend packages: `bun test`

All of `api`, `storage`, `importer`, `processor`, `sequencer`, `shared` use Bun's built-in Jest-compatible test runner.

**Why not Vitest everywhere?**  
Backend packages don't use Vite. Bun's runner is faster for pure TS, zero-install, and the Jest-compatible API (`expect`, `describe`, `it`, `mock`) means there's no learning curve. Switching later is easy since the API is the same.

### Frontend: `vitest` + `@testing-library/react` + `happy-dom`

**Why not `bun test` for frontend?**  
React component tests need a DOM. Bun's DOM support is experimental. Vitest uses the same Vite config, supports `happy-dom` (lighter than jsdom, faster), and React Testing Library is battle-tested in this setup.

**Why `happy-dom` over `jsdom`?**  
3–10× faster startup, sufficient for most component tests. Fall back to `jsdom` per-file if you hit edge cases with `// @vitest-environment jsdom`.

### E2E: Playwright (Phase 2)

Skip until there's meaningful UI to test. Placeholder section below.

### Coverage

- Backend: `bun test --coverage` (uses V8 coverage, built-in)
- Frontend: `vitest run --coverage` with `@vitest/coverage-v8`

---

## 2. Directory Conventions

Co-locate tests with source. Use `__tests__/` subdirectories to avoid cluttering the source directory.

```
packages/
  shared/
    src/
      utils/
        scoring.ts
        __tests__/
          scoring.test.ts
  sequencer/
    src/
      engine.ts
      __tests__/
        engine.test.ts
    tests/               ← integration tests (heavier, may need DB/FS)
      sequencer.integration.test.ts
  frontend/
    src/
      components/
        FragmentEditor/
          FragmentEditor.tsx
          __tests__/
            FragmentEditor.test.tsx
      hooks/
        useFragment.ts
        __tests__/
          useFragment.test.ts
```

Test file naming:

- Unit: `*.test.ts` / `*.test.tsx`
- Integration: `*.integration.test.ts`
- E2E (later): `*.e2e.ts` in a top-level `e2e/` directory

---

## 3. Config Files

### 3.1 Root `bunfig.toml`

Controls `bun test` behavior across all backend packages.

```toml
# bunfig.toml (root)
[test]
coverage = false          # enable per-run with --coverage flag
coverageReporter = ["text", "lcov"]
coverageDir = "coverage"
```

### 3.2 Frontend `vitest.config.ts`

Place at `packages/frontend/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/main.tsx", "src/**/*.d.ts"],
    },
  },
});
```

### 3.3 Frontend test setup file

`packages/frontend/src/test/setup.ts`:

```typescript
import "@testing-library/jest-dom";
// Add any global mocks, custom matchers, or MSW setup here
```

### 3.4 Root `package.json` scripts

Add to the root `package.json`:

```json
{
  "scripts": {
    "test": "bun run test:backend && bun run test:frontend",
    "test:backend": "bun test packages/shared packages/api packages/storage packages/importer packages/processor packages/sequencer",
    "test:frontend": "cd packages/frontend && bun run vitest run",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage && cd packages/frontend && bun run vitest run --coverage"
  }
}
```

### 3.5 Per-package `package.json` scripts

Add to each backend package:

```json
{
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage"
  }
}
```

Add to `packages/frontend/package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## 4. Dependencies to Install

### Frontend only

```bash
bun add -D vitest @vitest/coverage-v8 happy-dom --cwd packages/frontend
bun add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event --cwd packages/frontend
```

> No new deps needed for backend packages — `bun test` is built-in.

---

## 5. What to Test in Each Package

Priority order (highest ROI first):

### `@maskor/shared` — Pure functions, type utilities

- Brand type guards
- Any utility functions (once added)
- No mocking needed — purely functional

```typescript
// packages/shared/src/utils/__tests__/example.test.ts
import { describe, it, expect } from "bun:test";
import { someUtil } from "../someUtil";

describe("someUtil", () => {
  it("does the thing", () => {
    expect(someUtil("input")).toBe("expected");
  });
});
```

### `@maskor/sequencer` — Core logic, highest complexity

This is the most logic-heavy package. Tests should cover:

- Fitting score calculations
- Placement engine with mock fragment data
- Deadlock/loop detection
- Noise/seeding determinism (same seed → same output)
- Constraint graph validation (aspect rules)

```typescript
// packages/sequencer/src/__tests__/fitting.test.ts
import { describe, it, expect } from "bun:test";
import { computeFitScore } from "../fitting";

describe("computeFitScore", () => {
  it("returns higher score for matching aspects", () => {
    // ...
  });

  it("returns same score for same seed (determinism)", () => {
    const score1 = computeFitScore(fragment, context, seed);
    const score2 = computeFitScore(fragment, context, seed);
    expect(score1).toBe(score2);
  });
});
```

### `@maskor/storage` — File I/O, vault sync

- Use Bun's built-in `tmp` for isolated file tests
- Test: write/read/delete fragment files, frontmatter parsing, watcher event handling
- Mock the file system for unit tests; use real tmp dirs for integration tests

### `@maskor/api` — Route handlers

- Test handlers directly (not over HTTP) for unit tests
- Integration tests with a real (in-memory or test) DB
- Use Hono's `app.request()` for lightweight route testing without spinning up a server

```typescript
import { describe, it, expect } from "bun:test";
import app from "../app";

describe("GET /fragments", () => {
  it("returns 200 with fragment list", async () => {
    const res = await app.request("/fragments");
    expect(res.status).toBe(200);
  });
});
```

### `@maskor/importer` — File parsing

- Parse fixture files (`.docx`, `.md`, `.txt`) → expected fragment output
- Store fixture files in `packages/importer/fixtures/`
- Test edge cases: empty files, malformed frontmatter, duplicate UUIDs

### `@maskor/frontend` — Components and hooks

Focus on behavior, not implementation:

```tsx
// packages/frontend/src/components/FragmentEditor/__tests__/FragmentEditor.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FragmentEditor } from "../FragmentEditor";

describe("FragmentEditor", () => {
  it("renders fragment title", () => {
    render(<FragmentEditor fragment={mockFragment} />);
    expect(screen.getByText("My Fragment")).toBeInTheDocument();
  });

  it("calls onAccept when accept button clicked", async () => {
    const onAccept = jest.fn();
    render(<FragmentEditor fragment={mockFragment} onAccept={onAccept} />);
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledWith(mockFragment.id);
  });
});
```

---

## 6. Mocking Strategy

### Backend — Bun mock

```typescript
import { mock, spyOn } from "bun:test";

const mockDb = mock(() => ({ find: mock(() => []) }));
```

### Frontend — MSW (Mock Service Worker) for API calls

Instead of mocking `fetch` manually, use **MSW** to intercept HTTP at the network level. This catches real API shape mismatches.

```bash
bun add -D msw --cwd packages/frontend
```

```typescript
// packages/frontend/src/test/handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/fragments", () => {
    return HttpResponse.json([{ id: "1", title: "Test Fragment" }]);
  }),
];
```

Add to `setup.ts`:

```typescript
import { server } from "./server";
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## 7. CI Integration (GitHub Actions sketch)

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run test
      - run: bun run typecheck
```

---

## 8. Phase 2 — E2E with Playwright

Defer until there's a working UI. When ready:

```bash
bun add -D @playwright/test
bunx playwright install
```

Place tests in `e2e/` at the repo root. Playwright config at `playwright.config.ts`.

---

## 9. Implementation Order

1. Install frontend deps (vitest, RTL, happy-dom, MSW)
2. Add `vitest.config.ts` and `setup.ts` to frontend
3. Add `bunfig.toml` at root
4. Add `test` scripts to all `package.json` files
5. Write first tests in `@maskor/shared` (easiest, no deps)
6. Write first tests in `@maskor/sequencer` (highest value)
7. Add MSW setup to frontend, write first component test
8. Add CI workflow

---

## Open Questions

- **Database in tests**: Will the API/storage tests use SQLite in-memory (`:memory:`) or a real test database? SQLite in-memory is recommended as default.
- **Test data factories**: Consider a `packages/shared/src/test-utils/` module with fragment/aspect/arc factory functions shared across packages.
- **`@maskor/processor` queue tests**: If using Redis, integration tests may need a local Redis instance (via Docker Compose or `bun`'s built-in Redis client with a test container).
