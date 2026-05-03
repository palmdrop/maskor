import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAspects,
  useCreateAspect,
  useDeleteAspect,
  useUpdateAspect,
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
import { PenLineIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { ArcEditor } from "../components/ArcEditor";

const AspectKeyInput = ({
  projectId,
  aspectId,
  currentKey,
  onRenamed,
}: {
  projectId: string;
  aspectId: string;
  currentKey: string;
  onRenamed: (warnings: string[]) => void;
}) => {
  const updateAspect = useUpdateAspect();
  const [editing, setEditing] = useState(false);
  const [keyValue, setKeyValue] = useState(currentKey);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = async () => {
    if (updateAspect.isPending) return;
    const trimmed = keyValue.trim();
    if (!trimmed || trimmed === currentKey) {
      setKeyValue(currentKey);
      setEditing(false);
      return;
    }
    setError(null);
    try {
      const result = await updateAspect.mutateAsync({
        projectId,
        aspectId,
        data: { key: trimmed },
      });
      if (result.status === 200) {
        onRenamed(result.data.warnings);
        setEditing(false);
      } else {
        const message = "message" in result.data ? result.data.message : "Rename failed.";
        setError(message ?? "Rename failed.");
        setKeyValue(currentKey);
        setEditing(false);
      }
    } catch {
      setError("Rename failed.");
      setKeyValue(currentKey);
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setKeyValue(currentKey);
      setEditing(false);
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      {editing ? (
        <Input
          ref={inputRef}
          value={keyValue}
          onChange={(e) => setKeyValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={updateAspect.isPending}
          className="h-6 py-0 px-1 font-mono text-sm w-40"
        />
      ) : (
        <button
          className="font-mono text-sm text-left hover:underline decoration-dotted"
          onClick={() => setEditing(true)}
          title="Click to rename"
        >
          {currentKey}
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

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

  const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);

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

  const handleRenamed = (warnings: string[]) => {
    queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
    if (warnings.length > 0) {
      setCascadeWarnings(warnings);
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-4 max-w-lg">
      {cascadeWarnings.length > 0 && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          <p>Aspect renamed. The following fragments were updated: {cascadeWarnings.join(", ")}</p>
          <button onClick={() => setCascadeWarnings([])} aria-label="Dismiss">
            <XIcon className="size-3 shrink-0 mt-0.5" />
          </button>
        </div>
      )}
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
                <div className="flex flex-col gap-0.5">
                  <AspectKeyInput
                    projectId={projectId}
                    aspectId={aspect.uuid}
                    currentKey={aspect.key}
                    onRenamed={handleRenamed}
                  />
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
