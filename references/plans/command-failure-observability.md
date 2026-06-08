# Command failure observability: toast errors, correlation IDs, and action log error entries

**Date**: 2026-06-08
**Status**: Done
**Specs**: `specifications/command-palette.md`
**ADR**: `references/adr/0012-command-failure-observability.md`

---

## Goal

Every failure of a command-system dispatch is surfaced to the user via a toast (friendly message + technical detail disclosure), recorded as a `command:error` entry in the action log, and traceable across frontend and backend via a required correlation ID on every log entry.

**Scope note**: this covers failures of commands dispatched through `CommandsProvider.run`. Mutations that bypass the command system — dialog submits, drag-and-drop, blur/keyboard inline saves, all exempt per `packages/frontend/CLAUDE.md` — own their error handling and are out of scope.

---

## Tasks

### Phase 0 — Commit existing documentation

- [x] Commit the glossary updates (`specifications/_glossary.md`), ADR 0012 (`references/adr/0012-command-failure-observability.md`), and this plan file on `agent/toast-errors`

---

### Phase 1 — Shared schema: `correlationId` + `command:error`

Changes in `packages/shared/src/schemas/domain/action.ts`.

- [x] Add `correlationId: z.string()` to the `base` LogEntry schema (required on every entry; existing `.jsonl` files on disk can be discarded — greenfield, no backward-compat needed)
- [x] Add `"command:error"` to `ActionTypeSchema`
- [x] Add a `command:error` member to `LogEntrySchema` discriminated union:
  - `actor: z.literal("system")` (override base's `z.enum(["user", "system"])`)
  - `target: LogEntryTargetSchema.optional()` (override the required base field — only `command:error` makes target optional)
  - Payload: `z.object({ commandId: z.string(), friendlyMessage: z.string().optional(), technicalMessage: z.string() })` — `friendlyMessage` optional because backend-written entries (from `executeCommand`) have no source for it; only frontend-written entries set it
  - `undoable: z.literal(false)`
- [x] Run `bun run codegen` from repo root to regenerate frontend API types
- [x] Run `bun run verify` — fix any type errors caused by the now-required `correlationId` field on existing action log test fixtures
- [x] `git commit`

---

### Phase 2 — Backend: correlation ID middleware + `executeCommand` failure capture

- [x] Add `correlationId: string` to `AppVariables` in `packages/api/src/app.ts`
- [x] Add correlation ID middleware in `app.ts` (after the existing logger middleware):
  - Reads `X-Correlation-Id` request header if present, otherwise generates a `randomUUID()`
  - Sets it on `ctx` via `ctx.set("correlationId", ...)`
  - Includes it in the existing structured request log line
  - Echoes it on the **success** response (`ctx.header("X-Correlation-Id", ...)` after `next()`). Error responses are handled by `onError` below — a thrown `HTTPException` replaces `ctx.res`, dropping headers set here, so the header must be re-applied there.
- [x] Add `correlationId: string` to `CommandContext` in `packages/api/src/commands/types.ts` (commands may want it for their own logging; `executeCommand` reads it from `ctx`)
- [x] Add a `commandId: string` parameter to `executeCommand` — the canonical domain label (e.g. `"fragment:update"`), used only when writing a failure entry. **No `label` field on the `Command` interface** — keeping it a call-site argument avoids editing every command file and every command test. **Deviation from plan:** `commandId` is the **2nd** parameter (`executeCommand(command, commandId, ctx, input)`), not the 4th — a 2nd-position arg is a single-line, per-command substitution at each call site, whereas a trailing arg would mean editing the close of every multi-line `input` literal.
- [x] Update `executeCommand` to:
  - Attach `ctx.correlationId` to every success log entry
  - Wrap `command.execute()` in try/catch; on failure: append a `command:error` entry (best-effort, same catch pattern as today's append failures) carrying `commandId`, `ctx.correlationId`, `technicalMessage` from the error, **no** `friendlyMessage`, `target` omitted — then **re-throw the original error unchanged** (do not mutate it or its response)
- [x] Update all `executeCommand` call sites across route handlers to pass `ctx.get("correlationId")` into the `CommandContext` and the domain label as the new `commandId` argument
- [x] Update `app.ts` `onError` to stamp `X-Correlation-Id: ctx.get("correlationId")` on the outgoing response for **both** branches — this is the single chokepoint guaranteeing every error response carries the ID regardless of how the error was thrown:
  - `HTTPException`: clone `error.getResponse()` and add the header (the custom `res` built by `throwStorageError` does not carry headers set earlier on `ctx`)
  - 500 branch: add the header to the JSON response
- [x] Add `POST /projects/{projectId}/action-log/errors` route in `packages/api/src/routes/action-log.ts`:
  - Accepts body: `{ commandId: string; correlationId: string; friendlyMessage?: string; technicalMessage: string }`
  - Appends a `command:error` log entry (actor: system, target: undefined)
  - Returns `204`
  - **Note**: this endpoint is for frontend-only command failures that never reached the backend. No `executeCommand` wrapper — direct append.
- [x] Run `bun run codegen` from repo root
- [x] Run `bun run verify` — fix any type errors from `CommandContext` and `Command` interface changes
- [x] `git commit`

---

### Phase 3 — Frontend: `ApiRequestError` + `customFetch` correlation ID extraction

- [x] Add `correlationId?: string` to `ApiRequestError` in `packages/frontend/src/api/errors.ts`
- [x] Update `customFetch` in `packages/frontend/src/api/fetch.ts`:
  - On a non-OK response, read `correlationId` from the `X-Correlation-Id` response header (`response.headers.get(...)`), **not** the body — the body is unreliable across error paths (`throwStorageError` builds its own response, bypassing any body-level injection)
  - Pass it to the `ApiRequestError` constructor
- [x] `git commit`

---

### Phase 4 — Frontend: `onFailure` on command definitions + `CommandsProvider` error handling

**Types and definitions** (`packages/frontend/src/lib/commands/`):

- [x] Add `onFailure?: string | ((error: unknown) => { message: string; detail?: string })` to `CommonCommandDef` (types.ts) and `CommandInputBase` (define.ts) — the latter is extended by every `*Input*` variant and by `MergedCommandView`, so one addition covers inputs + view. Exported `OnFailure` / `CommandFailureInfo` types.
- [x] Add `onFailure` pass-through in `makeViewForGlobal` and `makeViewForScope` in `CommandsProvider.tsx` so it is accessible on `MergedCommandView`

**`CommandsProvider.run()`**:

- [x] For commands that have `onFailure` declared, dispatch with error capture. **Deviation:** call `def.run(arg)` synchronously inside try/catch (catches sync throws) and attach `.catch` only when it returns a promise — `Promise.resolve().then(...)` would defer the success path to a microtask and break synchronous-invocation timing (palette/hotkey/tests):
  - Resolve the friendly message and detail from `onFailure`
  - If the error is an `ApiRequestError` with a `correlationId` → backend already logged it; call `toast.error(message, { description: detail })` only
  - If the error has no `correlationId` → generate a fresh `crypto.randomUUID()`, then post a `command:error` entry to `POST /projects/:projectId/action-log/errors` (best-effort, fire-and-forget) with that `correlationId`, `commandId` = the **frontend command id**, `friendlyMessage` = resolved message, `technicalMessage` = the error's message; then toast
  - **`commandId` principle — the most specific operation that actually failed.** A failure that reached the backend is logged by the backend with the backend command label (mutation-level, consistent with how successes are logged). A failure that never reached a backend command (network/pre-flight, or a pure-frontend command) has no mutation to name, so the frontend writes the frontend command id (intent-level). Do **not** try to map the frontend id onto a backend label — a single frontend command can fan out to several backend commands (e.g. `editor:save` → `fragment:update` + `margin:updated`), so the frontend cannot honestly pick one. Cross-path correlation is by `correlationId`, not by `commandId` equality.
  - The project ID for the POST is read from the router at fire time (same pattern as `getActiveProjectId()` in `router-helpers.ts`)
  - If the project ID is unavailable (global command with no active project), skip the POST and only toast
- [x] Commands without `onFailure` that throw: `console.error` in dev, no toast (developer error — they must declare `onFailure` or handle internally)

**`useCommandScope` filter**:

- [x] Update `useCommandScope` to accept an optional third argument: `options?: { onCommandError?: (commandId: string, error: unknown) => boolean | void }`
- [x] Thread the filter through `publishScope` in `CommandsProvider` — store it alongside the scope's `ctxRef`
- [x] In `CommandsProvider.run()`, before invoking the default `onFailure` toast path, check if the scope has an `onCommandError` filter; if it returns `true`, suppress the toast (the component handles it)

- [x] `git commit`

---

### Phase 5 — Wire `onFailure` into all existing commands

Audit every command in `packages/frontend/src/lib/commands/` and add `onFailure` where the command can realistically fail. Commands that are pure local UI or pure navigation (no API calls, no async mutations) do not need `onFailure`.

**`commandId` for frontend-logged failures**: always the frontend command id (intent-level — see the principle in Phase 4). No per-command backend-label override; backend-reached failures are already logged by the backend at mutation-level.

**Commands that need `onFailure`** (can fail via API mutation or async operation):

- `editor:save` — `"Save failed."` — note: `suggestion:next` catches save errors in-place via `ctx.setSaveError`; the `editor:save` command itself should still declare `onFailure` for cases where save is triggered directly (not through suggestion mode)
- `editor.extract-to-fragment / note / reference / aspect` — `"Extraction failed."`
- `editor.append-to-fragment / note / reference / aspect` — `"Insert failed."`
- `editor.prepend-to-fragment / note / reference / aspect` — `"Insert failed."`
- `fragment:discard` — `"Failed to discard fragment."`
- `fragment:restore` — `"Failed to restore fragment."`
- `fragment-metadata:attach-aspect` — `"Failed to attach aspect."`
- `fragment-metadata:detach-aspect` — `"Failed to detach aspect."`
- `fragment-metadata:attach-reference` — `"Failed to attach reference."`
- `fragment-metadata:detach-reference` — `"Failed to detach reference."`
- `fragment-import:import` — `"Import failed."`
- `overview:designate-main` — `"Failed to designate main sequence."`
- `overview:add-section` — `"Failed to add section."`
- `overview:delete-section` — `"Failed to delete section."`
- `overview:group-selection` — `"Failed to group fragments."`
- `overview:split-before-selection / split-after-selection` — `"Failed to split section."`
- `overview:move-selection-to-section` — `"Failed to move fragments."`
- `overview:merge-section-up / merge-section-down` — `"Failed to merge sections."`
- `overview:create-sequence` — `"Failed to create sequence."`
- `overview:delete-sequence` — `"Failed to delete sequence."`
- `overview:toggle-sequence-active` — `"Failed to update sequence."`
- `overview:clone-sequence` — `"Failed to clone sequence."`
- `overview:insert-sequence` — `"Failed to insert sequence."`
- `config:rebuild-index` — `"Index rebuild failed."`
- `config:reset-database` — `"Database reset failed."`
- `project-management:save-settings` — `"Failed to save settings."`
- `margin:comment-block` — `"Failed to add comment."`
- `suggestion:next` — `"Failed to load next fragment."` — the existing in-place save error via `ctx.setSaveError` is caught internally and does not propagate; `onFailure` covers the `loadNext` failure path which is currently unhandled
- `project:switch-project` (global) — the `arg.items` async loader already closes the palette on failure (existing `console.error`); replace that with `toast.error` directly (the items loader failure is not a command failure — it's an arg-loading failure; fix the palette's `handleSelectCommand` catch block to call `toast.error` rather than `console.error`)

**Commands that do NOT need `onFailure`** (pure navigation or local UI state, cannot throw):

- All `navigation:go-to-*` — router navigation only
- `command-palette:open/close`, `quick-switcher:open/close` — pure UI state
- `editor:increase-font-size / decrease-font-size / increase-margin / decrease-margin` — local settings, synchronous
- `overview:set-detail-level / toggle-arc-overlay / toggle-arc-expanded / toggle-vertical-arc-strip` — local UI
- `fragment:place-in-sequence` — opens a modal, no direct mutation
- `create:fragment / note / reference / aspect` — open creation dialogs; dialog owns its own error handling

- [x] `git commit`

---

### Phase 6 — History page: command failure row rendering

Changes in `packages/frontend/src/pages/ProjectHistoryPage/`.

- [x] Update all existing action row renderers to guard against `entry.target` being `undefined` (done in Phase 1: introduced `ActionLogEntry` = `LogEntry` minus `command:error`; renderers/`EntryLink`/`entityExists` take the narrower type, `ActionLogList` narrows `command:error` at the boundary)
- [x] Add a `CommandFailureRow` component that renders a `command:error` entry (added in Phase 1, wired into `ActionLogList`):
  - Distinct styling: destructive/warning left border or icon, not an action chip
  - Primary text: `entry.payload.friendlyMessage ?? entry.payload.technicalMessage` (backend-written entries omit `friendlyMessage`)
  - Secondary: timestamp
  - "Details" disclosure (collapsible): `commandId`, `correlationId`, `technicalMessage`
  - No undo affordance
- [x] Add a filter toggle to the history page header: "Show errors" (default: on); hides/shows `command:error` rows without affecting other entries
- [x] `git commit`

---

### Phase 7 — Documentation + spec updates

- [x] Update `packages/frontend/CLAUDE.md` — add a **Command failure handling** section documenting:
  - `onFailure` field: when to add it, string vs. function form
  - Convention: commands with in-place error UI catch internally and do not declare `onFailure`; commands without dedicated in-place UI must declare `onFailure` if they can throw
  - `onCommandError` filter on `useCommandScope`: when to use it (suppress default toast in favour of in-place display)
- [x] Update `specifications/command-palette.md` — add to `Shipped` frontmatter: command failure observability (toast + action log `command:error` entries + correlation IDs)
- [x] Run `bun run format && bun run verify` — fix any remaining issues
- [x] `git commit`

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Key test surfaces:

- `CommandsProvider`: commands with `onFailure` that throw → toast called, error POST fired (mock the POST). Commands without `onFailure` that throw → no toast, `console.error` only.
- `CommandsProvider`: `onCommandError` filter returning `true` suppresses the toast.
- `customFetch`: non-OK response with `X-Correlation-Id` header → `ApiRequestError.correlationId` is set. Include a case where the error is an `HTTPException` from `throwStorageError` to prove the header survives that path (the case the body approach would miss).
- `executeCommand` (backend): failure appends a `command:error` log entry and re-throws.
- History page: `command:error` entries render as `CommandFailureRow`; filter toggle hides/shows them.

---

## Notes

**Known limitation — network-down failures**: when the backend is unreachable, the fallback `POST /projects/:projectId/action-log/errors` also fails, so no `command:error` entry is written for that failure. The toast still fires. This is inherent (the log lives behind the same API) and acceptable; documented here so it is not mistaken for a bug.

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, proceed with development on the current branch (`agent/toast-errors`) and proceed phase by phase.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`. Also update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented.
