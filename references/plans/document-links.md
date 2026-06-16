# Document Links (Obsidian-style `[[type/key]]`)

**Date**: 16-06-2026
**Status**: Done
**Specs**: `specifications/document-links.md`, `specifications/storage-sync.md`, `specifications/fragment-model.md`, `specifications/aspect-arc-model.md`
**Closed**: 16-06-2026

---

## Goal

> A user can write `[[type/key]]` / `[[type/key|alias]]` links in any fragment, note, or reference body; the links are autocompleted on `[[`, click-navigable, and broken-styled in rich, raw, and vim modes; they round-trip byte-for-byte through Obsidian; a persisted link table drives a Backlinks panel on every entity page; inline reference/aspect links auto-attach to fragment metadata on save; and renaming any linkable entity rewrites every referring body. Done = all acceptance criteria in `specifications/document-links.md` pass with tests.

---

## Background / investigation findings

Established by reading the code (no existing document-link machinery exists — fully greenfield within the project):

- **Link parsing has a precedent**: the comment-marker machinery in `packages/shared/src/utils/comment-marker.ts` is the model for a shared, browser-safe parse/strip/rewrite module used by storage + both editors. Mirror that structure for links.
- **DB index pattern**: `packages/storage/src/db/vault/schema.ts` + `indexer/upserts.ts`. New tables get a Drizzle table + a dated SQL migration + a `_journal.json` entry. Upserts run synchronously inside `vaultDatabase.transaction`. `rebuild()` in `indexer/indexer.ts` is authoritative; the watcher (`watcher/sync/*.ts`) and the storage-service write paths keep the index current incrementally.
- **Fragment metadata is frontmatter-derived**: `fragment.references` (frontmatter array) and `fragment.aspects` (inline `key:: weight` fields) are parsed in `vault/markdown/mappers/{fragment,aspect}.ts`. Auto-sync from body links into these lists means merging into the entity before write, so the vault file stays authoritative (constraint: Maskor may edit fragment *frontmatter/inline metadata*, never prose — already permitted).
- **Rename cascade lives in `storage-service.ts`** (`cascadeFragments`, `cascadeAspects`, `cascade{Note,Reference,Aspect}KeyRename`). Currently cascades only metadata (reference/aspect/note lists); it does **not** rewrite bodies, and **fragment rename does not cascade at all**. Both are net-new here. The watcher path triggers cascades via `onNoteRename`/`onReferenceRename`/`onAspectRename` hooks; the API path triggers them inside the keyed-entity update + fragment write.
- **Editor stack**: `prose-editor.tsx` drives TipTap (rich) and CodeMirror 6 (raw/vim). The TipTap `commentMarker` node (`comment-marker-extension.ts`) shows the markdown-it parse-rule + serializer round-trip pattern; `anchor-cm.ts` shows the CM6 `StateField` + decoration pattern. Both are the templates for the link extensions.
- **Navigation**: TanStack routes exist for `notes/$noteId`, `references/$referenceId`, `aspects/$aspectId`, `fragments/$fragmentId` (`router.ts`). Click-to-navigate resolves a `type/key` → uuid (link table or a key→uuid lookup) then navigates.
- **Command system**: every UI action goes through the command system (`lib/commands/`). "Insert link" is a command; autocomplete is editor-internal (exempt, like inline edits).
- **OpenAPI**: any route change needs `bun run codegen` (regenerates snapshot + orval client). `bun run verify` enforces it.
- **Spec drift**: `document-links.md` is already largely re-pointed to margins for comments, but is `Status: Draft` with no `Shipped` section and a stale "References — unchanged" note that should be confirmed. It plus `storage-sync.md` need updating; an ADR records the link-table decision.

---

## Tasks

### Phase 0 — Branch & plan

- [x] Already on branch `agent/actual-document-links` (worktree). Commit this plan file.

### Phase 1 — Shared link grammar (`@maskor/shared`)

Foundation used by storage and both editors. Browser-safe (no Node built-ins), mirroring `comment-marker.ts`.

- [x] Add `packages/shared/src/utils/document-link.ts`:
  - `LINKABLE_ENTITY_TYPES` (`fragments`, `notes`, `references`, `aspects`) — single source of truth for valid link target types.
  - A regex + `parseDocumentLinks(body)` returning ordered `{ targetType, targetKey, alias|null, raw, index }`. Accept full-path `[[type/key]]`, alias `[[type/key|display]]`, and bare `[[key]]`/`.md`-suffixed for external compatibility (bare links carry `targetType: null` for later shortest-path resolution). Skip unknown types (`[[gibberish/foo]]` → not a link).
  - `buildDocumentLink(type, key, alias?)` — canonical full-path emit.
  - `rewriteDocumentLinks(body, type, oldKey, newKey)` — rename cascade helper; rewrites `[[type/oldKey]]` and `[[type/oldKey|alias]]` to the new key, preserving aliases; leaves other links untouched. Canonical (full-path) form only — Maskor-authored links are full-path.
  - A domain schema/type for a parsed link + a `DocumentLink` (link-table row shape) in `packages/shared/src/schemas/domain/document-link.ts`, exported from the domain barrel.
- [x] Unit tests for parse (all syntaxes, unknown-type rejection, alias, bare), build, and rewrite (alias preservation, no-collateral).
- [x] `git commit` — shared link grammar.

### Phase 2 — Link table (DB index)

- [x] Add `linksTable` to `packages/storage/src/db/vault/schema.ts`: source (`sourceUuid`, `sourceType`), target (`targetType`, `targetKey`, nullable `targetUuid`), `alias`, `ordinal`, optional `snippet` (backlink context). Indexes on `(targetType, targetKey)` (backlinks) and `(sourceType, sourceUuid)` (replace/delete). No cross-type FK (4 source/target types) — rows are managed explicitly.
- [x] Dated SQL migration + `_journal.json` entry (mirror `20260604_add_project_state`).
- [x] Add link sync to `indexer/upserts.ts`: `syncLinks(tx, sourceType, sourceUuid, body)` — parse body, resolve each target `type+key` → uuid via the entity tables, replace all rows for that source. Resolution helper queries fragments/notes/references/aspects by key. Bare-name resolution uses Obsidian shortest-path rule (same-type-folder preference is moot — folders are flat — so a bare name resolves to whichever single type owns that key; ambiguous bare names stay unresolved).
- [x] Call `syncLinks` from `upsertFragment`, `upsertNote`, `upsertReference` (the three link sources). Delete a source's links when the source is unlinked (extend the `delete*ByFilePath` helpers / unlink paths).
- [x] Re-resolution on entity appearance/disappearance: when any entity is upserted, bind previously-unresolved links matching its `type+key` to its uuid; when deleted, null out `targetUuid` for links pointing to it (rows stay — broken links persist per spec). `rebuild()` already re-derives everything from scratch (parse-order: aspects/notes/references/fragments, then a link-resolution pass once all entity keys are known).
- [x] Indexer query helpers: `links.findBacklinks(targetType, targetKey)` and `links.findOutgoing(sourceType, sourceUuid)`.
- [x] Watcher coverage: fragment/keyed-entity sync calls `syncLinks`; deletion clears the source's rows and re-resolves dependents. `margin:*` is untouched (comments are not links — ADR 0007).
- [x] Tests: rebuild populates the table; unresolved row persists with `targetUuid = null`; creating the target binds the row; deleting the target un-binds it; unknown-type link absent; round-trip preserves rows. (storage `indexer.test.ts` / new `links.test.ts`.)
- [x] `git commit` — link table + sync.

### Phase 3 — Auto-sync inline links → fragment metadata

Per `document-links.md` "Auto-sync" + `fragment-model.md`/`aspect-arc-model.md`. On **save only** (API write + watcher cycle).

- [x] Shared derivation: from a fragment body, compute the reference keys and aspect keys linked inline. Reuse Phase 1 parsing.
- [x] Merge rule (applied to the `Fragment` before write): add inline-linked references to `fragment.references` (dedupe); add inline-linked aspects at weight `0` if absent (preserve existing weights); remove an aspect iff weight `0` **and** no remaining inline link. References are never auto-removed. Notes contribute nothing to metadata (ADR 0007).
- [x] Wire into the API fragment write (`storage-service.ts` `fragments.write`) and the watcher fragment sync (`watcher/sync/fragment.ts`) so an external Obsidian edit auto-attaches on the next cycle. The merge produces a frontmatter/inline-field change → a write-back (hash-guarded second event), consistent with adoption write-back.
- [x] Guard against loops: the write-back must be idempotent (merging twice yields the same file) so the follow-up watcher event hash-guards to a no-op.
- [x] Tests: inline `[[references/x]]` adds `x` on save; `[[aspects/y]]` adds `y` at weight 0; removing the last `[[aspects/y]]` drops it iff weight 0, keeps it if weight > 0; `[[notes/z]]` adds nothing to metadata; multiple inline refs count as one; external-edit path via watcher.
- [x] `git commit` — inline-link metadata auto-sync.

### Phase 4 — Rename cascade (bodies), delete behaviour, backlinks API

- [x] Extend rename cascade to rewrite inline links in **all** body sources (fragments, notes, references), not just metadata lists. Add `cascadeNotes`/`cascadeReferences` body-rewrite helpers alongside `cascadeFragments`/`cascadeAspects`; each uses `rewriteDocumentLinks`. Drive them from the existing `cascade{Note,Reference,Aspect}KeyRename` and a **new** fragment rename cascade.
- [x] Fragment rename cascade (net-new): when a fragment's key changes (API write + watcher rename), rewrite `[[fragments/old]]` in every referring body and update the link table. Find referrers via the link table (`findBacklinks("fragments", oldKey)`).
- [x] Backlinks API: a route to read an entity's backlinks (`GET …/links/backlinks?targetType=&targetKey=` or per-entity `…/backlinks`). Returns source key/type/uuid + snippet. Run `bun run codegen`.
- [x] Delete behaviour: deleting a linkable entity strips matching metadata attachments from fragments (reference/aspect delete cascade already strips aspects; add reference + ensure notes need nothing) and leaves inline links intact → they become unresolved (`targetUuid` null). Bodies are never auto-rewritten.
- [x] Tests: renaming a note rewrites `[[notes/old]]`/`[[notes/old|alias]]` in fragment, note, and reference bodies + updates the table + preserves aliases; fragment rename cascades; delete leaves broken links and clears the table binding; backlinks endpoint returns referrers.
- [x] `git commit` — cascade, delete, backlinks API.

### Phase 5 — Rich (TipTap) link rendering + markdown round-trip

- [x] Add a TipTap inline node/mark for document links (model after `comment-marker-extension.ts`): markdown-it parse rule tokenizes `[[type/key]]`/`[[type/key|alias]]`/bare into the node; serializer re-emits the canonical/original form byte-stable. Render resolved links entity-tag-styled, unresolved links broken-styled, alias as label.
- [x] A shared resolver (key+type → uuid + route) fed from the project's entity lists, so the rendered link knows resolved vs. broken and where to navigate. Add to `shared-prose-extensions`/editor wiring without coupling the shared extension factory to React Query (pass a resolver callback in).
- [x] Click-to-navigate in rich mode → TanStack route for the target type.
- [x] Tests: markdown round-trip (parse→serialize byte-stable) for all syntaxes; resolved vs broken class; alias label.
- [x] `git commit` — rich link extension.

### Phase 6 — Raw/vim (CM6) link rendering + click-to-navigate

- [x] CM6 extension (model after `anchor-cm.ts` / `anchor-highlight-cm.ts`): a decoration that styles `[[…]]` tokens (resolved vs broken) and a click (and vim keyboard-equivalent) handler that navigates. The raw marker text stays in the buffer (unlike comment markers — links are user-visible content, Obsidian-compatible).
- [x] Share the resolver from Phase 5.
- [x] Tests: decoration ranges for links in a buffer; resolved/broken classing; click target resolution (unit-level on the helper).
- [x] `git commit` — CM6 link extension.

### Phase 7 — Autocomplete + command-palette insert

- [x] `[[` autocomplete listing all linkable entities project-wide, grouped/labelled by type; selecting inserts canonical `[[type/key]]`. Implement in both rich (TipTap suggestion util) and CM6 (`@codemirror/autocomplete`) so behaviour matches across modes.
- [x] Command-palette "Insert link" command (editor scope) — opens an entity picker (parameterized command per `frontend/CLAUDE.md` flat-items arg shape), inserts at the cursor, restores cursor after the inserted link.
- [x] Tests: autocomplete option list source + insertion format; command inserts canonical link and preserves cursor.
- [x] `git commit` — autocomplete + insert command.

### Phase 8 — Backlinks UI + metadata-form X-button rule

- [x] Backlinks panel component fed by the Phase 4 endpoint; surface on fragment, note, reference, and aspect pages. Lists referring bodies (key/type, navigable; snippet if available).
- [x] Fragment metadata form: disable the X-button for any reference/aspect chip that has ≥1 inline link in the body, with an explanatory hint (per spec; flagged conservative). Needs the fragment's outgoing links (from the link table or parsed body).
- [x] Tests: backlinks panel renders entries from the API; X-button disabled when an inline link exists, enabled otherwise.
- [x] `git commit` — backlinks UI + form rule.

### Phase 9 — Specs, ADR, cleanup

- [x] Update `specifications/document-links.md`: `Status: Draft → Stable`, add `Shipped` entries, confirm/repair any remaining stale comment-era wording, reconcile the bare-name resolution + backlink-snippet open questions with what shipped.
- [x] Update `specifications/storage-sync.md`: document the `links` table as a derived, watcher-maintained index (path-prefix table + DB-index behaviour); note auto-sync-of-inline-links to fragment metadata.
- [x] Touch `specifications/fragment-model.md` + `aspect-arc-model.md` Shipped/behaviour where inline-link auto-attach now lands metadata.
- [x] New ADR: link table is a persisted derived index; canonical full-path link form; auto-sync asymmetry (add-on-save, no auto-remove except aspect-weight-0).
- [x] Add any surprises encountered to `references/suggestions.md`.
- [x] `bun run format` then `bun run verify`; fix lint/test/codegen drift.
- [x] `git commit` — specs + ADR.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Per-phase tests are listed above. Backend: storage `__tests__`/co-located `.test.ts` (parse, link table, cascade, auto-sync) and API route tests (backlinks, rename cascade end-to-end). Shared: `document-link.test.ts`. Frontend: editor extension round-trip + resolution tests, autocomplete/insert, backlinks panel, metadata-form X-button. Run `bun run verify` (includes `verify:openapi`) before each commit that touches routes.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

The developer's task message gave standing authorization to implement after the plan is committed (one commit per plan step, work autonomously, review afterwards). Treat that as the "clearly stated" instruction: commit this plan, then proceed phase by phase on this branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit`, and describe what was added. When the plan is implemented (fully or partially), set the plan status and update the relevant spec frontmatter `Shipped` sections (feature-level, no granular detail).

Scope guard: comments/margins are **not** document links (ADR 0007) — do not touch the margin machinery. Embeds (`![[…]]`), heading/block anchors (`[[note#heading]]`), subfolders inside entity-type folders, and link-derived sequencing constraints are out of scope (see spec).
