# Command failure observability: correlation IDs, error entries in the action log, and backend failure capture

Three coupled decisions that together make every user-initiated action — successful or not — traceable across the full stack.

## 1. Correlation IDs required on all action log entries

Every action log entry carries a required `correlationId: string` (UUID). For API-backed actions the backend middleware generates it per request and echoes it in the `X-Correlation-Id` response header; for frontend-only command failures the frontend generates its own. The correlation ID also appears in every backend structured log line for that request, so any action log entry can be cross-referenced with the raw API logs for diagnosis.

**Why required (not optional):** optional fields accumulate noise and erode the invariant. This is a greenfield project with no live users; existing action log files on disk can be discarded and regenerated.

**Alternative considered:** client-generated IDs threaded from `CommandsProvider` through every `customFetch` call. Rejected — threading a UUID through every scope context function and API call is boilerplate with no benefit over server-generation. Module-level global state was also rejected as an antipattern.

## 2. `command:error` entries in the action log

The action log now records both user-initiated state changes (as before) and command failures — unexpected terminations of user-initiated commands that prevented the intended state change. The action log definition expands from "what the user did" to "what happened."

Command failure entries (`type: "command:error"`, `actor: "system"`) carry: `commandId` (canonical domain label, e.g. `"fragment:update"`), `correlationId`, `technicalMessage`, and an optional `friendlyMessage`. The `target` field is optional on these entries only; all other entry types continue to require it.

**Why `friendlyMessage` is optional:** friendly messages are a frontend presentation concern, declared per command in `onFailure`. The backend, which writes failure entries for its own commands (decision 3), has no source for them. Backend-written entries therefore carry only `commandId` + `technicalMessage`; the History page falls back to `technicalMessage` when `friendlyMessage` is absent. Only frontend-written entries set `friendlyMessage`.

**`commandId` — the most specific operation that actually failed:** a failure that reached the backend is logged by the backend with the backend command label (mutation-level, consistent with how successes are logged — `executeCommand` already writes one success entry per backend command). The backend supplies that label at the `executeCommand` call site (a parameter, **not** a field on the `Command` interface — avoids editing every command file). A failure that never reached a backend command (network/pre-flight, or a pure-frontend command) has no mutation to name, so the frontend writes the frontend command id (intent-level).

We deliberately do **not** force a single shared label across the two paths. A frontend command can fan out to several backend commands (e.g. `editor:save` → `fragment:update` + `margin:updated`), so the frontend cannot honestly map its id onto one backend label, and successes are already recorded at mutation granularity — matching that for failures keeps the log internally consistent. Cross-path and cross-row correlation is by **`correlationId`** (plus timestamp), not by `commandId` equality. A shared `area:verb` naming convention across frontend ids and backend labels keeps the two families recognizable where they do differ.

**Why in the action log (not a separate error log):** temporal context is the point — the user sees a failure inline between the preceding and following actions, with full timestamp ordering. A separate endpoint/table would split the observability picture.

**Scope — command-system dispatches only:** this covers commands dispatched through `CommandsProvider.run`. Mutations that bypass the command system (dialog submits, drag-and-drop, blur/keyboard inline saves — exempt per `packages/frontend/CLAUDE.md`) own their error handling and emit no `command:error` entry.

**Global command failures are excluded:** `GlobalCommand` failures (project lifecycle operations) have no project context and therefore no project-scoped action log to write to. They surface via toast and backend structured logs only.

## 3. Backend `executeCommand` catches and logs failures

`executeCommand` (in `packages/api/src/commands/types.ts`) now wraps `command.execute()` in a try/catch. On failure it appends a `command:error` entry to the action log and **re-throws the original error unchanged**. The `correlationId` reaches the frontend via the `X-Correlation-Id` response header, stamped by `app.onError` for every error response — not via the error body.

**Why the header, not the body:** domain errors flow through `throwStorageError`, which builds its own `HTTPException` response; `app.onError` returns that response verbatim, bypassing any body-level field injection (and dropping headers set earlier on `ctx`). Stamping the header in `onError` is the single chokepoint that covers every error path uniformly. Reading from the body would silently miss the most common failure path and cause duplicate logging.

Frontend deduplication rule: if the caught error is an `ApiRequestError` carrying a `correlationId`, the backend logged it — the frontend toasts only. If there is no `correlationId` (network failure before the backend responded, or a frontend-only command with no API call), the frontend generates a fresh UUID and posts its own `command:error` entry.

**Known limitation:** when the backend is unreachable, the frontend's fallback POST to the action-log errors endpoint also fails, so a network-down failure produces a toast but no log entry. Inherent — the log lives behind the same API — and accepted.

**Alternative considered:** a separate `POST /projects/:projectId/action-log/errors` endpoint only, with the frontend always posting. Rejected — the backend is in a better position to log failures for its own commands (it has the full error context, the domain label, and the correlation ID it generated); having the frontend re-post what the backend already knows introduces a round-trip and a deduplication problem.

## 4. Frontend failure presentation: `onFailure` and the `onCommandError` filter

A command declares `onFailure` (a friendly message, or a function deriving message + detail from the error) to opt into the default handling in `CommandsProvider.run`: resolve the message, write a `command:error` entry if the backend didn't (the dedup rule in decision 3), and toast. A scope may instead claim a failure for **in-place** display by passing an `onCommandError` filter to `useCommandScope`; returning `true` suppresses the default path entirely — no toast, and no fallback POST.

**Why suppression also skips the POST (and why that loses almost nothing):** the suppressed POST only ever fires for failures with **no** `correlationId` — i.e. failures that never reached the backend (decision 3's dedup rule). Every failure that _did_ reach the backend is already logged server-side by `executeCommand`, independently of anything the frontend does, and its `correlationId` is present, so the frontend would skip the POST regardless of the filter. Therefore `onCommandError` returning `true`:

- for a **backend-reached** failure — suppresses only the toast; the log entry already exists.
- for a **frontend-only** failure — suppresses the toast _and_ the entry. That slice is either network-down (un-loggable anyway — the known limitation in decision 3) or a pre-flight/pure-frontend throw, which for an in-place-handled command is typically transient, user-correctable state (e.g. "fix validation errors before continuing") that does not belong in the user-facing History page.

So coupling toast-suppression to log-suppression is acceptable today: the action log stays a complete record of failures that actually hit the backend, and the only thing the filter keeps out of it is frontend-local presentation noise.

**Alternative considered:** decouple the two — let `onCommandError` suppress the toast while the fallback POST always fires (or a richer return like `{ toast?: boolean; log?: boolean }` letting the component choose each axis). Rejected for now (YAGNI): the only in-place handlers today are backend mutations (`config:rebuild-index`/`reset-database`, `suggestion:next`, `editor:save`), whose real failures are already logged server-side. Revisit if a **pure-frontend** command with in-place handling that genuinely warrants a log entry appears — that is the case the current coupling would silently drop.
