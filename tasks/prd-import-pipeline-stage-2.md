# PRD: Import Pipeline — Stage 2 (Preview & Review)

## Introduction

Add a preview-and-review step to the existing import flow. After picking a file, the user lands on a new full-page preview that shows the converted document split into pieces, the count and derived keys of the fragments that will be created, and live updates as the user adjusts the heading level (markdown/docx) or delimiter (plaintext). Pressing **Import** commits the fragments via the existing Stage 1 import endpoint; pressing **Cancel** returns to the fragment list without writing anything.

Stage 1 (`tasks/prd-import-pipeline-stage-1.md`) shipped fire-and-forget — there is currently no way to see the document contents or how it will be split before fragments hit disk. Stage 2 closes that gap with a read-only preview. Editing piece structure (merge, discard individual pieces, retitle, drag-to-adjust split points) is **still deferred** to a later stage.

**Source Specifications:**

- `specifications/import-pipeline.md`

> **Stage 2 scope note:** Preview is read-only. Users cannot alter the proposed piece structure — they choose the splitting parameters and either accept the result or cancel. Per-piece edit operations from the long-term spec (merge, discard, retitle, adjustable split points) remain deferred.

> **Terminology:** Carries over from Stage 1. Fragments are identified by `key`; the importer-internal `Piece` carries a transient `title`. `deriveKey` sanitizes the title into a valid key. "Preview" never writes to storage; "commit" / "import" goes through the existing Stage 1 `createImportCommand`.

---

## Goals

- Users can see the converted document content before any fragment is created
- Users can adjust the heading level (md/docx) or delimiter (txt) and watch the splits update live
- Users see the count of fragments to be created and the derived key for each
- Pressing **Import** commits the batch via the existing `/projects/:id/import` endpoint (Stage 1 unchanged)
- Pressing **Cancel** or navigating away discards the preview with zero side effects
- The existing one-step `ImportDialog` is replaced entirely by the new page — no parallel paths

---

## User Stories

### US-001: Preview command in packages/api

**Description:** As a developer, I need a dedicated `createPreviewImportCommand` so that conversion + splitting + key derivation can run without writing fragments, and the existing `createImportCommand` stays single-purpose.

**Acceptance Criteria:**

- [ ] New file `packages/api/src/commands/fragments/preview-import.ts` exports `createPreviewImportCommand(converter: DocumentConverter): Command<ImportInput, PreviewImportResult>`
- [ ] `ImportInput` is reused verbatim from `createImportCommand` (`packages/api/src/commands/fragments/import.ts`) — same discriminated union on `format`
- [ ] `PreviewImportResult` is `{ pieces: PreviewPiece[]; format: "markdown" | "docx" | "plaintext"; convertedMarkdown: string }` where `PreviewPiece = { pieceIndex: number; title?: string; derivedKey: string; content: string }`
- [ ] `pieceIndex` is 1-based and matches the index `createImportCommand` would assign to the same piece (defensive symmetry with Stage 1 error reporting)
- [ ] Flow: (1) fetch existing fragment summaries, seed case-insensitive `existingKeys` from non-discarded keys only — identical seeding to `createImportCommand`; (2) if `format === "docx"`, call `converter.toMarkdown(file)`; else decode the file as UTF-8 text — store the result as `convertedMarkdown`; (3) call `splitMarkdown` or `splitPlainText` on `convertedMarkdown`; (4) for each piece, derive a key via `deriveKey` against the (mutating) `existingKeys` set; (5) return the full result — no fragments created, no log entries emitted
- [ ] No log entries are emitted (`logEntries` returned as `[]`); preview is read-only
- [ ] The command does NOT instantiate `MammothConverter` itself — it accepts a `DocumentConverter` via injection, mirroring `createImportCommand`
- [ ] Empty pieces are filtered out by the splitter as today; they are NOT surfaced as preview errors (preview shows only what _would_ be created; the runtime `errors[]` path is exercised by the commit step)
- [ ] `createPreviewImportCommand`, `PreviewImportResult`, and `PreviewPiece` are exported from `packages/api/src/commands/index.ts`
- [ ] Unit tests cover: markdown happy path, plaintext happy path, docx happy path (stub `DocumentConverter`), key collision against an existing fragment (preview returns the suffixed key), zero-piece case (e.g. .md with no H1 + level 1 → empty `pieces` array, `convertedMarkdown` still returned)
- [ ] Tests pass
- [ ] Typecheck passes

### US-002: Preview HTTP route, OpenAPI registration, and Orval regen

**Description:** As a developer, I need `POST /projects/:projectId/import/preview` so that the frontend can call the preview command via the generated client.

**Acceptance Criteria:**

- [ ] New route `POST /projects/:projectId/import/preview` accepts the same `multipart/form-data` shape as `/import`: `file` (binary) + `options` (JSON string validated by the existing `ImportOptionsSchema` zod discriminated union)
- [ ] Implemented in a new file `packages/api/src/routes/import-preview.ts` (or co-located in `packages/api/src/routes/import.ts` if the diff is small) exporting an `importPreviewRouter` mounted at `/import/preview` on the project-scoped app
- [ ] Route handler does no direct storage calls — it parses the multipart body, validates options, instantiates/injects `MammothConverter`, and invokes `createPreviewImportCommand.execute(ctx, input)` via `executeCommand`
- [ ] Response schema `PreviewImportResultSchema` is added to `packages/api/src/schemas/import.ts` and shapes the 200 body to match `PreviewImportResult` from US-001
- [ ] Endpoint is registered in the OpenAPI spec with request (multipart) and response schemas
- [ ] 400 response for invalid options payload uses the existing `ErrorResponseSchema`
- [ ] Hono body parser is configured for `multipart/form-data` (already in place for `/import`; same wiring)
- [ ] `importPreviewRouter` is registered on `projectScopedApp` in `packages/api/src/app.ts`
- [ ] Orval client is regenerated; the generated `useImportFragmentsPreview` (or equivalent name based on `operationId`) hook + types are present in `packages/frontend/src/api/generated/`
- [ ] Route-level integration tests cover: markdown preview end-to-end, plaintext preview end-to-end, docx preview end-to-end, key collision against existing fragment (preview returns suffixed key), zero-piece case, invalid options payload (400), corrupt docx surfaces as a 500 with a usable error message
- [ ] Tests pass
- [ ] Typecheck passes

### US-003: Frontend preview page — routing, layout, and rendering

**Description:** As a user, I want a dedicated page that shows my document split into pieces so I can verify the result before committing.

**Acceptance Criteria:**

- [ ] New page `packages/frontend/src/pages/FragmentImportPage.tsx` is created
- [ ] New route `/projects/$projectId/fragments/import` is registered in `packages/frontend/src/router.ts`, nested under `projectShellLayoutRoute` (NOT under `fragmentListRoute` — the page is full-screen)
- [ ] The page reads the `File` to preview from `useRouterState` / `history.state` (or an equivalent client-only state mechanism) — the file is passed in by the navigating caller (US-004). On reload or direct navigation with no file in state, the page redirects to `/projects/$projectId/fragments`
- [ ] Format is derived from the file extension on mount (`.md` → markdown, `.docx` → docx, `.txt` → plaintext). Other extensions redirect to `/projects/$projectId/fragments` with no further action (defensive — the caller should have filtered)
- [ ] **Top bar (sticky):** filename · format-context label (`Format: markdown · split on H1`, `Format: plaintext · split on \`---\``, etc.) · options selectors — heading-level `Select`(H1–H6, default H1) for markdown/docx; delimiter`Input`(default`---`) for plaintext
- [ ] **Sidebar (left, `w-72 shrink-0 border-r border-border` to match `FragmentListPage`):** stats header `"{N} pieces will be created"` (or `"No pieces"` when N=0) + scrollable list of `"{N}. {derived_key}"` rows. Clicking a row scrolls the main area to the corresponding piece (anchor or `scrollIntoView`)
- [ ] **Main area:** one read-only tiptap instance configured with `StarterKit + tiptap-markdown (Markdown) + Typography` extensions, `editable: false`. Renders the `convertedMarkdown` returned by the preview endpoint with synthetic separators between pieces: each piece is preceded by an inline banner marker showing `Piece N · derived_key` (rendered as styled markdown content — e.g. a distinct heading-or-blockquote pattern that's visually unambiguous and not confusable with document content), followed by the piece content, followed by a `<hr>` (markdown `---`)
- [ ] **Sticky footer:** `[Cancel] [Import N fragments]` cluster, right-aligned. The Import button's label includes the live piece count and is disabled when N=0 or while a preview/commit request is in flight
- [ ] Options change → debounce 300ms → call the Orval preview hook. While the request is in flight, the existing rendered preview stays on screen; a subtle loading indicator (e.g. opacity dim on main area, or a small spinner in the top bar) signals refetch
- [ ] **Empty/zero-piece state:** when the preview returns `pieces: []`, the main area shows an explicit empty state with a hint — e.g. _"No pieces matched. Try a different heading level."_ (markdown/docx) or _"Delimiter not found in the file."_ (plaintext). Import button disabled. Sidebar shows `"No pieces"` header and an empty list
- [ ] **Preview error state:** if the preview request fails (4xx/5xx, network error), show an inline error message in the main area (or near the top bar) describing the failure. The file picker / options selectors remain editable so the user can change input and retry. Sidebar shows no pieces, Import disabled
- [ ] Cancel button navigates back to `/projects/$projectId/fragments`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Commit flow + ImportDialog deletion + button wiring

**Description:** As a user, when I press the "Import" button on the fragment list, I should land on the preview page; when I commit from preview, fragments should be created and I should land back on the fragment list with the new fragments visible.

**Acceptance Criteria:**

- [ ] `packages/frontend/src/components/fragments/import-dialog.tsx` is deleted
- [ ] The `<ImportDialog>` usage in `packages/frontend/src/pages/FragmentListPage.tsx` is replaced with an `<Button>` that opens a hidden `<input type="file" accept=".md,.txt,.docx">`; on file selection, the page navigates to `/projects/$projectId/fragments/import` and passes the `File` via router state (e.g. `navigate({ to: "...", state: { file } })`)
- [ ] On the preview page, pressing the **Import** button submits the same multipart payload to the existing `POST /projects/:projectId/import` endpoint via the existing `useImportFragments` hook (Stage 1 endpoint and command unchanged)
- [ ] **Full success (response.status === 200 && data.errors.length === 0):** invalidate `getListFragmentsQueryKey(projectId)`, navigate to `/projects/$projectId/fragments`
- [ ] **Partial failure (response.status === 200 && data.errors.length > 0):** invalidate `getListFragmentsQueryKey(projectId)` (successful pieces are committed), replace the page body with an error report card showing `"Created {created.length}, Failed {errors.length}"` + per-piece error list (`pieceIndex`, `pieceKey` if present, `error`). Buttons: **Return to fragment list** (navigates back) / **Discard** (also navigates back — semantically the same in Stage 2; the verb makes intent clearer). No retry affordance — user can re-trigger import for any failed pieces
- [ ] **Commit error (response.status !== 200, network error, etc.):** stay on the preview page with an inline error message; Import button re-enables; preview content remains intact
- [ ] While the commit request is in flight: Import button shows a spinner and is disabled; options selectors and Cancel remain enabled
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Spec update + SUGGESTIONS.md entry

**Description:** As a developer, I need the import-pipeline spec to reflect that preview-and-review shipped (read-only) and per-piece editing is still deferred; and I want a SUGGESTIONS.md note for the future backend-session optimization.

**Acceptance Criteria:**

- [ ] `specifications/import-pipeline.md` is updated:
  - `**Shipped**:` list at the top gains an entry: `2026-MM-DD — Import Pipeline Stage 2 - Read-only preview-and-review step: convert + split on backend without committing, render document with split markers, commit via existing /import endpoint. (plan: tasks/prd-import-pipeline-stage-2.md)`
  - A `**Stage 2 scope note**` is added (mirroring the existing Stage 1 scope note) clarifying that preview is read-only and that per-piece edit operations (merge, discard individual pieces, retitle, adjustable split points) remain deferred to a later stage
  - The `## Acceptance criteria` lines that previously said `(preview deferred — Stage 1 creates fragments immediately)` are updated to reflect that the preview now exists, with edit-pieces still noted as deferred
- [ ] `references/SUGGESTIONS.md` gains an entry: _"Import preview re-uploads and re-converts the file on every options change. For larger .docx files this is wasteful. Consider a backend session cache (keyed by content hash, short TTL e.g. 10 min) that stores the converted markdown so subsequent preview requests with different options skip mammoth+turndown. Triggers when preview latency becomes user-visible — currently sub-second for typical docs."_
- [ ] Typecheck passes (no code changes here, but the verification step keeps the story self-contained)

---

## Functional Requirements

- FR-1: A new endpoint `POST /projects/:projectId/import/preview` accepts the same multipart payload as `/import` and returns `{ pieces, format, convertedMarkdown }` without creating any fragments
- FR-2: Preview-time key derivation uses the same `deriveKey` and `existingKeys` seeding (non-discarded fragment keys) as `createImportCommand`, so the derived keys shown in preview equal what would be created on commit barring concurrent activity
- FR-3: Preview is best-effort — concurrent fragment creation between preview and commit may cause the committed keys to differ (suffix shift). The commit endpoint re-derives keys; this is acceptable. No backend session/locking is introduced
- FR-4: The frontend keeps the `File` in browser memory and re-uploads on every options change. No `File` is persisted anywhere
- FR-5: Options changes trigger a refetch only after a 300 ms debounce
- FR-6: Format is locked to file extension on the preview page — no UI to override
- FR-7: On preview-page reload (or direct navigation without an in-memory file), the page redirects to `/projects/$projectId/fragments`
- FR-8: Empty-piece state (preview returns zero pieces) disables the Import button and shows an empty-state hint
- FR-9: Preview errors (backend conversion failure, validation failure, network error) leave the options selectors editable for retry; they do not navigate away
- FR-10: Commit goes through the unchanged Stage 1 `/import` endpoint and `createImportCommand`
- FR-11: Full-success commit invalidates the fragment list query and navigates to the fragment list page
- FR-12: Partial-failure commit also invalidates the list query (successful pieces are committed), then shows an in-page error report with per-piece details and an exit-only set of buttons
- FR-13: The legacy `ImportDialog` component is removed; there is exactly one path to start an import — the page on `/projects/$projectId/fragments/import`
- FR-14: The main preview view is rendered by a single read-only tiptap instance configured with the same extensions as `prose-editor.tsx` (`StarterKit + tiptap-markdown + Typography`). Synthetic banners and `<hr>` separators between pieces are injected as part of the rendered markdown content; no per-piece tiptap instances
- FR-15: The sidebar piece list links scroll the main area to each piece's banner anchor
- FR-16: The Import button label shows the current piece count (e.g. `Import 12 fragments`) and updates live with the preview

---

## Non-Goals

- No editing of piece structure — merge, discard individual pieces, retitle, adjustable split points all remain deferred to a later stage
- No folder import (carried over from Stage 1)
- No source-file archival (carried over from Stage 1)
- No image/attachment extraction from `.docx` (carried over from Stage 1)
- No retry-failed-pieces affordance on the partial-failure error card — the user must re-trigger import for any retries
- No backend session/cache for converted markdown — the Stage 2 architecture is stateless. A SUGGESTIONS.md entry is added to revisit this when it becomes a real bottleneck
- No reservation/locking of preview-shown keys against concurrent writes — preview is best-effort
- No persistence of the picked `File` across page reloads (IndexedDB or otherwise)
- No multi-file selection
- No manual format override — extension determines format
- No toast system introduced (carried over from Stage 1; success/failure feedback uses inline UI)
- No deep linking into the preview page — the page requires a `File` handed to it via router state

---

## Design Considerations

- The new page should visually echo `FragmentListPage`: the sidebar is the same width and border treatment so that the user's mental model carries over (left rail = list of things, main area = focused content)
- The inline banner marker above each piece needs to be visually unambiguous against arbitrary document content. Use a distinct treatment — e.g. a small pill-styled heading or a `> **Piece N · derived_key**` blockquote with a contrasting background — so the user never mistakes a banner for real document text
- The `<hr>` between pieces is the primary "split happened here" cue; the banner is the "what fragment this becomes" cue. The two together do the job of communicating the split
- Loading state during options-change refetch should keep the prior preview visible (don't blank the page); a subtle dim + spinner is sufficient
- The Import button is the primary action; Cancel is secondary. Standard right-aligned cluster with primary on the right
- The empty-state hint should be format-aware: heading-level hints for md/docx, delimiter hints for plaintext

---

## Technical Considerations

- **Architecture is stateless.** The frontend holds the `File` in memory and re-uploads on every options change. Mammoth + turndown for a typical `.docx` is sub-second; markdown/plaintext parsing is microseconds. Re-uploading a 1 MB file over localhost is negligible. The cost only matters once user-facing files routinely exceed ~5 MB or run over a slow link — at which point the SUGGESTIONS.md entry (backend session cache keyed by content hash) becomes the right next step
- **Why a new command, not a flag on `createImportCommand`:** the existing command is single-purpose (commit + log + return UUIDs). A `dryRun` boolean would smear two intents and require returning a union of two result shapes. A second command costs ~50 lines, mirrors the existing structure, and keeps `commands/` honest
- **Why a new route, not `?dryRun=true`:** same reasoning at the HTTP layer; cleaner OpenAPI surface, cleaner Orval-generated client
- **`convertedMarkdown` in the response:** returning the full converted markdown means the frontend renders exactly what the backend split on, with no risk of client/server drift. The cost is response size — for a 1 MB markdown source the response is ~1 MB JSON, but for typical docs it's a few KB. The alternative (rendering pieces individually with their own tiptap instances) was rejected on perf grounds (N tiptap mounts) and on UX (loses the "single document" feel)
- **Tiptap configuration:** reuse the extension list from `packages/frontend/src/components/prose-editor.tsx` (`StarterKit + tiptap-markdown + Typography`). Configure with `editable: false`. The synthetic banner-and-hr markers are injected into the markdown string before it is fed to tiptap — keep the injection logic in a small pure helper for testability
- **Banner anchor for scroll-to-piece:** the sidebar `click → scroll` is most easily implemented by giving each banner a stable `id` (e.g. `import-piece-{N}`) and using `scrollIntoView`. tiptap-markdown will not preserve HTML `id` attributes from raw markdown; the cleanest path is to inject the banner as a tiptap node-view OR to post-process the rendered DOM in a `useEffect` to tag piece boundaries by index. The latter is simpler — pick that unless it proves fragile
- **Routing & file handoff:** TanStack Router supports passing arbitrary state via `navigate({ ..., state })`. The preview page reads it via `useRouterState({ select: s => s.location.state })`. On reload, `state` is empty → redirect. This is greenfield-acceptable; no IndexedDB required
- **Debounce:** standard `useEffect` + `setTimeout`. 300 ms balances responsiveness against request flooding when the delimiter is a typed input
- **Empty-state vs error-state distinction:** zero pieces is a valid preview result (`pieces: []`), not an error. The 200 response shape always includes a (possibly empty) `pieces` array. Errors are 4xx/5xx and surface separately
- **Spec divergence resolved:** Stage 1 noted the spec was out of sync with fire-and-forget. Stage 2 brings the implementation closer to the spec's preview behavior. The "edit pieces" portion of the spec remains deferred and must be annotated as such in US-005
- **No new dependencies:** tiptap, tiptap-markdown, StarterKit, Typography are already in `packages/frontend`. No new package adds required on the backend either
- **OpenAPI `operationId`:** name the preview operation distinctly from `importFragments` (e.g. `previewImportFragments`) so the generated Orval hook is `useImportFragmentsPreview` / `usePreviewImportFragments` — confirm naming when the schema is registered

---

## Success Metrics

- A `.md`/`.docx` file with N headings at or above the chosen level shows exactly N piece banners in the preview, with the same derived keys that `createImportCommand` would produce
- Changing the heading level from H1 to H2 (or H3, etc.) updates the preview within 300 ms of the last interaction (debounce + sub-second backend processing for typical files)
- A `.txt` file with K delimiter occurrences shows K+1 pieces (or fewer when empty splits are dropped)
- Pressing **Import** on a successful preview creates exactly the fragments shown in the sidebar, modulo concurrent-write key shifts
- Partial-failure commits surface per-piece errors with their derived keys for context, and the successful pieces are visible on the fragment list page after navigation
- Reloading the preview page (or direct-navigating to it) lands the user back on the fragment list with no error
- The codebase has exactly one entry point to start an import (the page on `/projects/$projectId/fragments/import`); `ImportDialog` no longer exists

---

## Open Questions

_All major decisions resolved during the grilling pass on 2026-05-16:_

- ~~Stateful vs stateless preview architecture~~ → Stateless, re-upload on every options change. SUGGESTIONS.md entry for future backend session cache (US-005)
- ~~Replace dialog vs add page alongside dialog~~ → Replace. `ImportDialog` deleted in US-004
- ~~New endpoint vs `dryRun` flag on `/import`~~ → New endpoint `/import/preview`, dedicated command
- ~~How to render rich preview~~ → One read-only tiptap instance with injected `<hr>` + banner markers
- ~~How are piece labels shown~~ → Both sidebar list (with scroll-to-piece) AND inline banner markers above each piece in the rendered doc
- ~~Where do stats and Import live~~ → Stats in the sidebar header; Import in a sticky footer next to Cancel
- ~~Behavior on options change~~ → 300 ms debounce, then refetch
- ~~Behavior on zero pieces~~ → Format-aware empty-state hint, Import disabled
- ~~Behavior on partial-failure commit~~ → Replace preview with an error report card; exit-only buttons (no retry affordance)
- ~~Behavior on reload~~ → Redirect to fragment list

_Remaining items, to be answered during implementation:_

- Exact visual treatment of the inline banner marker — pill / heading-with-background / blockquote — settle when wiring tiptap rendering in US-003
- Precise `operationId` for the preview route and the resulting Orval hook name — settle when the schema is registered in US-002
