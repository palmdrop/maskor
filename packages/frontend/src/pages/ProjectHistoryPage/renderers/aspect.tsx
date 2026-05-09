import type { LogEntry } from "@maskor/shared";

const key = (entry: LogEntry) => entry.target.key ?? entry.target.uuid;

export const renderAspectEntryText = (entry: LogEntry): string => {
  switch (entry.type) {
    case "aspect:created":
      return `Aspect "${key(entry)}" created`;
    case "aspect:updated": {
      const fields = entry.payload.changedFields.join(", ");
      return `Aspect "${key(entry)}" edited — ${fields}`;
    }
    case "aspect:renamed":
      return `Aspect renamed: "${entry.payload.oldKey}" → "${entry.payload.newKey}"`;
    case "aspect:deleted":
      return `Aspect "${key(entry)}" deleted`;
    default:
      return `Aspect action on "${key(entry)}"`;
  }
};
