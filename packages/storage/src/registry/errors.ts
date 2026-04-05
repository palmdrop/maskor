import type { ProjectUUID } from "@maskor/shared";

export class ProjectNotFoundError extends Error {
  readonly projectUUID: ProjectUUID;

  constructor(projectUUID: ProjectUUID) {
    super(`Project not found: ${projectUUID}`);
    this.name = "ProjectNotFoundError";
    this.projectUUID = projectUUID;
  }
}
