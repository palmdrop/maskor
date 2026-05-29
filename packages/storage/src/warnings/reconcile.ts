import type { VaultDatabase } from "../db/vault";
import { findFragmentUuidsByAspectKey } from "../indexer/upserts";
import { insertWarning, deleteStateWarningByKey } from "./warnings-repo";

// Reconcile UNKNOWN_ASPECT_KEY state warnings for the given aspect keys against current vault
// state. A key that is still unknown and referenced by ≥1 fragment keeps a warning (refreshed
// with the current referencing UUIDs); a key that became known or is no longer referenced has its
// warning cleared. Returns true if any warning row changed so the caller can emit `vault:warning`.
//
// Shared by every incremental path that can shift an aspect key's known/referenced status:
// fragment sync, fragment unlink, aspect sync (key becomes known), aspect unlink (key becomes
// unknown). Rebuild stays authoritative — this is best-effort upkeep between rebuilds.
export const reconcileUnknownAspectKeyWarnings = (
  vaultDatabase: VaultDatabase,
  aspectKeys: Iterable<string>,
  knownAspectKeys: Set<string>,
): boolean => {
  let changed = false;

  for (const aspectKey of aspectKeys) {
    const referencingUuids = knownAspectKeys.has(aspectKey)
      ? []
      : findFragmentUuidsByAspectKey(vaultDatabase, aspectKey);

    if (referencingUuids.length) {
      insertWarning(vaultDatabase, {
        kind: "UNKNOWN_ASPECT_KEY",
        aspectKey,
        fragmentUuids: referencingUuids,
      });
      changed = true;
    } else if (deleteStateWarningByKey(vaultDatabase, "UNKNOWN_ASPECT_KEY", aspectKey)) {
      changed = true;
    }
  }

  return changed;
};
