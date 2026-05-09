import type { LogEntry } from "@maskor/shared";

const key = (entry: LogEntry) => entry.target.key ?? entry.target.uuid;

export const renderSequenceEntryText = (entry: LogEntry): string => {
  switch (entry.type) {
    case "sequence:fragment-placed":
      return `Fragment "${key(entry)}" placed in sequence`;
    case "sequence:fragment-moved":
      return `Fragment "${key(entry)}" moved in sequence`;
    default:
      return `Sequence action on "${key(entry)}"`;
  }
};
