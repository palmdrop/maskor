import type { LogEntry } from "@maskor/shared";

const key = (entry: LogEntry) => entry.target.key ?? entry.target.uuid;

export const renderFragmentEntryText = (entry: LogEntry): string => {
  switch (entry.type) {
    case "fragment:created":
      return `Fragment "${key(entry)}" created`;
    case "fragment:updated": {
      const fields = entry.payload.changedFields.join(", ");
      return `Fragment "${key(entry)}" edited — ${fields}`;
    }
    case "fragment:renamed":
      return `Fragment renamed: "${entry.payload.oldKey}" → "${entry.payload.newKey}"`;
    case "fragment:discarded":
      return `Fragment "${key(entry)}" discarded`;
    case "fragment:restored":
      return `Fragment "${key(entry)}" restored`;
    default:
      return `Fragment action on "${key(entry)}"`;
  }
};
