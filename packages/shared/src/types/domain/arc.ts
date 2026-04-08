import type { AspectUUID } from "./aspect";

export type ArcUUID = string;

export type Arc = {
  uuid: ArcUUID;
  aspectUUID: AspectUUID;
  movement: number[];
};
