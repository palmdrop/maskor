import type { ProjectUUID, UserUUID } from "@maskor/shared";

export const LOCAL_USER_UUID: UserUUID = "local";

export type ProjectRecord = {
  projectUUID: ProjectUUID;
  userUUID: UserUUID;
  name: string;
  vaultPath: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectContext = {
  userUUID: UserUUID;
  projectUUID: ProjectUUID;
  vaultPath: string;
};
