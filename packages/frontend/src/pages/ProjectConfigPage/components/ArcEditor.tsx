import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetArc,
  usePutArc,
  useDeleteArc,
  getGetArcQueryKey,
} from "../../../api/generated/aspects/aspects";
import type { ArcPoint } from "../../../api/generated/maskorAPI.schemas";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react";

const DEFAULT_POINTS: ArcPoint[] = [
  { x: 0, y: 0.5 },
  { x: 1, y: 0.5 },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const ArcPolyline = ({
  points,
  width = 80,
  height = 32,
}: {
  points: ArcPoint[];
  width?: number;
  height?: number;
}) => {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const svgPoints = sorted.map((p) => `${p.x * width},${(1 - p.y) * height}`).join(" ");
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={svgPoints}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

type ArcEditorProps = {
  projectId: string;
  aspectId: string;
};

export const ArcEditor = ({ projectId, aspectId }: ArcEditorProps) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading } = useGetArc(projectId, aspectId);
  const putArc = usePutArc();
  const deleteArc = useDeleteArc();

  const existingArc = envelope?.status === 200 ? envelope.data : null;

  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<ArcPoint[] | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = draft !== null;
  const displayPoints = draft ?? existingArc?.points ?? null;

  const invalidateArc = () => {
    queryClient.invalidateQueries({ queryKey: getGetArcQueryKey(projectId, aspectId) });
  };

  const handleDefine = () => {
    setDraft(DEFAULT_POINTS.map((p) => ({ ...p })));
    setExpanded(true);
  };

  const handleCancel = () => {
    setDraft(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    if (draft.length < 2) {
      setError("At least 2 control points required.");
      return;
    }
    setError(null);
    const sorted = [...draft].sort((a, b) => a.x - b.x);
    try {
      await putArc.mutateAsync({
        projectId,
        aspectId,
        data: { points: sorted },
      });
      invalidateArc();
      setDraft(null);
    } catch {
      setError("Failed to save arc.");
    }
  };

  const handleRemove = async () => {
    try {
      await deleteArc.mutateAsync({ projectId, aspectId });
      invalidateArc();
      setConfirmRemove(false);
      setDraft(null);
      setExpanded(false);
    } catch {
      setError("Failed to remove arc.");
    }
  };

  const handlePointChange = (index: number, axis: "x" | "y", raw: string) => {
    const value = clamp(parseFloat(raw) || 0, 0, 1);
    setDraft((previous) => {
      if (!previous) return previous;
      const next = [...previous];
      next[index] = { ...next[index], [axis]: value };
      return next;
    });
  };

  const handleAddPoint = () => {
    setDraft((previous) => {
      if (!previous) return previous;
      const sorted = [...previous].sort((a, b) => a.x - b.x);
      const last = sorted.at(-1) ?? { x: 0, y: 0.5 };
      const newX = clamp(last.x + 0.1, 0, 1);
      return [...sorted, { x: newX, y: 0.5 }];
    });
  };

  const handleRemovePoint = (index: number) => {
    setDraft((previous) => {
      if (!previous || previous.length <= 2) return previous;
      return previous.filter((_, pointIndex) => pointIndex !== index);
    });
  };

  if (isLoading) return <p className="text-xs text-muted-foreground px-3 py-1">Loading arc…</p>;

  return (
    <div className="border-t border-border/50 mt-1">
      <button
        className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
        <span>Arc</span>
        {displayPoints && (
          <span className="ml-auto opacity-60">
            <ArcPolyline points={displayPoints} />
          </span>
        )}
        {!displayPoints && <span className="ml-auto opacity-40 italic">none</span>}
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3">
          {!existingArc && !isEditing && (
            <Button variant="outline" size="sm" className="self-start" onClick={handleDefine}>
              <PlusIcon />
              Define arc
            </Button>
          )}

          {displayPoints && (
            <>
              <table className="text-xs w-full max-w-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-normal pb-1 w-1/2">x</th>
                    <th className="text-left font-normal pb-1 w-1/2">y</th>
                    {isEditing && <th />}
                  </tr>
                </thead>
                <tbody>
                  {displayPoints.map((point, index) => (
                    <tr key={index}>
                      <td className="pr-2 py-0.5">
                        {isEditing ? (
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={point.x}
                            onChange={(event) => handlePointChange(index, "x", event.target.value)}
                            className="h-6 text-xs px-1"
                          />
                        ) : (
                          <span className="font-mono">{point.x.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="py-0.5">
                        {isEditing ? (
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={point.y}
                            onChange={(event) => handlePointChange(index, "y", event.target.value)}
                            className="h-6 text-xs px-1"
                          />
                        ) : (
                          <span className="font-mono">{point.y.toFixed(2)}</span>
                        )}
                      </td>
                      {isEditing && (
                        <td className="pl-1 py-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRemovePoint(index)}
                            disabled={displayPoints.length <= 2}
                            aria-label="Remove point"
                          >
                            <Trash2Icon />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {isEditing && (
                <Button variant="outline" size="sm" className="self-start" onClick={handleAddPoint}>
                  <PlusIcon />
                  Add point
                </Button>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex items-center gap-2">
                {!isEditing && existingArc && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDraft(existingArc.points.map((p) => ({ ...p })))}
                    >
                      Edit arc
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
                      <Trash2Icon />
                      Remove arc
                    </Button>
                  </>
                )}
                {isEditing && (
                  <>
                    <Button size="sm" onClick={handleSave} disabled={putArc.isPending}>
                      Save arc
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCancel}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove arc</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove the arc for this aspect? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={deleteArc.isPending}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
