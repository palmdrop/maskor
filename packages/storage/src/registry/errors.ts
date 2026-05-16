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
