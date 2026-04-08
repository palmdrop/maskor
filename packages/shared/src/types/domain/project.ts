import type { NoteUUID } from "./note";
import type { AspectUUID } from "./aspect";
import type { ArcUUID } from "./arc";

export type ProjectUUID = string;

export type Project = {
  uuid: ProjectUUID;
  name: string;
  vaultPath: string;
  notes: NoteUUID[];
  aspects: AspectUUID[];
  arcs: ArcUUID[];
};
