import { PencilIcon, Trash2Icon } from "lucide-react";
import { ReadonlyProse } from "@components/readonly-prose";
import type { OverviewDetailLevel } from "../../../router";
import { Heading } from "@components/heading";
import { FragmentLengthBar } from "./FragmentLengthBar";

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
  isDiscarded: boolean;
  detailLevel: OverviewDetailLevel;
  // Server-derived excerpt fallback used at the "excerpt" detail level when the
  // full content has not yet loaded.
  excerpt?: string;
  isSelected?: boolean;
  // Member of the sidebar-hovered sequence — drawn with a ring that coexists
  // with the selection border. Only the Overview spine passes this.
  isHighlighted?: boolean;
  onSelect?: (fragmentUuid: string) => void;
  // When set, the body becomes double-click/pencil-to-edit: the host opens the
  // full fragment editor as a center-replacing overlay for this fragment (ADR
  // 0013). FragmentProse itself never edits in place.
  onEdit?: (fragmentUuid: string) => void;
  // When set, a trash affordance in the header removes this fragment from the
  // active sequence (returns it to the pool). Only passed where the fragment is
  // actually placed.
  onRemove?: () => void;
  // Content length as a fraction of the longest placed fragment (0, 1]. Drawn
  // as a thin bar at the "title" detail level so the length distribution is
  // visible without any body text. Only the spine passes this.
  relativeLength?: number;
}

// Shared single-fragment renderer used by both the prose spine and the right
// detail panel. Exposes a stable anchor id (`fragment-<uuid>`) for navigation.
export const FragmentProse = ({
  fragmentUuid,
  title,
  content,
  isDiscarded,
  detailLevel,
  excerpt,
  isSelected,
  isHighlighted,
  onSelect,
  onEdit,
  onRemove,
  relativeLength,
}: FragmentProseProps) => {
  const editable = !!onEdit;

  const selectedClass = isSelected
    ? "border-primary bg-primary/5"
    : "border-transparent hover:border-border";
  const highlightClass = isHighlighted ? "ring-2 ring-sky-400 dark:ring-sky-500" : "";

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
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (editable) {
          // Clear the stray DOM selection the double-click gesture leaves behind
          // before handing off to the overlay editor.
          window.getSelection?.()?.removeAllRanges();
          onEdit!(fragmentUuid);
        }
      }}
      className={`group/prose relative scroll-mt-4 rounded-md border px-3 py-2 transition-colors ${selectedClass} ${highlightClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Heading level={4}>
          {title}
          {isDiscarded && " (discarded)"}
        </Heading>
        {(editable || onRemove) && (
          <div className="flex shrink-0 items-center gap-1">
            {editable && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit!(fragmentUuid);
                }}
                aria-label={`Edit "${title}"`}
                title="Edit this fragment"
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover/prose:opacity-100"
              >
                <PencilIcon size={12} />
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove();
                }}
                aria-label={`Remove "${title}" from sequence`}
                title="Remove from sequence"
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover/prose:opacity-100"
              >
                <Trash2Icon size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {detailLevel === "title" && relativeLength !== undefined && (
        <FragmentLengthBar relativeLength={relativeLength} className="mt-1.5" />
      )}

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
