export class ProjectNotFoundError extends Error {
  readonly projectUUID: string;

  constructor(projectUUID: string) {
    super(`Project not found: ${projectUUID}`);
    this.name = "ProjectNotFoundError";
    this.projectUUID = projectUUID;
  }
}
