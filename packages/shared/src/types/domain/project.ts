import type { Brand } from "ts-brand";
import type { Note } from "./note";
import type { Aspect } from "./aspect";
import type { UUID } from "../utils";
import type { Arc } from "./arc";

export type ProjectUUID = Brand<UUID, "project">;

export type Project = {
  uuid: ProjectUUID;
  name: string;
  notes: Note[];
  aspects: Aspect[];
  archUUIDs: Arc[];
};
