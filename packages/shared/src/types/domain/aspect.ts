import type { Brand } from "ts-brand";
import type { UUID } from "../utils/uuid";
import type { NoteUUID } from "./note";

export type AspectUUID = Brand<UUID, "aspect">;

export type Aspect = {
  uuid: AspectUUID;
  key: string;
  category?: string;
  description?: string;
  notes: NoteUUID[];
};
