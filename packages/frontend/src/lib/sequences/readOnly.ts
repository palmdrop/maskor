// Re-export of the shared single source of truth. An import-sequence — a sequence
// carrying an `origin` — is a read-only snapshot of its original import order: its
// placements and section structure are frozen, and the backend enforces this in
// `@maskor/sequencer` (`assertSequenceMutable`). The predicate is defined once in
// `@maskor/shared` so the frontend mirror cannot drift from the backend rule.
export { isSequenceReadOnly } from "@maskor/shared";
