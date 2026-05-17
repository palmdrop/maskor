export class ProjectNotFoundError extends Error {
  readonly projectUUID: string;

  constructor(projectUUID: string) {
    super(`Project not found: ${projectUUID}`);
    this.name = "ProjectNotFoundError";
    this.projectUUID = projectUUID;
  }
}

export class ProjectConflictError extends Error {
  readonly vaultPath: string;

  constructor(vaultPath: string) {
    super(`A project is already registered at: "${vaultPath}"`);
    this.name = "ProjectConflictError";
    this.vaultPath = vaultPath;
  }
}

export class VaultUUIDConflictError extends Error {
  readonly newPath: string;
  readonly conflictingUUID: string;

  constructor(newPath: string, conflictingUUID: string) {
    super(`The folder at "${newPath}" belongs to a different project (UUID: ${conflictingUUID})`);
    this.name = "VaultUUIDConflictError";
    this.newPath = newPath;
    this.conflictingUUID = conflictingUUID;
  }
}
