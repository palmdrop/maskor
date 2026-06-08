import type { ActionLogEntry } from "@maskor/shared";

const key = (entry: ActionLogEntry) => entry.target.key ?? entry.target.uuid;

export const renderNoteEntryText = (entry: ActionLogEntry): string => {
  switch (entry.type) {
    case "note:created":
      return `Note "${key(entry)}" created`;
    case "note:edited":
      return `Note "${key(entry)}" edited`;
    case "note:updated":
      return `Note "${key(entry)}" edited`;
    case "note:renamed":
      return `Note renamed: "${entry.payload.oldKey}" → "${entry.payload.newKey}"`;
    case "note:deleted":
      return `Note "${key(entry)}" deleted`;
    default:
      return `Note action on "${key(entry)}"`;
  }
};
