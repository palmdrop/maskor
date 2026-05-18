import { DraftError } from "./errors";

// Process-level mutex keyed by vault path. Only one create or restore can be
// in flight for the same vault at a time. Concurrent attempts throw a
// DRAFT_OPERATION_IN_PROGRESS error rather than queueing — the user-facing
// behavior in spec § Acceptance criteria is "return the error without
// affecting the in-progress operation."

const inFlight = new Set<string>();

export const withDraftMutex = async <T>(
  vaultPath: string,
  operation: () => Promise<T>,
): Promise<T> => {
  if (inFlight.has(vaultPath)) {
    throw new DraftError(
      "DRAFT_OPERATION_IN_PROGRESS",
      "Another draft create or restore is already running for this vault.",
    );
  }
  inFlight.add(vaultPath);
  try {
    return await operation();
  } finally {
    inFlight.delete(vaultPath);
  }
};
