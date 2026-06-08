import { useRef, useState } from "react";
import { PencilIcon } from "lucide-react";
import { ReadonlyProse } from "@components/readonly-prose";
import { InlineFragmentEditor } from "@components/inline-fragment-editor";
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
  projectId: string;
  fragmentUuid: string;
  title: string;
  content: string;
  detailLevel: OverviewDetailLevel;
  // Server-derived excerpt fallback used at the "excerpt" detail level when the
  // full content has not yet loaded.
  excerpt?: string;
  isSelected?: boolean;
  onSelect?: (fragmentUuid: string) => void;
  // When set, the rendered body becomes double-click/pencil-to-edit: the inline
  // editor is seeded with this fragment's markdown. Saving routes the new content
  // back to this fragmentUuid via the existing fragment update path (ADR 0011 —
  // the spine is a working surface, not export).
  onSaveContent?: (fragmentUuid: string, content: string) => Promise<void> | void;
}

// Shared single-fragment renderer used by both the prose spine and the right
// detail panel. Exposes a stable anchor id (`fragment-<uuid>`) for navigation.
export const FragmentProse = ({
  projectId,
  fragmentUuid,
  title,
  content,
  detailLevel,
  excerpt,
  isSelected,
  onSelect,
  onSaveContent,
}: FragmentProseProps) => {
  const editable = !!onSaveContent;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Surfaces the edit affordance once the reader selects text inside this chunk.
  const [hasSelection, setHasSelection] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedClass = isSelected
    ? "border-primary bg-primary/5"
    : "border-transparent hover:border-border";

  const beginEditing = () => {
    setHasSelection(false);
    setIsEditing(true);
    // Clear any stray DOM text selection made by the double-click gesture.
    window.getSelection?.()?.removeAllRanges();
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSave = async (newContent: string) => {
    if (!onSaveContent) return;
    setIsSaving(true);
    try {
      await onSaveContent(fragmentUuid, newContent);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Reflect whether the current document selection lies inside this chunk, so a
  // reader who highlights a passage is offered the edit affordance for *this*
  // fragment (the selection maps back to this fragmentUuid).
  const handleSelectionChange = () => {
    if (!editable || isEditing) return;
    const selection = window.getSelection?.();
    const collapsed = !selection || selection.isCollapsed || selection.toString().length === 0;
    const within =
      !collapsed &&
      !!selection &&
      selection.anchorNode != null &&
      !!containerRef.current?.contains(selection.anchorNode);
    setHasSelection(within);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      ref={containerRef}
      id={fragmentAnchorId(fragmentUuid)}
      data-fragment-uuid={fragmentUuid}
      data-detail-level={detailLevel}
      onClick={(event) => {
        event.stopPropagation();
        if (!isEditing) onSelect?.(fragmentUuid);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (editable && !isEditing) beginEditing();
      }}
      onMouseUp={handleSelectionChange}
      className={`group/prose relative scroll-mt-4 rounded-md border px-3 py-2 transition-colors ${selectedClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {editable && !isEditing && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              beginEditing();
            }}
            aria-label={`Edit "${title}"`}
            title="Edit this fragment"
            className={`shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 ${
              hasSelection ? "opacity-100" : "opacity-0 group-hover/prose:opacity-100"
            }`}
          >
            <PencilIcon size={12} />
          </button>
        )}
      </div>

      {isEditing ? (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <div className="mt-1" onClick={(event) => event.stopPropagation()}>
          <InlineFragmentEditor
            projectId={projectId}
            content={content}
            onSave={handleSave}
            onCancel={cancelEditing}
            isSaving={isSaving}
          />
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};
