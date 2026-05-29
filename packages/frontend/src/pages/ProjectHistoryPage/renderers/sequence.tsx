import type { LogEntry } from "@maskor/shared";

const sequenceName = (entry: LogEntry) => entry.target.title ?? entry.target.uuid;

export const renderSequenceEntryText = (entry: LogEntry): string => {
  switch (entry.type) {
    case "sequence:fragment-placed":
      return `Fragment "${entry.payload.fragmentKey}" placed in sequence "${sequenceName(entry)}"`;
    case "sequence:fragment-moved":
      return `Fragment "${entry.payload.fragmentKey}" moved in sequence "${sequenceName(entry)}"`;
    case "sequence:fragment-unplaced":
      return `Fragment "${entry.payload.fragmentKey}" removed from sequence "${sequenceName(entry)}"`;
    case "sequence:created":
      return `Sequence "${sequenceName(entry)}" created`;
    case "sequence:renamed":
      return `Sequence renamed: "${entry.payload.oldKey}" → "${entry.payload.newKey}"`;
    case "sequence:deleted":
      return `Sequence "${sequenceName(entry)}" deleted`;
    case "sequence:set-main":
      return `Sequence "${sequenceName(entry)}" set as main`;
    case "sequence:section-reordered":
      return `Section "${entry.payload.sectionName}" reordered in sequence "${sequenceName(entry)}"`;
    default:
      return `Sequence action on "${sequenceName(entry)}"`;
  }
};
