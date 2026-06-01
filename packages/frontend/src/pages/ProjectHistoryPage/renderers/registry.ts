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
  draft: "DRAFTS",
  margin: "MARGINS",
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
    case "draft":
    case "margin":
      // Draft and Margin entries don't have a dedicated renderer yet — fall back to a
      // generic textual representation so the history view still shows them.
      return `${entry.type}: ${entry.target.key ?? entry.target.uuid}`;
  }
};

// Entries whose nature is "the entity no longer exists" or "no single entity target"
// — never render a link.
const TERMINAL_TYPES = new Set<LogEntry["type"]>([
  "aspect:deleted",
  "note:deleted",
  "reference:deleted",
  "fragment:imported",
]);

export const isLinkable = (entry: LogEntry): boolean => {
  if (TERMINAL_TYPES.has(entry.type)) return false;
  if (entry.target.type === "sequence") return false;
  // Margins have no standalone entity page — they live beside their fragment.
  if (entry.target.type === "margin") return false;
  return true;
};
