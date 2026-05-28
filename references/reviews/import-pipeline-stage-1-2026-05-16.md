# Review: Import Pipeline — Stage 1

**Date**: 2026-05-16
**Scope**: `packages/importer/`, `packages/api/src/{routes,commands,schemas}/import*`, `packages/frontend/src/components/fragments/import-dialog.tsx`
**Plan**: `tasks/prd-import-pipeline-stage-1.md`
**Spec**: `specifications/import-pipeline.md`

---

## Overall

Splitter, key derivation, and converter abstractions match the PRD cleanly. Tests pass (58) and types are clean. Two issues need fixing before this can be considered done: (1) the import route bypasses `executeCommand`, so per-fragment `fragment:created` action-log entries are silently dropped — direct violation of US-004 AC; (2) the dialog's heading-level labels are inverted relative to the splitter contract, which will produce surprising results in normal use. A couple of smaller AC-vs-implementation contradictions are flagged below.

---

## Bugs

### 1. `fragment:created` action-log entries are never persisted on import

`packages/api/src/routes/import.ts:103` invokes `command.execute(commandContext, input)` directly and destructures only `{ result }`. `executeCommand` (`packages/api/src/commands/types.ts:23-45`) is the harness that writes `logEntries` to the action log — every other mutation route uses it (`fragments.ts:352, 385, 412, 436, 460`).

`createImportCommand` correctly aggregates each child `createFragmentCommand`'s `logEntries` (`commands/fragments/import.ts:87`), but the route throws them away:

```
createFragmentCommand → returns logEntries → importCommand collects them
                                          → route ignores logEntries → action log never written
```

Violates US-004 AC: _"Per-fragment `fragment:created` log entries are emitted as normal by `createFragmentCommand`; no separate batch entry is introduced."_

Fix: call through `executeCommand(command, commandContext, input)` and drop the manual try/catch — `throwStorageError` is unreachable in the happy path anyway since command errors are already captured into `errors[]`.

### 2. Heading-level dropdown labels are inverted

`packages/frontend/src/components/fragments/import-dialog.tsx:155-160` labels each option `"H<N> and above"`. By the splitter contract (FR-1, US-001), `headingLevel: N` splits at every level **≤ N**. So selecting "H2 and above" produces a split at H1 _and_ H2; selecting "H1 and above" splits at H1 only — the _narrowest_ setting, not the broadest.

The label reads as if the dropdown selects the _shallowest_ depth included; the splitter treats the value as the _deepest_ depth included. A user who wants to split at "every H1 and H2" will pick "H1 and above" and get only H1 splits.

Fix: relabel as e.g. `H1 only`, `H1 and H2`, `H1 through H3`, … (or pick whatever phrasing matches existing UI conventions).

---

## Design

### 3. Empty-piece reporting in `errors[]` is unreachable

US-004 AC: _"Empty pieces (no content after split-trim) are reported in errors[] with reason 'empty piece' and are not written."_

Both `splitMarkdown` (`packages/importer/src/index.ts:73-103`) and `splitPlainText` (`packages/importer/src/index.ts:124-131`) filter empty pieces before returning. The `if (!piece.content.trim())` branch at `commands/fragments/import.ts:74-77` is therefore dead code. The integration test even acknowledges this (`routes/import.test.ts:194-198`: _"splitter already filters them"_).

The PRD is internally inconsistent here: US-001 AC says _"Empty pieces … are not emitted by the splitter; the importCommand records them in errors[]"_ — those two clauses contradict, and we currently honor only the first.

Pick one direction:

- Splitters pass empty pieces through with a marker, importCommand discards + reports (matches US-004 wording, surfaces the signal to users).
- Or remove the empty-piece error path from `importCommand` and update both PRD AC entries to say empties are silently dropped.

### 4. `HeadingLevel` literal duplicated across packages

`commands/fragments/import.ts:13,19` re-declares `1|2|3|4|5|6` instead of importing `HeadingLevel` from `@maskor/importer`. PRD tech notes: _"Promote to `@maskor/shared` only if a second consumer appears."_ — one has (the API command). Either re-export the type from `@maskor/importer` and reuse, or promote.

---

## Minor

### 5. `Buffer.from(input)` in `MammothConverter`

`packages/importer/src/index.ts:114` — works under Bun/Node, but mammoth accepts `{ arrayBuffer: input.buffer }` natively, which avoids the implicit Node-globals dependency and the `Uint8Array → Buffer` copy.

### 6. Frontend surfaces only error counts, not per-piece errors

`import-dialog.tsx:181-189` shows "(N failed)" but the API returns `{ pieceIndex, pieceKey, error }[]`. Toast-summary meets the AC, but on partial failure the user has no way to see which pieces failed without inspecting the network response.

### 7. `prevTitle` tracking in `splitMarkdown` is subtle

`packages/importer/src/index.ts:84-99` — the title attached to a piece comes from the _previous_ iteration's heading, with pre-first-heading content keeping `undefined`. Correct, but the data flow is not obvious. A one-line comment would save the next reader a minute.

### 8. Unrelated `scripts/ralph` submodule fix bundled in

`scripts/ralph` was an orphan gitlink and is now converted to regular files (documented in `references/suggestions.md`). Unrelated to the import-pipeline scope; widens the branch diff and pulls infra cleanup into a feature commit.

---

## Non-issues

- **`z.any()` for the multipart `file` field** (`packages/api/src/schemas/import.ts:38`) — Zod can't model `File` through OpenAPI multipart in a way Orval will consume cleanly. The `instanceof File` check in the route handler is the validation gate.
- **Options shipped as a JSON-encoded string inside multipart** — limitation of `multipart/form-data` discriminated unions through Orval. The route parses + zod-validates it explicitly.
- **Monkey-patching `storageService.fragments.write` in tests** — brittle in principle but contained to the import-command tests; gives clean coverage of partial-failure and `KEY_CONFLICT` surfacing without spinning up real fault injection.
- **Discarded fragments excluded from the seed `existingKeys` set** — intentional per PRD tech notes; restoring a discarded fragment whose key has since been taken still fails at restore-time via the existing storage check.
- **Spec annotation rather than rewrite** — `specifications/import-pipeline.md` is marked Stable, so the Stage 1 cut is called out inline with deferred notes. Matches PRD direction.
