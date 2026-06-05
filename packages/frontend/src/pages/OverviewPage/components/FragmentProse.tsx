import { ReadonlyProse } from "@components/readonly-prose";
import type { OverviewDetailLevel } from "../../../router";

// Fixed reading style for the working surface. Per ADR 0011 the spine is NOT
// promised to match Preview/export — it concatenates per-fragment chunks with a
// plain fixed style. Preview remains the export-authoritative renderer.
const SPINE_FONT_SIZE = 16;
const SPINE_MAX_PARAGRAPH_WIDTH = 72;

export const fragmentAnchorId = (fragmentUuid: string) => `fragment-${fragmentUuid}`;

// Derive a short plain-text excerpt from a fragment's markdown body: the first
// non-empty block, with leading markdown markers stripped and truncated.
export const deriveExcerpt = (content: string, limit = 240): string => {
  const firstBlock = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block.length > 0);
  if (!firstBlock) return "";
  const cleaned = firstBlock
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit).trimEnd()}…` : cleaned;
};

interface FragmentProseProps {
  fragmentUuid: string;
  title: string;
  content: string;
  detailLevel: OverviewDetailLevel;
  // Server-derived excerpt fallback used at the "excerpt" detail level when the
  // full content has not yet loaded.
  excerpt?: string;
  isSelected?: boolean;
  onSelect?: (fragmentUuid: string) => void;
}

// Shared single-fragment renderer used by both the prose spine and the right
// detail panel. Exposes a stable anchor id (`fragment-<uuid>`) for navigation.
// The edit affordance is deferred to Phase 4.
export const FragmentProse = ({
  fragmentUuid,
  title,
  content,
  detailLevel,
  excerpt,
  isSelected,
  onSelect,
}: FragmentProseProps) => {
  const selectedClass = isSelected
    ? "border-primary bg-primary/5"
    : "border-transparent hover:border-border";

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      id={fragmentAnchorId(fragmentUuid)}
      data-fragment-uuid={fragmentUuid}
      data-detail-level={detailLevel}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(fragmentUuid);
      }}
      className={`scroll-mt-4 rounded-md border px-3 py-2 transition-colors ${selectedClass}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>

      {detailLevel === "excerpt" && (
        <p className="mt-1 text-sm leading-snug text-muted-foreground">
          {deriveExcerpt(content) || excerpt || ""}
        </p>
      )}

      {detailLevel === "prose" && (
        <div className="mt-1">
          <ReadonlyProse
            content={content}
            fontSize={SPINE_FONT_SIZE}
            maxParagraphWidth={SPINE_MAX_PARAGRAPH_WIDTH}
          />
        </div>
      )}
    </div>
  );
};
