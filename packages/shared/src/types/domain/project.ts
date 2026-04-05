import type { Brand } from "ts-brand";
import type { NoteUUID } from "./note";
import type { AspectUUID } from "./aspect";
import type { UUID } from "../utils/uuid";
import type { ArcUUID } from "./arc";

export type ProjectUUID = Brand<UUID, "project">;

export type Project = {
  uuid: ProjectUUID;
  name: string;
  vaultPath: string;
  notes: NoteUUID[];
  aspects: AspectUUID[];
  arcs: ArcUUID[];
};
