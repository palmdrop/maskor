import type { Sequence } from "@api/generated/maskorAPI.schemas";

// An import-sequence — a sequence carrying an `origin` — is a read-only snapshot
// of its original import order: its placements and section structure are frozen.
// The backend enforces this in `@maskor/sequencer` (`assertSequenceMutable`); this
// mirrors the same rule on the generated schema type so every frontend surface
// tests the one condition rather than hand-rolling an `origin` check inline.
export const isSequenceReadOnly = (sequence: Sequence): boolean => sequence.origin !== undefined;
