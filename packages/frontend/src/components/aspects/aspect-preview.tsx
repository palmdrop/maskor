import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useGetAspect, useListAspects } from "@api/generated/aspects/aspects";
import { ReadonlyProse } from "@components/readonly-prose";
import { Badge } from "@components/ui/badge";

type Props = {
  projectId: string;
  aspectKey: string;
};

// Standalone, read-only reader for a single aspect: its description (rendered markdown) and notes,
// with a deep-link to the full aspect editor. The aspect is joined by key (the vault join field);
// the uuid needed for the detail fetch and the editor link is resolved from the cached aspect list.
// The list payload omits `description` (it is vault-only), so the body comes from the single-get.
export const AspectPreview = ({ projectId, aspectKey }: Props) => {
  const { data: listEnvelope } = useListAspects(projectId);
  const summary = useMemo(() => {
    const aspects = listEnvelope?.status === 200 ? listEnvelope.data : [];
    return aspects.find((aspect) => aspect.key === aspectKey);
  }, [listEnvelope, aspectKey]);

  const aspectUuid = summary?.uuid ?? "";
  const { data: detailEnvelope, isLoading } = useGetAspect(projectId, aspectUuid);
  const aspect = detailEnvelope?.status === 200 ? detailEnvelope.data : undefined;

  if (!summary) {
    return (
      <p className="text-xs text-muted-foreground">This aspect has no definition in the project.</p>
    );
  }

  const description = aspect?.description?.trim() ?? "";
  const notes = aspect?.notes ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex justify-end">
        <Link
          to="/projects/$projectId/aspects/$aspectId"
          params={{ projectId, aspectId: aspectUuid }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Open aspect <ExternalLink size={12} />
        </Link>
      </div>
      {isLoading && !aspect ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : description ? (
        <ReadonlyProse content={description} fontSize={14} maxParagraphWidth={64} />
      ) : (
        <p className="text-xs italic text-muted-foreground">No description.</p>
      )}
      {notes.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Notes</span>
          <div className="flex flex-wrap gap-1">
            {notes.map((note) => (
              <Badge key={note} variant="muted">
                {note}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
