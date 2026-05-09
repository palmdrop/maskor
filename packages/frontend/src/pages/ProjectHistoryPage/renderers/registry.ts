import type { LogEntry } from "@maskor/shared";
import { renderFragmentEntryText } from "./fragment";
import { renderAspectEntryText } from "./aspect";
import { renderNoteEntryText } from "./note";
import { renderReferenceEntryText } from "./reference";
import { renderSequenceEntryText } from "./sequence";

export const DOMAIN_LABELS: Record<LogEntry["target"]["type"], string> = {
  fragment: "FRAGMENTS",
  aspect: "ASPECTS",
  note: "NOTES",
  reference: "REFERENCES",
  sequence: "SEQUENCE",
};

export const renderEntryText = (entry: LogEntry): string => {
  switch (entry.target.type) {
    case "fragment":
      return renderFragmentEntryText(entry);
    case "aspect":
      return renderAspectEntryText(entry);
    case "note":
      return renderNoteEntryText(entry);
    case "reference":
      return renderReferenceEntryText(entry);
    case "sequence":
      return renderSequenceEntryText(entry);
  }
};

// Entries whose nature is "the entity no longer exists" — never render a link
// even if the uuid happens to still be in the indexed list (it shouldn't be).
const TERMINAL_TYPES = new Set<LogEntry["type"]>([
  "aspect:deleted",
  "note:deleted",
  "reference:deleted",
]);

export const isLinkable = (entry: LogEntry): boolean => {
  if (TERMINAL_TYPES.has(entry.type)) return false;
  if (entry.target.type === "sequence") return false;
  return true;
};
