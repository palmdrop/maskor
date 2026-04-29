import { useState, useRef, useEffect } from "react";
import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useUpdateProject,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
} from "../api/generated/projects/projects";
import {
  useListNotes,
  useCreateNote,
  useDeleteNote,
  getListNotesQueryKey,
} from "../api/generated/notes/notes";
import {
  useListReferences,
  useCreateReference,
  useDeleteReference,
  getListReferencesQueryKey,
} from "../api/generated/references/references";
import {
  useListAspects,
  useCreateAspect,
  useDeleteAspect,
  useGetArc,
  usePutArc,
  useDeleteArc,
  getGetArcQueryKey,
  getListAspectsQueryKey,
} from "../api/generated/aspects/aspects";
import type { Project, ArcPoint } from "../api/generated/maskorAPI.schemas";
import { Heading } from "../components/heading";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { AttachableEntityPanel } from "../components/attachable-entity-panel";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon, PenLineIcon, PlusIcon, Trash2Icon } from "lucide-react";

const GeneralTab = ({ project }: { project: Project }) => {
  const queryClient = useQueryClient();
  const updateProject = useUpdateProject();

  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = async () => {
    if (updateProject.isPending) return;
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === project.name) {
      setNameValue(project.name);
      setEditing(false);
      return;
    }
    setError(null);
    try {
      const result = await updateProject.mutateAsync({
        projectId: project.projectUUID,
        data: { name: trimmed },
      });
      if (result.status === 200) {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.projectUUID) });
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setEditing(false);
      } else {
        setError(
          "name" in result.data
            ? ((result.data as { message?: string }).message ?? "Update failed.")
            : "Update failed.",
        );
        setNameValue(project.name);
        setEditing(false);
      }
    } catch {
      setError("Update failed.");
      setNameValue(project.name);
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setNameValue(project.name);
      setEditing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pt-4 max-w-md">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-name">Name</Label>
        {editing ? (
          <Input
            ref={inputRef}
            id="project-name"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            disabled={updateProject.isPending}
          />
        ) : (
          <button
            className="text-sm text-left px-3 py-2 rounded-md border border-transparent hover:border-border hover:bg-muted/40 transition-colors w-full"
            onClick={() => setEditing(true)}
          >
            {project.name}
          </button>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Vault path</Label>
        <p className="text-sm px-3 py-2 rounded-md bg-muted/40 text-muted-foreground font-mono break-all">
          {project.vaultPath}
        </p>
      </div>
    </div>
  );
};

const NotesTab = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading } = useListNotes(projectId);
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  const items =
    envelope?.status === 200
      ? envelope.data.map((n) => ({
          uuid: n.uuid,
          label: n.title,
          editTo: `/projects/${projectId}/notes/${n.uuid}`,
        }))
      : [];

  const handleCreate = async (title: string, content: string) => {
    await createNote.mutateAsync({ projectId, data: { title, content } });
    queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
  };

  const handleDelete = async (noteId: string) => {
    await deleteNote.mutateAsync({ projectId, noteId });
    queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
  };

  return (
    <AttachableEntityPanel
      items={items}
      isLoading={isLoading}
      labelField="Title"
      dialogTitle="New note"
      onConfirmCreate={handleCreate}
      onDelete={handleDelete}
      isCreating={createNote.isPending}
    />
  );
};

const ReferencesTab = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient();
  const { data: envelope, isLoading } = useListReferences(projectId);
  const createReference = useCreateReference();
  const deleteReference = useDeleteReference();

  const items =
    envelope?.status === 200
      ? envelope.data.map((r) => ({
          uuid: r.uuid,
          label: r.name,
          editTo: `/projects/${projectId}/references/${r.uuid}`,
        }))
      : [];

  const handleCreate = async (name: string, content: string) => {
    await createReference.mutateAsync({ projectId, data: { name, content } });
    queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
  };

  const handleDelete = async (referenceId: string) => {
    await deleteReference.mutateAsync({ projectId, referenceId });
    queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
  };

  return (
    <AttachableEntityPanel
      items={items}
      isLoading={isLoading}
      labelField="Name"
      dialogTitle="New reference"
      onConfirmCreate={handleCreate}
      onDelete={handleDelete}
      isCreating={createReference.isPending}
    />
  );
};

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

const ArcEditor = ({ projectId, aspectId }: ArcEditorProps) => {
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
    const aspectKey = existingArc?.aspectKey ?? "";
    try {
      await putArc.mutateAsync({
        projectId,
        aspectId,
        data: { aspectKey, points: sorted },
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

const AspectsTab = ({ projectId }: { projectId: string }) => {
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
    } catch {
      setCreateError("Failed to create aspect.");
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

export const ProjectConfigPage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/config" });
  const { tab } = useSearch({ from: "/projects/$projectId/config" });
  const navigate = useNavigate({ from: "/projects/$projectId/config" });
  const { data: envelope, isLoading, isError } = useGetProject(projectId);

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (isError || !envelope)
    return <p className="p-6 text-sm text-muted-foreground">Failed to load project.</p>;

  const project = envelope.status === 200 ? envelope.data : null;
  if (!project) return <p className="p-6 text-sm text-muted-foreground">Project not found.</p>;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-6">
      <Heading level={1} className="mb-4">
        {project.name}
      </Heading>
      <Tabs
        value={tab}
        onValueChange={(value) => navigate({ search: { tab: value as typeof tab } })}
        className="flex-1"
      >
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="aspects">Aspects</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab project={project} />
        </TabsContent>
        <TabsContent value="aspects">
          <AspectsTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="references">
          <ReferencesTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
