---
name: Maskor domain model
description: Core entities, types, field ownership, and key design constraints
type: project
---

**How to apply:** Check field ownership before deciding where to read/write data.

## Core entities (`packages/shared/src/types/domain/`)

- **Fragment**: uuid, title, version, readyStatus, notes[], references[], properties (aspect weights), content, contentHash, updatedAt
- **Aspect**: uuid, key (unique slug), category?, description?, notes[]
- **Note**: uuid, title, content
- **Reference**: uuid, name, content
- **Piece**: title?, content — transient, no UUID, becomes Fragment on consume
- **Sequence**: uuid, name, sections[]
- **Section**: uuid, name, fragments[] { fragmentUUID, position }
- **Arc**: uuid, aspectUUID, movement: number[]
- **Project**: uuid, name, vaultPath, notes[], aspects[], arcUUIDs[]

## Field ownership

- **Vault owns**: uuid, title, version, readyStatus, notes[], references[], inline aspect weights, body content
- **DB owns**: contentHash, updatedAt/syncedAt, sequence positions, fitting scores, arc positions, filePath index

## Key type notes

- `FragmentProperties` = `Record<aspectKey, { weight: number }>` — keyed by string at file layer, resolved to UUID at DB layer
- `IndexedFragment` extends Fragment: adds `filePath` and nullable `aspectUuid` on properties
- `Action` type has `execute`/`revert` function fields — not serializable
- `Interleaving` type is a TODO stub

## Unsettled

- Sequences/Sections have no DB schema in vault/schema.ts yet
- `Project` embeds full `Aspect[]` and `Note[]` — should be UUID refs at scale
- Action revert log design unresolved
