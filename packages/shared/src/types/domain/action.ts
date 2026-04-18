import type { ProjectUUID } from "./project";

// etc...
export type Domain = "fragment" | "project" | "aspect" | "note" | "reference";

export type ActionType = `${Domain}:${"created" | "updated" | "deleted"}`;

export type Action = {
  date: Date;
  type: ActionType;
  undoType: ActionType;
  projectUUID: ProjectUUID;
  data: unknown;
};

export type ActionLog = {
  projectId: string;
  actions: Action[];
};
