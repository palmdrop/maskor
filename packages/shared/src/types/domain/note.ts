import type { Brand } from "ts-brand";
import type { UUID } from "../utils";

export type NoteUUID = Brand<UUID, 'note'>;

export type Note = {
  uuid: NoteUUID
  title: string
  content: string
};