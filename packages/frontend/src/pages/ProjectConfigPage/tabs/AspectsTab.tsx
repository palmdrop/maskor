import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAspects,
  useCreateAspect,
  useDeleteAspect,
  getListAspectsQueryKey,
} from "../../../api/generated/aspects/aspects";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { Link } from "@tanstack/react-router";
import { PenLineIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { ArcEditor } from "../components/ArcEditor";

export const AspectsTab = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading } = useListAspects(projectId);
  const createAspect = useCreateAspect();
  const deleteAspect = useDeleteAspect();

  const [createOpen, setCreateOpen] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [categoryValue, setCategoryValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string>("");

  const aspects = envelope?.status === 200 ? envelope.data : [];

  const handleCreate = async () => {
    const trimmed = keyValue.trim();
    if (!trimmed) {
      setCreateError("Key is required.");
      return;
    }
    setCreateError(null);
    try {
      await createAspect.mutateAsync({
        projectId,
        data: {
          key: trimmed,
          category: categoryValue.trim() || undefined,
          description: descriptionValue.trim() || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
      setCreateOpen(false);
      setKeyValue("");
      setCategoryValue("");
      setDescriptionValue("");
    } catch (error) {
      // setCreateError("Failed to create aspect.");
      setCreateError((error as { message?: string })?.message ?? "Failed to create aspect.");
    }
  };

  const handleCreateOpenChange = (next: boolean) => {
    if (!next) {
      setKeyValue("");
      setCategoryValue("");
      setDescriptionValue("");
      setCreateError(null);
    }
    setCreateOpen(next);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return;
    await deleteAspect.mutateAsync({ projectId, aspectId: confirmDeleteId });
    queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
    setConfirmDeleteId(null);
    setConfirmDeleteKey("");
  };

  return (
    <div className="flex flex-col gap-4 pt-4 max-w-lg">
      <div className="flex items-center justify-between">
        <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <PlusIcon />
              New aspect
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New aspect</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="aspect-key">Key</Label>
                <Input
                  id="aspect-key"
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  placeholder="e.g. tone"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="aspect-category">Category (optional)</Label>
                <Input
                  id="aspect-category"
                  value={categoryValue}
                  onChange={(e) => setCategoryValue(e.target.value)}
                  placeholder="e.g. style"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="aspect-description">Description (optional)</Label>
                <Input
                  id="aspect-description"
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                />
              </div>
              {createError && <p className="text-xs text-destructive">{createError}</p>}
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createAspect.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : aspects.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {aspects.map((aspect) => (
            <li key={aspect.uuid} className="rounded-md border border-border/50 text-sm">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex flex-col">
                  <span className="font-mono">{aspect.key}</span>
                  {aspect.category && (
                    <span className="text-xs text-muted-foreground">{aspect.category}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    to="/projects/$projectId/aspects/$aspectId"
                    params={{ projectId, aspectId: aspect.uuid }}
                  >
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${aspect.key}`}>
                      <PenLineIcon />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setConfirmDeleteId(aspect.uuid);
                      setConfirmDeleteKey(aspect.key);
                    }}
                    aria-label={`Delete ${aspect.key}`}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
              <ArcEditor projectId={projectId} aspectId={aspect.uuid} />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDeleteId(null);
            setConfirmDeleteKey("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete aspect</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-mono text-foreground">{confirmDeleteKey}</span>? Fragments
            that reference this key will show warnings on the next rebuild.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDeleteId(null);
                setConfirmDeleteKey("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteAspect.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
