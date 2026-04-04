# Type Definitions Review

**Date**: 04-04-2026
**Reviewer**: Claude Code (code-reviewer agent)

---

## Summary

The type definitions form a reasonable skeleton, but they are not production-ready for this domain. Three classes of problems dominate: (1) several types are factually wrong or internally contradictory right now, not just incomplete; (2) the `Fragment` type conflates layers — it carries both markdown-owned fields and DB-only fields in a single type with no separation; and (3) several domain concepts that the SYNC_CONTRACT describes in detail have no corresponding types at all, or are represented with types that are too loose to be useful.

---

## Issues by Category

### Critical

**`Sequence.uuid` is typed as `SectionUUID` — wrong brand**

File: `packages/shared/src/types/domain/sequence.ts`, line 18

```ts
export type Sequence = {
  uuid: SectionUUID; // <-- should be SequenceUUID
  ...
};
```

`SequenceUUID` is declared on line 7 but never used. This is a copy-paste error that will silently pass type-checking everywhere because both are `Brand<UUID, ...>` — the brands are just different strings, not structurally incompatible in a way TypeScript will catch. Any function that accepts a `SequenceUUID` will reject a `Sequence`'s uuid, but nothing in the codebase enforces that yet. Fix before adding any sequence-related logic.

---

**`ArcUUID` brand string is `"arch"`, not `"arc"`**

File: `packages/shared/src/types/domain/arc.ts`, line 5

```ts
export type ArcUUID = Brand<UUID, "arch">;
```

The domain entity is called `Arc`. The brand `"arch"` is a typo and will cause silent inconsistency if brands are ever compared or used in serialization. Fix to `"arc"`.

---

**`Fragment` mixes markdown-owned and DB-only fields with no separation**

File: `packages/shared/src/types/domain/fragment.ts`

The `Fragment` type currently carries `contentHash` and `updatedAt` directly alongside `title`, `content`, `pool`, etc. The SYNC_CONTRACT is explicit that `contentHash` and `updatedAt` are DB-only fields — they are never written to markdown. Having them on the same type means:

- Every mapper that constructs a `Fragment` from a file must invent values for `contentHash` and `updatedAt`, which is semantically wrong (the file doesn't have them).
- The storage layer currently does fake this — `vault.ts` reads confirm this is a real pain point, not a theoretical one.

**Suggested fix**: Split into two types:

```ts
// What the markdown file owns
export type FragmentFile = {
  uuid: FragmentUUID;
  title: string;
  version: number;
  pool: Pool;
  readyStatus: ReadyStatus;
  notes: string[];
  references: string[];
  properties: FragmentProperties;
  content: Markdown;
};

// Full DB record — extends the file type with DB-only fields
export type Fragment = FragmentFile & {
  contentHash: string;
  updatedAt: Date;
};
```

This cleanly expresses the sync contract in the type system and removes the fabrication problem in mappers.

---

**`get(uuids: string[])` overload return type is wrong**

File: `packages/shared/src/types/apis/fragments.ts`, line 11

```ts
get(uuids: string[]): Promise<Fragment>[];
```

This returns an array of `Promise<Fragment>`, not `Promise<Fragment[]>`. A caller would need to `Promise.all(api.get([...]))` to get the fragments. This is almost certainly not the intended signature — it should be `Promise<Fragment[]>`. Also, neither overload uses `FragmentUUID`, using raw `string` instead.

---

**`Project.archUUIDs` field name and type are both wrong**

File: `packages/shared/src/types/domain/project.ts`, line 14

```ts
archUUIDs: Arc[];
```

The field is named `archUUIDs` (uses the typo brand string) but typed as `Arc[]` (full objects, not UUIDs). The name promises UUIDs but delivers full objects. Pick one: either `arcUUIDs: ArcUUID[]` or `arcs: Arc[]`. Given that `Sequence` and `Section` data is DB-only, embedding full `Arc` objects in `Project` may be premature — `arcUUIDs: ArcUUID[]` is probably correct here.

---

### Improvements

**`Fragment.notes` and `Fragment.references` are `string[]` — imprecise about which layer they're on**

File: `packages/shared/src/types/domain/fragment.ts`, lines 26–27

The SYNC_CONTRACT says these are stored as titles in the file and resolved to UUIDs in the DB. A single `string[]` type cannot express this distinction. The ambiguity means any function receiving a `Fragment` cannot know whether the strings are titles or UUIDs — it must look at the call site.

At minimum, document it clearly with a comment (there is already a comment, but it's on a field that both layers share, which is the structural issue). The real fix is the `FragmentFile` / `Fragment` split described above — `FragmentFile.notes: string[]` is unambiguously titles; a future `FragmentRecord.notes: NoteUUID[]` would be unambiguously UUIDs.

---

**`FragmentProperties` value should store the weight range constraint**

File: `packages/shared/src/types/domain/fragment.ts`, lines 9–12

```ts
export type FragmentProperties = {
  [aspectKey: string]: {
    weight: number;
  };
};
```

`weight` is a `number` but the SYNC_CONTRACT defines it as `0–1`. There is no type-level enforcement. A branded `Weight` type or at minimum a `ReadyStatus`-style alias with a comment would make the intent clear. The same applies to `ReadyStatus` on line 17 — it's defined as a type alias but never used in `Fragment` (which uses `readyStatus: number` directly instead of `readyStatus: ReadyStatus`).

---

**`Arc.movement` is `number[]` — completely opaque**

File: `packages/shared/src/types/domain/arc.ts`, line 10

```ts
movement: number[];
```

An arc is a curve that maps to aspect weights across a sequence's timeline. `number[]` carries no information about what the values mean, how many there are, or what index corresponds to what. This will be a source of confusion when the sequencer is implemented. At minimum this needs a `// TODO:` comment. Realistically it probably needs a more expressive type — e.g., `movement: { position: number; weight: number }[]` — that makes position explicit rather than relying on array index.

---

**`Action.data` is `unknown`**

File: `packages/shared/src/types/domain/action.ts`, line 14

```ts
data: unknown;
```

`Action` carries a discriminated `type: ActionType` field, which means the shape of `data` is knowable from the type. This is the classic discriminated union pattern and `data: unknown` throws it away. The right approach is to make `Action` generic or use a discriminated union:

```ts
export type Action<T = unknown> = {
  type: ActionType;
  data: T;
  execute: () => void;
  revert: () => void;
  ...
};
```

Or better, a discriminated union per action type so `data` is always correctly typed at the use site.

---

**`Action` embeds executable functions in a data type**

File: `packages/shared/src/types/domain/action.ts`, lines 15–16

```ts
execute: () => void;
revert: () => void;
```

Mixing data and behavior in a type is a leaky abstraction. If `Action` is ever serialized (for undo history persistence, logging, API transport), the functions will be lost or cause errors. Separate the action descriptor (data) from the action executor (behavior):

```ts
// Data — serializable
export type ActionDescriptor = { type: ActionType; data: unknown; ... };

// Runtime — holds the descriptor plus execution logic
export type ActionHandler = { descriptor: ActionDescriptor; execute: () => void; revert: () => void; };
```

---

**`Section.fragments` position field is `number` — integer or float?**

File: `packages/shared/src/types/domain/sequence.ts`, line 12

Presumably an integer index. A `// TODO:` comment or a `Position` alias would clarify intent and prevent fractional positions from slipping in.

---

**`Piece` type is too loose**

File: `packages/shared/src/types/domain/piece.ts`

```ts
export type Piece = {
  updatedAt?: Date;
  title?: string;
  content: string;
};
```

Both `updatedAt` and `title` are optional. The SYNC_CONTRACT says `Piece` is a raw file dropped in `pieces/` — the title is derived from the filename when absent. `updatedAt` is never mentioned in the sync contract for `Piece`. The optional `updatedAt` suggests this type is trying to do double duty as both "raw import" and some intermediate representation. Clarify what `Piece` represents and drop fields that don't belong.

---

**`Pool` has commented-out alternative design with no explanation**

File: `packages/shared/src/types/domain/pool.ts`

The file contains a commented-out `Pool` object type with a `PoolUUID`. There is no `// TODO:` comment explaining why the object design was rejected, or whether it's planned for later. A stale commented block in a type file is noise — either remove it or add a `// TODO:` with the reason it was deferred.

---

**`aspects.ts` API type is empty**

File: `packages/shared/src/types/apis/aspects.ts`

The file exists and is exported from `apis/index.ts`, but its content is a single blank line. Either it was accidentally emptied or it was never written. Given the rest of the API surface, an `AspectsApi` type clearly needs to exist — `getAll`, `get`, `create`, `update`, `delete` at minimum.

---

### Minor / Style

**`ReadyStatus` type alias is declared but never used on `Fragment`**

File: `packages/shared/src/types/domain/fragment.ts`, lines 17 and 29

`ReadyStatus` is exported as a type alias for `number`, then `readyStatus: number` is used directly on `Fragment`. The alias exists but provides no benefit because it is never applied. Either use it (`readyStatus: ReadyStatus`) or remove it.

---

**`Markdown` type alias adds no structural value**

File: `packages/shared/src/types/utils/markdown.ts`

```ts
export type Markdown = string;
```

This is a documentation alias, not a branded type. It will not prevent a plain `string` from being assigned to a `Markdown` field or vice versa. That's acceptable, but `Reference.content` uses plain `string` (line 9 of `reference.ts`) while `Note.content` uses `Markdown`. Inconsistent — `Reference.content` should also use `Markdown` since the SYNC_CONTRACT says it maps to the file body.

---

**`UUID` type pattern is weak**

File: `packages/shared/src/types/utils/uuid.ts`

```ts
export type UUID = `${string}-${string}-${string}-${string}-${string}`;
```

This will match any five-segment dash-delimited string, including `"a-b-c-d-e"`. It does not enforce v4 UUID format (8-4-4-4-12 hex characters). Acceptable for now as a documentation type, but add a `// TODO:` noting it's not a strict UUID validator.

---

**`Domain` in `action.ts` is an incomplete enum-as-union**

File: `packages/shared/src/types/domain/action.ts`, line 4

```ts
export type Domain = "fragment" | "project" | "aspect";
```

The comment `// etc...` signals it's known to be incomplete. `"note"`, `"reference"`, `"sequence"`, `"arc"` are all missing. Add a `// TODO:` and enumerate the missing domains, even if action handlers for them aren't implemented yet.

---

**`Aspect.notes` is `string[]` but lacks the same layer comment as `Fragment.notes`**

File: `packages/shared/src/types/domain/aspect.ts`, line 12

`Fragment.notes` has a comment explaining the file-layer vs DB-layer ambiguity. `Aspect.notes` has the same ambiguity but no comment. Apply the same documentation.

---

**`shared` README is the Bun init boilerplate — not updated**

File: `packages/shared/README.md`

Contains `bun run index.ts` and no description of what the package exports. Per the project rules, package READMEs should document the package. This one is completely empty of actual content.

---

## Missing Types

Given the SYNC_CONTRACT and project goals, the following types are absent:

| Missing type | Why it's needed |
|---|---|
| `AspectsApi` | API surface for aspect CRUD — file `apis/aspects.ts` is blank |
| `FragmentFile` (or equivalent) | To separate file-layer fields from DB-only fields on `Fragment` |
| `SyncEvent` | The watcher needs to emit typed events (created / updated / deleted / renamed) per entity type |
| `SyncResult` | Result of a sync operation — success, conflict, warnings |
| `FittingScore` | The SYNC_CONTRACT mentions fitting scores as a DB-only computed field; there is no type for this |
| `ContentHash` | `contentHash: string` on `Fragment` has no type alias; a `Brand<string, "contentHash">` would prevent accidental string assignment |
| `Weight` | `0–1` float used in both `FragmentProperties` and `Arc.movement` — a shared branded or documented alias would make the constraint explicit |
| `VaultPath` | File paths appear as raw `string` in the planned Vault API — a `Brand<string, "vaultPath">` or at least a type alias prevents mixing absolute system paths with relative vault paths |
| `SequenceRecord` | A sequence with resolved, ordered fragments (not just UUIDs) — needed by the sequencer and UI |
| `ImportResult` | Result of importing a `Piece` — success with the new `Fragment`, or failure with reason |

---

## Recommendations

1. **Fix the two critical typos immediately** — `Sequence.uuid: SectionUUID` and `ArcUUID` brand `"arch"`. These are silent bugs that will compound.

2. **Fix `FragmentsApi.get` overload** — `Promise<Fragment>[]` → `Promise<Fragment[]>` and use `FragmentUUID` instead of `string`.

3. **Split `Fragment` into `FragmentFile` and `Fragment`** — the single biggest structural improvement available right now. The storage implementation is already fighting this problem.

4. **Apply `ReadyStatus` consistently** — use it on `Fragment.readyStatus`, and apply the same pattern to `Weight` for aspect weights.

5. **Write `AspectsApi`** — the file is empty but exported. It is dead weight in the type index until populated.

6. **Remove or annotate the dead code in `pool.ts`** — add a `// TODO:` if the object design is revisited later, otherwise delete.

7. **Add `// TODO:` to `UUID`** — note it is not a strict v4 validator.

8. **Update `packages/shared/README.md`** — replace Bun boilerplate with a description of what the package exports and its role in the monorepo.

9. **Resolve `Action`'s mixed data/behavior problem** before undo history is implemented — retrofitting this after callers exist will be painful.

10. **Add `SyncEvent` and `SyncResult` types** before the file watcher is implemented — they will be the primary contract between the watcher and the rest of the system.
