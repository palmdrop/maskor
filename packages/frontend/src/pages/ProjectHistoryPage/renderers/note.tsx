import type { LogEntry } from "@maskor/shared";

const key = (entry: LogEntry) => entry.target.key ?? entry.target.uuid;

export const renderNoteEntryText = (entry: LogEntry): string => {
  switch (entry.type) {
    case "note:created":
      return `Note "${key(entry)}" created`;
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
