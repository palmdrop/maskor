// Canonical anchor-sentinel definition — the cross-package contract between the
// exporter (which embeds these tokens in assembled markdown) and the frontend
// (whose read-only renderer parses them back into anchor nodes). It lives in
// `@maskor/shared` for the same reason `VaultSyncEvent` does: it is a protocol
// shared by a producer and a consumer, so there must be exactly one definition.
// Pure string/regex — no imports — so it is safe in both Node and the browser.
//
// Anchors are emitted only when `includeAnchors` is on (off for file export). A
// frontend markdown-it rule recognizes each token and maps it to an invisible
// Tiptap node that renders `id="fragment-<id>"`. See
// `references/adr/0003-preview-anchor-sentinels.md`.
//
// The token uses the Interlinear Annotation control characters (U+FFF9..U+FFFB),
// non-printing format characters that effectively never occur in prose, so
// collisions against real user content cannot happen in practice. As a
// belt-and-braces guarantee, the assembler strips any stray occurrence of these
// characters from body content before embedding sentinels (`stripSentinelChars`),
// so a body can never forge an anchor.

const SENTINEL_OPEN = "￹"; // INTERLINEAR ANNOTATION ANCHOR
const SENTINEL_SEPARATOR = "￺"; // INTERLINEAR ANNOTATION SEPARATOR
const SENTINEL_CLOSE = "￻"; // INTERLINEAR ANNOTATION TERMINATOR

const SENTINEL_LABEL = "maskor-anchor";

/** All sentinel control characters, for stripping/escaping user content. */
export const SENTINEL_CHARS = [SENTINEL_OPEN, SENTINEL_SEPARATOR, SENTINEL_CLOSE] as const;

/** Build the sentinel token that encodes an anchor id. */
export const anchorSentinel = (anchorId: string): string =>
  `${SENTINEL_OPEN}${SENTINEL_LABEL}${SENTINEL_SEPARATOR}${anchorId}${SENTINEL_CLOSE}`;

/**
 * Matches a single sentinel token anywhere and captures its anchor id. The id
 * runs up to the terminator and cannot itself contain the separator or
 * terminator chars (which are stripped from any content the assembler embeds).
 */
export const ANCHOR_SENTINEL_PATTERN = new RegExp(
  `${SENTINEL_OPEN}${SENTINEL_LABEL}${SENTINEL_SEPARATOR}([^${SENTINEL_SEPARATOR}${SENTINEL_CLOSE}]+)${SENTINEL_CLOSE}`,
);

/**
 * Matches a line consisting solely of a sentinel token, capturing the anchor id.
 * The assembler always emits each sentinel on its own line, so the frontend
 * markdown-it block rule anchors the whole line.
 */
export const ANCHOR_SENTINEL_LINE_PATTERN = new RegExp(
  `^${SENTINEL_OPEN}${SENTINEL_LABEL}${SENTINEL_SEPARATOR}([^${SENTINEL_SEPARATOR}${SENTINEL_CLOSE}]+)${SENTINEL_CLOSE}$`,
);

/** Remove any stray sentinel control characters from user content. */
export const stripSentinelChars = (text: string): string =>
  text.replace(new RegExp(`[${SENTINEL_OPEN}${SENTINEL_SEPARATOR}${SENTINEL_CLOSE}]`, "g"), "");
