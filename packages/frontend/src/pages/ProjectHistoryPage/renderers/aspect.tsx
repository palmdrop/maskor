import type { LogEntry } from "@maskor/shared";

const key = (entry: LogEntry) => entry.target.key ?? entry.target.uuid;

export const renderAspectEntryText = (entry: LogEntry): string => {
  switch (entry.type) {
    case "aspect:created":
      return `Aspect "${key(entry)}" created`;
    case "aspect:description-edited":
      return `Aspect "${key(entry)}" description edited`;
    case "aspect:updated": {
      const fields = entry.payload.changedFields.join(", ");
      return `Aspect "${key(entry)}" edited — ${fields}`;
    }
    case "aspect:renamed":
      return `Aspect renamed: "${entry.payload.oldKey}" → "${entry.payload.newKey}"`;
    case "aspect:deleted": {
      const count = entry.payload.cascadeFragmentCount;
      const suffix = count > 0 ? ` (weights removed from ${count} fragment${count === 1 ? "" : "s"})` : "";
      return `Aspect "${key(entry)}" deleted${suffix}`;
    }
    case "aspect:category-changed": {
      const from = entry.payload.from ?? "none";
      const to = entry.payload.to ?? "none";
      return `Aspect "${key(entry)}" category: "${from}" → "${to}"`;
    }
    case "aspect:note-attached":
      return `Note "${entry.payload.noteKey}" attached to aspect "${key(entry)}"`;
    case "aspect:note-detached":
      return `Note "${entry.payload.noteKey}" detached from aspect "${key(entry)}"`;
    default:
      return `Aspect action on "${key(entry)}"`;
  }
};
