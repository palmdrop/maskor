import type { Brand } from "ts-brand";
import type { Note } from "./note";
import type { Aspect } from "./aspect";
import type { UUID } from "../utils/uuid";
import type { Arc } from "./arc";

export type ProjectUUID = Brand<UUID, "project">;

export type Project = {
  uuid: ProjectUUID;
  name: string;
  vaultPath: string;
  notes: Note[];
  aspects: Aspect[];
  arcUUIDs: Arc[];
};
