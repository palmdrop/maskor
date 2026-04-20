import type { AspectUUID } from "./aspect";

export type ArcUUID = string;

export type Arc = {
  uuid: ArcUUID;
  aspectUUID: AspectUUID;
  movement: number[]; // NOTE: this needs to be fleshed out... should be a graph/path... maybe could be defined by a math function?
};
