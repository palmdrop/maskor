import { anchorSentinel, stripSentinelChars } from "./sentinel";

// The neutral block model: a flat, ordered list. This is the single source of
// truth for heading levels, separator handling, and sentinel format. Both the
// sequence and import adapters lower their domain objects to these blocks and
// hand them to `assembleMarkdown`.
//
// - `section-heading` → `## name` (suppressed when `showSectionHeadings` is off,
//   but it still resets separator state, so the first fragment of a section
//   never gets a leading separator).
// - `title` → `### text` (suppressed when `showTitles` is off; when suppressed it
//   is transparent to separator state, so fragment separators still apply).
// - `body` → the fragment content, emitted verbatim.
//
// When `includeAnchors` is on, each body's anchor sentinel is emitted at the
// START of its fragment unit — immediately before the `title` when a title is
// shown, otherwise immediately before the body itself. Anchoring the unit's
// first visible block (rather than the body) means sidebar navigation lands on
// the `###` heading instead of scrolling it just out of view above the body.
export type AssemblyBlock =
  | { kind: "section-heading"; text: string }
  | { kind: "title"; text: string }
  | { kind: "body"; anchorId: string; content: string };

// The export superset of separators. Preview only ever passes the first three;
// `page-break` and `custom` are modeled for future file export.
export type AssemblySeparator =
  | "none"
  | "blank-line"
  | "horizontal-rule"
  | "page-break"
  | { custom: string };

export type AssemblyOptions = {
  separator: AssemblySeparator;
  showTitles: boolean;
  showSectionHeadings: boolean;
  includeAnchors: boolean;
};

// The extra markdown segment inserted between two consecutive fragment units.
// `null` means no extra segment — fragments are still separated by the baseline
// block boundary (the join below), which renders as normal adjacent paragraphs.
const separatorSegment = (separator: AssemblySeparator): string | null => {
  if (typeof separator === "object") return separator.custom;
  switch (separator) {
    case "none":
      return null;
    case "blank-line":
      // A non-breaking space forms an explicit empty paragraph, yielding a
      // visible blank line beyond the normal paragraph margin. A plain space
      // would be treated as a blank line by markdown and collapse away.
      return "\u00A0";
    case "horizontal-rule":
      return "---";
    case "page-break":
      // File-export-only; preview never sends this. Rendering in the preview
      // surface is undefined.
      return "\f";
  }
};

/**
 * Lower an ordered list of blocks to a single assembled markdown string.
 *
 * Heading levels, separator placement, and sentinel embedding all live here so
 * every caller produces identical output. Bodies are emitted verbatim (only the
 * invisible sentinel control characters are stripped, and only when anchors are
 * on, preserving byte-for-byte fidelity for file export).
 */
export const assembleMarkdown = (blocks: AssemblyBlock[], options: AssemblyOptions): string => {
  const segments: string[] = [];
  // The kind of the previous block that participates in separator decisions.
  // A suppressed title is transparent (does not update this); a section heading
  // does update it, so it absorbs the separator at a section boundary.
  let previousKind: "section-heading" | "title" | "body" | null = null;

  const pushSeparatorIfBetweenFragments = () => {
    if (previousKind !== "body") return;
    const segment = separatorSegment(options.separator);
    if (segment !== null) segments.push(segment);
  };

  blocks.forEach((block, index) => {
    if (block.kind === "section-heading") {
      if (options.showSectionHeadings && block.text.trim().length > 0) {
        segments.push(`## ${block.text}`);
      }
      previousKind = "section-heading";
      return;
    }

    if (block.kind === "title") {
      if (!options.showTitles) return; // transparent to separator state
      pushSeparatorIfBetweenFragments();
      // A shown title is the unit's first visible block, so the body's anchor
      // is emitted here — before the heading — rather than before the body.
      // (Adapters always emit a body immediately after its title.)
      const nextBlock = blocks[index + 1];
      if (options.includeAnchors && nextBlock?.kind === "body") {
        segments.push(anchorSentinel(nextBlock.anchorId));
      }
      segments.push(`### ${block.text}`);
      previousKind = "title";
      return;
    }

    // body
    pushSeparatorIfBetweenFragments();
    // The anchor rides with the preceding title when one is shown (above); emit
    // it here only when the body leads its unit (titles off, or no title block).
    const anchoredByTitle = options.showTitles && index > 0 && blocks[index - 1]?.kind === "title";
    if (options.includeAnchors && !anchoredByTitle) {
      segments.push(anchorSentinel(block.anchorId));
    }
    segments.push(options.includeAnchors ? stripSentinelChars(block.content) : block.content);
    previousKind = "body";
  });

  return segments.join("\n\n");
};
