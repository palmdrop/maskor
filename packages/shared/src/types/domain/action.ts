import type { ProjectUUID } from "./project";

// etc...
export type Domain = 'fragment' | 'project' | 'aspect'; 

export type ActionType = `${Domain}:${'created' | 'updated' | 'deleted'}`;

export type Action = {
  date: Date
  type: ActionType
  undoType: ActionType
  projectUUID: ProjectUUID
  data: unknown,
  execute: () => void,
  revert: () => void
}