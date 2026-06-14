import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  useCreateAspect,
  useListAspects,
  getListAspectsQueryKey,
} from "@api/generated/aspects/aspects";
import type { Fragment } from "@api/generated/maskorAPI.schemas";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { AspectPreview } from "./aspect-preview";
import { resolveAspectColor } from "../../pages/OverviewPage/utils/aspectColors";

type Props = {
  projectId: string;
  fragment: Fragment;
  // The single aspect currently expanded (single-expand accordion), or null. Lifted to the fragment
  // editor so the metadata sidebar and this tab share one selection.
  expandedAspectKey: string | null;
  onToggle: (aspectKey: string) => void;
};

// The Aspect tab of the fragment editor's Margin gutter: a reader list of every aspect attached to
// the fragment. Each row expands (single-expand) to the aspect's description + notes via
// `AspectPreview`. Orphaned rows (a weight key with no aspect entity) render muted with a
// create-the-aspect affordance instead of a preview.
export const AspectReaderTab = ({ projectId, fragment, expandedAspectKey, onToggle }: Props) => {
  const queryClient = useQueryClient();
  const { data: aspectsEnvelope } = useListAspects(projectId);
  const { mutateAsync: createAspect, isPending: isCreating } = useCreateAspect();

  const projectAspects = useMemo(
    () => (aspectsEnvelope?.status === 200 ? aspectsEnvelope.data : []),
    [aspectsEnvelope],
  );

  const knownAspectKeys = useMemo(
    () => new Set(projectAspects.map((aspect) => aspect.key)),
    [projectAspects],
  );

  const colorByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const aspect of projectAspects) {
      map.set(aspect.key, resolveAspectColor(aspect.key, aspect.color));
    }
    return map;
  }, [projectAspects]);

  const rows = useMemo(
    () =>
      Object.entries(fragment.aspects).map(([key, value]) => ({
        key,
        weight: value?.weight ?? 0,
        isLive: knownAspectKeys.has(key),
      })),
    [fragment.aspects, knownAspectKeys],
  );

  // TODO: route aspect creation through the command system (mirrors the metadata form's existing
  // TODO for create-and-attach).
  const handleCreate = async (aspectKey: string) => {
    await createAspect({ projectId, data: { key: aspectKey } });
    await queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
  };

  if (rows.length === 0) {
    return <p className="px-1 text-sm text-muted-foreground">No aspects on this fragment.</p>;
  }

  return (
    <div className="flex min-w-0 flex-col">
      {rows.map(({ key, weight, isLive }) => {
        const isExpanded = expandedAspectKey === key;
        return (
          <div key={key} className={`border-b border-border/50 ${isLive ? "" : "opacity-60"}`}>
            <button
              type="button"
              onClick={() => onToggle(key)}
              aria-expanded={isExpanded}
              className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm transition-colors hover:bg-muted/40"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {isExpanded ? (
                  <ChevronDown size={14} className="shrink-0" />
                ) : (
                  <ChevronRight size={14} className="shrink-0" />
                )}
                <span
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                    isLive ? "" : "border border-muted-foreground/50"
                  }`}
                  style={isLive ? { backgroundColor: colorByKey.get(key) } : undefined}
                  aria-hidden="true"
                />
                <span className="truncate">{key}</span>
                {!isLive && (
                  <Badge variant="muted" aria-label="orphaned aspect">
                    orphaned
                  </Badge>
                )}
              </span>
              <span className="shrink-0 text-muted-foreground">{Math.round(weight * 100)}%</span>
            </button>
            {isExpanded && (
              <div className="min-w-0 break-words pb-3 pl-5 pr-1">
                {isLive ? (
                  <AspectPreview projectId={projectId} aspectKey={key} />
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">
                      This aspect is referenced by weight but has no definition in the project.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isCreating}
                      onClick={() => handleCreate(key)}
                      className="self-start"
                    >
                      {isCreating ? "Creating…" : "Create aspect"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
