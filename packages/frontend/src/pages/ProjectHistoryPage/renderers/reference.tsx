import type { LogEntry } from "@maskor/shared";

const key = (entry: LogEntry) => entry.target.key ?? entry.target.uuid;

export const renderReferenceEntryText = (entry: LogEntry): string => {
  switch (entry.type) {
    case "reference:created":
      return `Reference "${key(entry)}" created`;
    case "reference:updated":
      return `Reference "${key(entry)}" edited`;
    case "reference:renamed":
      return `Reference renamed: "${entry.payload.oldKey}" → "${entry.payload.newKey}"`;
    case "reference:deleted":
      return `Reference "${key(entry)}" deleted`;
    default:
      return `Reference action on "${key(entry)}"`;
  }
};
