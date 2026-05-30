// Frontend mirror of the canonical anchor-sentinel definition that lives in
// `@maskor/exporter` (`packages/exporter/src/sentinel.ts`). The exporter embeds
// these tokens in the assembled markdown; the read-only renderer's markdown-it
// rule recognizes them here. They MUST stay in sync.
//
// Re-declared locally rather than imported because value imports from workspace
// packages into the browser bundle are constrained (see
// `references/suggestions.md` — the shared barrel pulls a Node-only logger). The
// token is tiny and stable, so a mirrored constant with this pointer is the
// pragmatic choice.
//
// The token uses the Interlinear Annotation control characters (U+FFF9..U+FFFB),
// which effectively never occur in prose; the exporter additionally strips any
// stray occurrence from body content, so a body can never forge an anchor.

const SENTINEL_OPEN = "￹"; // INTERLINEAR ANNOTATION ANCHOR
const SENTINEL_SEPARATOR = "￺"; // INTERLINEAR ANNOTATION SEPARATOR
const SENTINEL_CLOSE = "￻"; // INTERLINEAR ANNOTATION TERMINATOR
const SENTINEL_LABEL = "maskor-anchor";

/** Build the sentinel token that encodes an anchor id (for round-trip serialize). */
export const anchorSentinel = (anchorId: string): string =>
  `${SENTINEL_OPEN}${SENTINEL_LABEL}${SENTINEL_SEPARATOR}${anchorId}${SENTINEL_CLOSE}`;

/**
 * Matches a line consisting solely of a sentinel token, capturing the anchor id.
 * The assembler always emits each sentinel on its own line, so the markdown-it
 * block rule anchors the whole line.
 */
export const ANCHOR_SENTINEL_LINE_PATTERN = new RegExp(
  `^${SENTINEL_OPEN}${SENTINEL_LABEL}${SENTINEL_SEPARATOR}([^${SENTINEL_SEPARATOR}${SENTINEL_CLOSE}]+)${SENTINEL_CLOSE}$`,
);
