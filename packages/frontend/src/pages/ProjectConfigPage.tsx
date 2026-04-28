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
import type { Project } from "../api/generated/maskorAPI.schemas";
import { Heading } from "../components/heading";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AttachableEntityPanel } from "../components/attachable-entity-panel";

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
          <p className="text-sm text-muted-foreground">Aspects — not yet implemented.</p>
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
