# Suggestions

- **Add MSW for frontend API mocking** (`packages/frontend/src/test/`): The testing framework is set up but MSW (Mock Service Worker) is not yet installed. Once the frontend starts making API calls, add `msw` and create handler fixtures in `src/test/handlers.ts` so tests intercept HTTP at the network level rather than mocking `fetch` manually. Install: `bun add -D msw --cwd packages/frontend`.
- **Add CI workflow** (`.github/workflows/test.yml`): No CI is configured yet. A minimal GitHub Actions workflow running `bun install && bun run test && bun run typecheck` on push/PR would catch regressions automatically. See the sketch in `references/plans/testing-framework.md` section 7.
