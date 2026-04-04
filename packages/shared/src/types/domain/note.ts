import type { Brand } from "ts-brand";
import type { UUID } from "../utils/uuid";
import type { Markdown } from "../utils/markdown";

export type NoteUUID = Brand<UUID, "note">;

export type Note = {
  uuid: NoteUUID;
  title: string;
  content: Markdown;
};
