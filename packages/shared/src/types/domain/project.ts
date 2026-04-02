import type { Brand } from "ts-brand"
import type { Note, NoteUUID } from "./note";
import type { Aspect, AspectUUID } from "./aspect";
import type { UUID } from "../utils";
import type { Arch } from "./arch";

export type ProjectUUID = Brand<UUID, "project">;

export type Project = {
  uuid: ProjectUUID;
  name: string;
  notes: Note[];
  aspects: Aspect[];
  archUUIDs: Arch[];
}