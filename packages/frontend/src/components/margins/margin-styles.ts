import { MARGIN_LINE_HEIGHT } from "./slot-editor";

// Serif text styling shared by the column's static (non-editing) comment, orphan, and notes text, so
// they read in the same family + rhythm as the active slot editors. Rendered at the configured Margin
// text size (`editor.marginFontSize`), decoupled from the larger prose font now that alignment no
// longer depends on pixel-exact heights.
export const serifTextStyle = (fontSize: number) =>
  ({
    fontFamily: "var(--font-serif)",
    lineHeight: MARGIN_LINE_HEIGHT,
    fontSize,
  }) as const;
