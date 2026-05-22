// Per-process rebuild tracking. The promise map ensures concurrent requests
// all await the same rebuild rather than each triggering an independent one.
// The rebuilding set allows the status endpoint to report in-progress state
// without blocking on the rebuild itself.

const rebuildPromises = new Map<string, Promise<void>>();
const rebuildingProjects = new Set<string>();

export const isProjectRebuilding = (projectUUID: string): boolean =>
  rebuildingProjects.has(projectUUID);

export const hasRebuildRun = (projectUUID: string): boolean =>
  rebuildPromises.has(projectUUID);

export const registerRebuild = (projectUUID: string, rebuildFn: () => Promise<void>): Promise<void> => {
  if (rebuildPromises.has(projectUUID)) {
    return rebuildPromises.get(projectUUID)!;
  }

  rebuildingProjects.add(projectUUID);
  const promise = rebuildFn()
    .then(() => {
      rebuildingProjects.delete(projectUUID);
    })
    .catch((error) => {
      rebuildingProjects.delete(projectUUID);
      // Remove so the next request can retry the rebuild.
      rebuildPromises.delete(projectUUID);
      throw error;
    });

  rebuildPromises.set(projectUUID, promise);
  return promise;
};
