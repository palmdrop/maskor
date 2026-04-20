import type { NoteUUID } from "./note";
import type { AspectUUID } from "./aspect";
import type { ArcUUID } from "./arc";
import type { ReferenceUUID } from "./reference";

export type ProjectUUID = string;

export type Project = {
  uuid: ProjectUUID;
  name: string;
  vaultPath: string;
  notes: NoteUUID[];
  aspects: AspectUUID[];
  references: ReferenceUUID[];
  arcs: ArcUUID[];
  // fragments: FragmentUUID[];
};
