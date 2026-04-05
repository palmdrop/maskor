---
name: Maskor domain model
description: Core entities, types, field ownership, and key design constraints
type: project
---

**Why:** Domain types in @maskor/shared are shared across all packages. Understanding ownership prevents mistakes.

**How to apply:** Check field ownership before deciding where to read/write data.

## Core entities (packages/shared/src/types/domain/)

- Fragment: uuid, title, version, pool, readyStatus, notes[], references[], properties (aspect weights), content, contentHash, updatedAt
- Aspect: uuid, key (unique slug), category?, description?, notes[]
- Note: uuid, title, content
- Reference: uuid, name, content
- Piece: title?, content — transient, no UUID, becomes Fragment on consume
- Sequence: uuid, name, sections[]
- Section: uuid, name, fragments[] { fragmentUUID, position }
- Arc: uuid, aspectUUID, movement: number[]
- Project: uuid, name, vaultPath, notes[], aspects[], arcUUIDs[]
- Pool: "unprocessed" | "incomplete" | "unplaced" | "discarded"

## Field ownership (vault file vs DB)

Vault owns: uuid, title, pool, version, readyStatus, notes[], references[], inline aspect weights, body content
DB owns: contentHash, updatedAt/syncedAt, sequence positions, fitting scores, arc positions, filePath index

## Key type details

- All UUIDs are branded via ts-brand: FragmentUUID, AspectUUID, NoteUUID, etc.
- UUID base type: `${string}-${string}-${string}-${string}-${string}`
- FragmentProperties = Record<aspectKey, { weight: number }> — keyed by string at file layer, resolved to UUID at DB layer
- IndexedFragment extends Fragment concept with filePath and nullable aspectUuid on properties
- Pool is a union type (not an entity) — commented-out entity version exists but not used
- Interleaving type is a TODO stub
- Action type has execute/revert function fields — not serializable as-is

## Unsettled

- Sequences/Sections have no DB schema yet in vault/schema.ts
- Project type embeds full Aspect[] and Note[] objects — should be UUID refs at scale
- Action revert log design unresolved
