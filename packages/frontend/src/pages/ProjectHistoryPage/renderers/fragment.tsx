import type { ActionLogEntry } from "@maskor/shared";

const key = (entry: ActionLogEntry) => entry.target.key ?? entry.target.uuid;

export const renderFragmentEntryText = (entry: ActionLogEntry): string => {
  switch (entry.type) {
    case "fragment:created":
      return `Fragment "${key(entry)}" created`;
    case "fragment:edited":
      return `Fragment "${key(entry)}" edited`;
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
    case "fragment:deleted":
      return `Fragment "${key(entry)}" permanently deleted`;
    case "fragment:readiness-changed":
      return `Ready status on fragment "${key(entry)}": ${Math.round(entry.payload.from * 100)}% → ${Math.round(entry.payload.to * 100)}%`;
    case "fragment:note-attached":
      return `Note "${entry.payload.noteKey}" attached to fragment "${key(entry)}"`;
    case "fragment:note-detached":
      return `Note "${entry.payload.noteKey}" detached from fragment "${key(entry)}"`;
    case "fragment:reference-attached":
      return `Reference "${entry.payload.referenceKey}" attached to fragment "${key(entry)}"`;
    case "fragment:reference-detached":
      return `Reference "${entry.payload.referenceKey}" detached from fragment "${key(entry)}"`;
    case "fragment:aspect-attached":
      return `Aspect "${entry.payload.aspectKey}" attached to fragment "${key(entry)}" at ${Math.round(entry.payload.weight * 100)}%`;
    case "fragment:aspect-detached":
      return `Aspect "${entry.payload.aspectKey}" detached from fragment "${key(entry)}"`;
    case "fragment:aspect-weight-changed":
      return `${entry.payload.aspectKey} weight on fragment "${key(entry)}": ${Math.round(entry.payload.from * 100)}% → ${Math.round(entry.payload.to * 100)}%`;
    case "fragment:imported": {
      const count = entry.payload.fragmentCount;
      return `Imported ${count} fragment${count !== 1 ? "s" : ""} from "${entry.payload.sourceFileName}"`;
    }
    default:
      return `Fragment action on "${key(entry)}"`;
  }
};
