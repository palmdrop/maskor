import type { Markdown } from "../utils/markdown";

export type NoteUUID = string;

export type Note = {
  uuid: NoteUUID;
  title: string;
  content: Markdown;
};
