import { anchorSentinel, stripSentinelChars } from "@maskor/shared/sentinel";
import {
  stripCommentMarkers,
  buildCommentMarker,
  extractCommentMarkerIds,
  COMMENT_MARKER_REGEX,
  slugify,
} from "@maskor/shared";

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
//
// A body may carry `annotations` for file export: the fragment's attached
// References and its Margin (notes + anchored comments). They are inert unless
// the matching `includeReferences` / `includeMarginAnnotations` option is on, so
// preview (which never sets those options) is byte-identical whether or not the
// annotations are attached.
export type ReferenceAnnotation = { key: string; body: string };
export type CommentAnnotation = { markerId: string; body: string };

export type BlockAnnotations = {
  // The fragment's display key — surfaced in orphan warnings.
  fragmentKey: string;
  // The whole-fragment Margin notes (empty string when there are none).
  notes: string;
  // Anchored Margin comments, in authoring order. Each binds to a `<!--c:markerId-->`
  // marker somewhere in the body.
  comments: CommentAnnotation[];
  // Attached references, in frontmatter attachment order.
  references: ReferenceAnnotation[];
};

export type AssemblyBlock =
  | { kind: "section-heading"; text: string }
  | { kind: "title"; text: string }
  | { kind: "body"; anchorId: string; content: string; annotations?: BlockAnnotations };

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
  // Annotation toggles. Absent/false → annotations are ignored entirely and the
  // output is byte-identical to the pre-annotation assembler (preview relies on
  // this). References render as footnotes; Margin notes + comments render as
  // footnotes in `"footnote"` mode and as retained markers in `"docx"` mode.
  includeReferences?: boolean;
  includeMarginAnnotations?: boolean;
};

// Which annotation dialect the body carries. `"footnote"` (md/txt) replaces
// every Margin marker with a GFM footnote ref and appends reference footnotes.
// `"docx"` keeps the comment markers in place (Word comments are lowered later
// from the side-channel map) and only lowers references to footnotes.
export type AssemblyMode = "footnote" | "docx";

// A skipped-because-orphaned comment count for one fragment. An orphaned comment
// is one whose `markerId` is absent from the fragment body — there is nowhere to
// anchor it, so it is not rendered, but the caller is warned.
export type OrphanWarning = { fragmentKey: string; count: number };

// The full result of an assembly pass. `commentBodies` is populated only in
// `"docx"` mode: it maps every retained marker id (real comment markers plus the
// synthetic notes markers) to the comment body Word should attach.
export type AssemblyResult = {
  markdown: string;
  commentBodies: Record<string, string>;
  warnings: OrphanWarning[];
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
      return "\u00a0";
    case "horizontal-rule":
      return "---";
    case "page-break":
      // File-export-only; preview never sends this. Rendering in the preview
      // surface is undefined.
      return "\f";
  }
};

// Synthetic marker ids for Margin notes in `"docx"` mode. Notes have no marker of
// their own (they are whole-fragment), so we mint one to place a Word comment at
// the fragment head. The `maskor-note-` namespace plus the fragment uuid cannot
// collide with an author-authored comment marker id.
const syntheticNotesMarkerId = (fragmentUuid: string): string => `maskor-note-${fragmentUuid}`;

// Mutable per-pass footnote/label state. One instance is threaded through the
// whole document so counters, dedupe, and definition order are document-global.
type FootnoteState = {
  // Shared sequential counter for Margin notes + comments (`c1`, `c2`, …),
  // assigned in document order. Only advanced in `"footnote"` mode.
  commentCounter: number;
  // Reference key → its footnote label. Deduped: the same reference attached to
  // many fragments resolves to one label and one definition.
  referenceLabelByKey: Map<string, string>;
  // Allocated slug → the reference key that owns it. Guards collision suffixing
  // between DIFFERENT keys that slugify identically.
  referenceKeyBySlug: Map<string, string>;
  // Footnote definitions in first-reference order, emitted at document end.
  definitions: Array<{ label: string; content: string }>;
  warnings: OrphanWarning[];
  commentBodies: Record<string, string>;
};

// The label shape the shared comment counter mints (`c1`, `c2`, …). A reference
// slug matching this is reserved so it cannot collide with a comment footnote and
// bind two definitions to one label.
const COMMENT_LABEL_PATTERN = /^c\d+$/;

// Resolve (and, on first use, allocate) the footnote label for a reference key.
// The label is the slugified key with a deterministic `-2`, `-3`, … suffix when a
// different key already claimed that slug or the slug collides with the comment
// counter namespace. Empty slugs degrade to `reference`.
const allocateReferenceLabel = (
  key: string,
  state: FootnoteState,
): { label: string; isNew: boolean } => {
  const existing = state.referenceLabelByKey.get(key);
  if (existing !== undefined) return { label: existing, isNew: false };

  const base = slugify(key) || "reference";
  let candidate = base;
  let suffix = 2;
  while (
    COMMENT_LABEL_PATTERN.test(candidate) ||
    (state.referenceKeyBySlug.has(candidate) && state.referenceKeyBySlug.get(candidate) !== key)
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  state.referenceKeyBySlug.set(candidate, key);
  state.referenceLabelByKey.set(key, candidate);
  return { label: candidate, isNew: true };
};

// A reference footnote's content: `key — body` (em dash), or bare `key` when the
// body is empty/whitespace.
const referenceDefinitionContent = (reference: ReferenceAnnotation): string => {
  const trimmedBody = reference.body.trim();
  return trimmedBody.length > 0 ? `${reference.key} — ${trimmedBody}` : reference.key;
};

// Render one GFM footnote definition. Continuation lines of a multi-paragraph
// body are indented four spaces per the GFM spec; blank lines stay blank.
const formatDefinition = (label: string, content: string): string => {
  const [firstLine, ...restLines] = content.split("\n");
  const lines = [
    `[^${label}]: ${firstLine}`,
    ...restLines.map((line) => (line.length > 0 ? `    ${line}` : line)),
  ];
  return lines.join("\n");
};

// Transform a single body's content for the given mode, mutating `state` with any
// definitions/warnings/comment bodies. Returns the transformed body text plus the
// head token (the notes footnote ref or notes marker) to place at the fragment
// head. The head token is returned rather than inserted so the caller can attach
// it to the title line when a title is shown.
const transformBody = (
  block: Extract<AssemblyBlock, { kind: "body" }>,
  options: AssemblyOptions,
  mode: AssemblyMode,
  state: FootnoteState,
): { text: string; headToken: string } => {
  const annotations = block.annotations;
  const marginOn = options.includeMarginAnnotations === true && annotations !== undefined;
  const referencesOn = options.includeReferences === true && annotations !== undefined;

  // No annotations in play: strip markers exactly as the pre-annotation
  // assembler did — this is the byte-identity path.
  if (!marginOn && !referencesOn) {
    return { text: stripCommentMarkers(block.content), headToken: "" };
  }

  let headToken = "";

  // Margin notes → a head token, allocated before any body comment so the shared
  // counter reflects document order (notes ref precedes this fragment's comments).
  if (marginOn && annotations!.notes.trim().length > 0) {
    if (mode === "footnote") {
      state.commentCounter += 1;
      const label = `c${state.commentCounter}`;
      state.definitions.push({ label, content: annotations!.notes.trim() });
      headToken = `[^${label}]`;
    } else {
      const markerId = syntheticNotesMarkerId(block.anchorId);
      state.commentBodies[markerId] = annotations!.notes.trim();
      headToken = buildCommentMarker(markerId);
    }
  }

  // Margin comments.
  let text: string;
  if (!marginOn) {
    // References on but Margin off: markers carry no meaning here, so strip them.
    text = stripCommentMarkers(block.content);
  } else if (mode === "footnote") {
    const commentBodyByMarker = new Map(
      annotations!.comments.map((comment) => [comment.markerId, comment.body]),
    );
    const usedMarkerIds = new Set<string>();
    // Each bound marker becomes a `[^cN]` ref at its exact position; the regex
    // eats the leading whitespace, so the ref attaches to the preceding text like
    // a conventional footnote. Inert markers (no matching comment) are dropped.
    text = block.content.replace(COMMENT_MARKER_REGEX, (_match, markerId: string) => {
      if (!commentBodyByMarker.has(markerId)) return "";
      usedMarkerIds.add(markerId);
      state.commentCounter += 1;
      const label = `c${state.commentCounter}`;
      state.definitions.push({ label, content: (commentBodyByMarker.get(markerId) ?? "").trim() });
      return `[^${label}]`;
    });
    const orphanCount = annotations!.comments.filter(
      (comment) => !usedMarkerIds.has(comment.markerId),
    ).length;
    if (orphanCount > 0) {
      state.warnings.push({ fragmentKey: annotations!.fragmentKey, count: orphanCount });
    }
  } else {
    // docx: markers are retained for the comment-lowering pass. Record every
    // comment whose marker is actually present, and warn on the orphans.
    const presentMarkerIds = new Set(extractCommentMarkerIds(block.content));
    for (const comment of annotations!.comments) {
      if (presentMarkerIds.has(comment.markerId)) {
        state.commentBodies[comment.markerId] = comment.body.trim();
      }
    }
    const orphanCount = annotations!.comments.filter(
      (comment) => !presentMarkerIds.has(comment.markerId),
    ).length;
    if (orphanCount > 0) {
      state.warnings.push({ fragmentKey: annotations!.fragmentKey, count: orphanCount });
    }
    text = block.content;
  }

  // Reference footnotes → refs appended to the body's last line, in attachment
  // order, one definition per distinct reference (deduped across fragments).
  if (referencesOn && annotations!.references.length > 0) {
    let referenceSuffix = "";
    for (const reference of annotations!.references) {
      const { label, isNew } = allocateReferenceLabel(reference.key, state);
      if (isNew) {
        state.definitions.push({ label, content: referenceDefinitionContent(reference) });
      }
      referenceSuffix += `[^${label}]`;
    }
    const lines = text.split("\n");
    lines[lines.length - 1] = `${lines[lines.length - 1]}${referenceSuffix}`;
    text = lines.join("\n");
  }

  return { text, headToken };
};

// The internal renderer both the md/txt (`assembleMarkdown`) and docx-bound paths
// share. Heading levels, separator placement, sentinel embedding, and annotation
// lowering all live here so every caller produces identical structure.
const renderAssembly = (
  blocks: AssemblyBlock[],
  options: AssemblyOptions,
  mode: AssemblyMode,
): AssemblyResult => {
  const segments: string[] = [];
  const state: FootnoteState = {
    commentCounter: 0,
    referenceLabelByKey: new Map(),
    referenceKeyBySlug: new Map(),
    definitions: [],
    warnings: [],
    commentBodies: {},
  };
  // The kind of the previous block that participates in separator decisions.
  // A suppressed title is transparent (does not update this); a section heading
  // does update it, so it absorbs the separator at a section boundary.
  let previousKind: "section-heading" | "title" | "body" | null = null;
  // Index of the most recently emitted `### title` segment, so a shown title can
  // absorb its body's head token (the notes footnote ref / marker).
  let lastTitleSegmentIndex = -1;

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
      lastTitleSegmentIndex = segments.length - 1;
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

    const { text, headToken } = transformBody(block, options, mode, state);

    // Place the head token: on the title line when a title is shown, otherwise on
    // the end of the body's first line.
    let body = text;
    if (headToken.length > 0) {
      if (anchoredByTitle && lastTitleSegmentIndex >= 0) {
        segments[lastTitleSegmentIndex] = `${segments[lastTitleSegmentIndex]}${headToken}`;
      } else {
        const lines = body.split("\n");
        lines[0] = `${lines[0]}${headToken}`;
        body = lines.join("\n");
      }
    }

    // Strip sentinel chars when anchors are on. The Margin markers were already
    // consumed by `transformBody` (replaced, retained, or stripped per mode).
    segments.push(options.includeAnchors ? stripSentinelChars(body) : body);
    previousKind = "body";
  });

  let markdown = segments.join("\n\n");
  if (state.definitions.length > 0) {
    const definitionsBlock = state.definitions
      .map((definition) => formatDefinition(definition.label, definition.content))
      .join("\n\n");
    markdown = markdown.length > 0 ? `${markdown}\n\n${definitionsBlock}` : definitionsBlock;
  }

  return { markdown, commentBodies: state.commentBodies, warnings: state.warnings };
};

/**
 * Lower an ordered list of blocks to a single assembled markdown string (md/txt).
 *
 * Heading levels, separator placement, and sentinel embedding all live here so
 * every caller produces identical output. Bodies are emitted near-verbatim: the
 * Margin anchor markers (`<!--c:ID-->`) are always stripped (they belong to the
 * authoring surface, never the output) unless the Margin annotation option is on,
 * in which case each bound marker becomes a GFM footnote ref. The invisible
 * sentinel control characters are stripped when anchors are on. With annotations
 * off, byte-for-byte fidelity is preserved for file export.
 */
export const assembleMarkdown = (blocks: AssemblyBlock[], options: AssemblyOptions): string =>
  renderAssembly(blocks, options, "footnote").markdown;

/**
 * The full annotation-aware assembly, exposing both dialects and the warnings.
 * `markdown` is the md/txt footnote form; `docx` keeps comment markers in place
 * and reports the `{ markerId → body }` map the Word-comment lowering consumes.
 */
export const assembleAnnotated = (
  blocks: AssemblyBlock[],
  options: AssemblyOptions,
): { footnote: AssemblyResult; docx: AssemblyResult } => ({
  footnote: renderAssembly(blocks, options, "footnote"),
  docx: renderAssembly(blocks, options, "docx"),
});
