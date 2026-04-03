import type { Brand } from "ts-brand";
import type { UUID } from "../utils";
import type { NoteUUID } from "./note";

export type AspectUUID = Brand<UUID, "aspect">;

export type Aspect = {
  uuid: AspectUUID;
  key: string;
  notes: NoteUUID[];
  category: string;
  value: string;
};
