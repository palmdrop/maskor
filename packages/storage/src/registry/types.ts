import type { Project } from "@maskor/shared";

export const LOCAL_USER_UUID = "local";

export type ProjectRecord = Omit<Project, "uuid" | "notes" | "aspects" | "references" | "arcs"> & {
  projectUUID: string;
  userUUID: string;
};

export type ProjectContext = {
  userUUID: string;
  projectUUID: string;
  vaultPath: string;
};
