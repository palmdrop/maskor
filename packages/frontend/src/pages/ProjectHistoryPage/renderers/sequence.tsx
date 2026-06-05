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
    case "sequence:activated":
      return `Sequence "${sequenceName(entry)}" activated as a constraint`;
    case "sequence:deactivated":
      return `Sequence "${sequenceName(entry)}" deactivated as a constraint`;
    case "sequence:section-reordered":
      return `Section "${entry.payload.sectionName}" reordered in sequence "${sequenceName(entry)}"`;
    case "sequence:fragments-grouped":
      return `${entry.payload.fragmentCount} fragment${entry.payload.fragmentCount === 1 ? "" : "s"} grouped into section "${entry.payload.sectionName}" in sequence "${sequenceName(entry)}"`;
    case "sequence:fragments-moved":
      return `${entry.payload.fragmentCount} fragment${entry.payload.fragmentCount === 1 ? "" : "s"} moved into section "${entry.payload.sectionName}" in sequence "${sequenceName(entry)}"`;
    case "sequence:section-split":
      return `Section split into "${entry.payload.sectionName}" in sequence "${sequenceName(entry)}"`;
    default:
      return `Sequence action on "${sequenceName(entry)}"`;
  }
};
