# Review: Preview/import shared Tiptap renderer + exporter assembler core (Scope A)

**Date**: 2026-05-31
**Scope**: `packages/exporter`, `packages/api` (preview + import-preview routes/schemas), `packages/frontend` (shared renderer, anchor node, preview/import pages)
**Plan**: `references/plans/preview-import-shared-renderer.md`
**Spec**: `specifications/preview.md`, `specifications/export.md`, `specifications/import-pipeline.md`

---

## Overall

The implementation matches the plan and the ADR. Preview and import now render through one read-only Tiptap instance (`ReadonlyProse`) fed by `@maskor/exporter`'s assembled markdown; both endpoints return `{ markdown, sections }`; toggles apply server-side; anchors are exporter-emitted sentinels mapped to an invisible schema node rendering `id="fragment-<id>"`; `html` stays `false`. `StaticMarkdown`, `ReadonlyEditor`, `buildPreviewMarkdown`, and the `<strong>`-matching `scrollToPiece` are gone with no dangling importers, and `dangerouslySetInnerHTML` is absent from these surfaces. The assembler core is well-tested and the separator/heading/anchor logic is clean. No correctness bugs found. The main thing worth attention is structural: the sentinel syntax is hand-mirrored across the package boundary with no test guarding the two copies against drift. One minor navigation nit (anchors land below the title heading).

Note (original): I could not run `bun run verify` — `bun` is not installed in this review environment. Findings are from static inspection of the diff against `main`. The plan records `verify` passing in the implementation environment.

**Update (2026-05-31, bun now available)**: Ran the suite. The static findings below stand. Verification results, and one environment issue to fix, are recorded in the new "Verification" section at the bottom.

---

## Bugs

None.

---

## Design

### 1. Sentinel syntax is duplicated across the package boundary with no drift guard — FIXED 2026-05-31

`packages/exporter/src/sentinel.ts` and `packages/frontend/src/components/anchor-sentinel.ts` independently declare `SENTINEL_OPEN/SEPARATOR/CLOSE`, `SENTINEL_LABEL`, and `anchorSentinel`. The duplication itself is justified and documented (Node-only logger in the shared barrel keeps a value import out of the browser bundle). The gap is that **nothing tests the contract across the seam**: the exporter emits the token, the frontend parses it, but no test feeds exporter-produced output into the frontend renderer.

`packages/frontend/src/components/readonly-prose.test.tsx:4` imports `anchorSentinel` from the **frontend mirror**, not from `@maskor/exporter`. So if the exporter's `SENTINEL_LABEL` (or any sentinel char) changed and the mirror were not updated, every test would still pass while anchor navigation silently broke in production — the exporter tests use the exporter's constant, the frontend tests use the frontend's constant, and the two never meet.

Consequence: a one-sided edit to either file is undetectable by the suite. Fix: add one test that imports the exporter's `anchorSentinel` (it's a pure string builder, safe to import in a test even if not in the bundle) and asserts the frontend's `ANCHOR_SENTINEL_LINE_PATTERN` matches it — or assert the two mirrors are byte-identical.

**Fixed 2026-05-31** — `packages/frontend/src/components/anchor-sentinel.test.ts` imports the exporter's canonical `anchorSentinel` straight from its source (`sentinel.ts` has zero imports, so no Node-only logger is pulled and no `@maskor/exporter` barrel is touched) and asserts (a) the frontend mirror builds byte-identical tokens, and (b) the frontend's `ANCHOR_SENTINEL_LINE_PATTERN` matches an exporter-emitted token and captures its id. A one-sided edit to either file now fails this test. The test lives in the frontend, which runs under `bun run verify`.

---

## Minor

### 2. Anchor lands below the fragment's title heading — FIXED 2026-05-31

`packages/exporter/src/assemble.ts:84-87` / `:113-116` emit blocks as `title` then `body`, and the anchor sentinel is prefixed to the **body** (`assemble-markdown.ts:98-99`). So in the assembled markdown the order is `### title` → sentinel → content. Sidebar navigation does `getElementById('fragment-<id>').scrollIntoView({ block: "start" })`, which aligns the (zero-height) anchor div to the viewport top — leaving the fragment's own `###` title scrolled just out of view above the fold.

This only bites when titles are shown: optional in preview (default off), but **always** in import preview, where every piece has a visible `### <n>. <key>` heading. Clicking "1. intro" in the import sidebar scrolls to the body with "1. intro" hidden just above. Minor disorientation, not breakage. If undesired, emit the sentinel before the `title` block for body-bearing units.

**Fixed 2026-05-31** — `assembleMarkdown` now emits each body's anchor sentinel at the **start of its fragment unit**: before the `### title` when a title is shown, and before the body when titles are off (or there is no title block). Navigation now lands on the heading. Implementation: the `title` branch peeks at the next block (always the body, per both adapters) and emits the anchor before the heading; the `body` branch emits its own anchor only when it leads the unit. Guarded by exporter unit tests (anchor-before-title and anchor-before-body exact-output cases, plus per-piece ordering in `assemblePieces`) and an integration assertion in `import-preview.test.ts`. The exporter unit suite was also added to `test:backend` so it now runs under `verify`.

---

## Non-issues

- **Interlinear Annotation control chars (U+FFF9–FFFB) as the sentinel** — valid UTF-8 format characters, not noncharacters; they survive JSON transport and markdown-it intact, effectively never occur in prose, and the assembler strips stray occurrences from body content (`stripSentinelChars`) so content cannot forge an anchor. Collision-safety is tested (`assemble.test.ts:290`).
- **`blank-line` separator emits ` ` as its own paragraph** — a plain blank line collapses in markdown; the nbsp paragraph is the intended way to force a visible gap. Documented at `assemble-markdown.ts:46-48`.
- **Body content not stripped of sentinel chars when `includeAnchors` is false** — deliberate: file export carries no anchors, so skipping the strip preserves byte-for-byte fidelity. Documented at `assemble-markdown.ts:62-64`.
- **`page-break`/`custom` separators modeled but unreachable from preview** — the assembler type is the export superset by design; the preview query schema (`schemas/preview.ts:47`) restricts the wire to `none | blank-line | horizontal-rule`.
- **`assemblePieces` returns a single section with `uuid: ""`/`name: ""`** — import is intentionally one unnamed section; the page reads pieces via `flatMap` and keys on the piece-index uuid, never on the section uuid.
- **Markdown-it block rule registered per editor instance** — each `ReadonlyProse` mount builds its own MarkdownIt via a fresh extension array (`buildSharedProseExtensions` is a factory), so there is no cross-instance double-registration.
- **`ReadonlyProse` runs `setContent` in an effect on top of `useEditor({ content })`** — the initial set is redundant but harmless; the effect is what re-renders on refetch (toggle change / new preview).

---

## Verification (2026-05-31, bun 1.3.14)

Ran the steps from the project guidance individually, then the whole suite.

| Step | Result |
| --- | --- |
| `bun run typecheck` | **Pass** (clean) |
| `bun run verify:openapi` | **Pass** (snapshot in sync with routes) |
| `bun test packages/exporter` | **Pass** — 19/19 (assembler core, sentinel collision-safety) |
| `bun run --cwd packages/frontend test` | **Pass** — 431/431 (renderer, anchor node, preview page) |
| `packages/api` preview + import-preview tests, run *in isolation* | **Pass** — preview 5/5, import-preview 11/11 |
| `bun run verify` / full suite in one process | **Now passes** — 749 backend + 431 frontend, 0 fail, deterministic. Originally flaky; root-caused and fixed (see below). |

Both static findings (#1 sentinel drift guard, #2 anchor-below-title) have since been **fixed** — see the "Fixed 2026-05-31" notes under each. The exporter↔frontend sentinel seam is now exercised by a frontend test that imports the exporter's canonical builder, and the anchor now precedes the title (guarded by exporter unit tests plus an integration assertion in `verify`).

### Test-isolation bug (not a code defect, not container-specific) — FIXED 2026-05-31

`bun run verify` was failing, but **only** the full-process run, and **only** through test cross-contamination — not through any code this branch touched. It reproduced on the developer's full Linux system too, so it was a real test-harness bug, not a container artifact. **Now fixed** — see "Fix shipped" below.

**Root cause, confirmed by experiment (not just inferred):**

- `createTestApp`'s `cleanup()` (`packages/api/src/__tests__/helpers/create-test-app.ts:22`) only does `rmSync(temporaryDirectory)`. It never stops the watcher that `resolveProject` middleware lazily starts on the test's vault.
- When `rmSync` deletes the watched files, chokidar fires `unlink` events; `unlinkKeyedEntity` (`packages/storage/src/watcher/sync/keyed-entity.ts:142`) schedules a 500 ms rename-buffer `setTimeout`; ~500 ms later that timer runs `vaultDatabase.transaction(...)` against a vault directory that no longer exists. On Linux the open `bun:sqlite` inode survives the delete, but SQLite can't create its journal/WAL sidecar in the gone directory → it reports the handle as read-only (`SQLiteError: attempt to write a readonly database`).
- The unhandled error surfaces while a *later* test file is running, so bun blames whatever test is executing at that instant. That is why the failures land on unrelated routes (`aspects`, `notes`, `sequences`, `suggestion`, `import`) this branch never touched, and why every affected file **passes when run alone** (verified: preview 5/5, import-preview 11/11, aspects 8/8, sequences 42/42).
- **Non-deterministic**: consecutive full runs gave 59 fail/48 err then 62 fail/71 err — flaky counts confirm timing, not logic. The existing `removeProject` path already documents this exact hazard (`storage-service.ts:488`: "a stale watcher on a removed project would hold file handles open and continue firing events against a deleted DB"); the test harness simply bypassed it.

**OS difference (why it was green on macOS, red on Linux):** chokidar uses the native backend per OS. Linux → inotify delivers per-file `unlink` events immediately and individually, reliably scheduling the 500 ms timers, and a write into the deleted directory fails as `SQLITE_READONLY` (SQLite can't create its journal sidecar). macOS → FSEvents coalesces a recursive subtree delete into a latent, batched event on the parent and rarely emits the per-file `unlink`, so the timers are usually never scheduled. A green macOS run was a **false negative** — the watcher leak existed on every platform; only its symptom was Linux-specific (and CI, being Linux, would have hit it).

**Fix shipped (2026-05-31):**
- `createStorageService` now exposes `shutdown()` — stops every cached watcher (`watcher.stop()` `drainAll()`s the rename buffers and `await`s `chokidar.close()`) and clears the cache (`storage-service.ts`).
- `createTestApp.cleanup()` is async and calls `storageService.shutdown()` before `rmSync` (`create-test-app.ts`); every api test teardown hook now `await`s cleanup.
- A `keyed-entity.ts` comment documents why watcher lifetime is load-bearing and the inotify-vs-FSEvents reason the symptom is Linux-only.

Result: full `bun run verify` → **749 backend + 431 frontend pass, 0 fail, deterministic across repeated runs**.

Net: the branch's own code (exporter assembler, preview/import-preview routes, shared renderer, anchor node) was already green; this fix removes the pre-existing test-teardown leak so `bun run verify` is now reliably green on Linux and macOS alike.

Side note: plan Phase 6 checks off `[x] bun run verify`, but per the developer the implementation environment had no bun, so that box could not actually have been satisfied. The renderer/route code does pass; the full-suite isolation flake is what blocks a clean `verify`.
