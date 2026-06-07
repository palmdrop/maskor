import { MARGIN_FONT_SIZE, MARGIN_LINE_HEIGHT } from "./slot-editor";

// Serif text styling shared by the column's static (non-editing) comment, orphan, and notes text, so
// they read in the same family + rhythm as the active slot editors. Rendered at the app text size
// (decoupled from the larger prose font now that alignment no longer depends on pixel-exact heights).
export const serifText = {
  fontFamily: "var(--font-serif)",
  lineHeight: MARGIN_LINE_HEIGHT,
  fontSize: MARGIN_FONT_SIZE,
} as const;
