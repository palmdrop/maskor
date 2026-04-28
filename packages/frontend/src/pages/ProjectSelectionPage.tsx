import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useCreateProject,
  useDeleteProject,
  getListProjectsQueryKey,
} from "../api/generated/projects/projects";
import type { Project } from "../api/generated/maskorAPI.schemas";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";

const RegisterForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const queryClient = useQueryClient();
  const createProject = useCreateProject();
  const [name, setName] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await createProject.mutateAsync({ data: { name, vaultPath } });
      if (result.status === 201) {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setName("");
        setVaultPath("");
        onSuccess();
      } else {
        setError(result.data.message ?? "Registration failed.");
      }
    } catch {
      setError("Registration failed. Check your connection and try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My novel"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="vault-path">Vault path</Label>
        <Input
          id="vault-path"
          value={vaultPath}
          onChange={(e) => setVaultPath(e.target.value)}
          placeholder="/Users/me/writing/vault"
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={createProject.isPending} className="self-start">
        Register project
      </Button>
    </form>
  );
};

const DeregisterDialog = ({ project, onSuccess }: { project: Project; onSuccess: () => void }) => {
  const queryClient = useQueryClient();
  const deleteProject = useDeleteProject();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeregister = async () => {
    setError(null);
    try {
      await deleteProject.mutateAsync({ projectId: project.projectUUID });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setOpen(false);
      onSuccess();
    } catch {
      setError("Deregistration failed. Check your connection and try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
          Deregister
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deregister &ldquo;{project.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            This removes the registry entry. Your vault files are not modified or deleted.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={handleDeregister}
            disabled={deleteProject.isPending}
          >
            Deregister
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ProjectSelectionPage = () => {
  const navigate = useNavigate();
  const { data: envelope, isLoading, isError } = useListProjects();

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading projects...</p>;
  }

  if (isError || !envelope) {
    return <p className="p-8 text-sm text-destructive">Failed to load projects.</p>;
  }

  const projects = envelope.status === 200 ? envelope.data : [];
  const isEmpty = projects.length === 0;

  return (
    <div className="mx-auto max-w-xl p-8 flex flex-col gap-8">
      <h1 className="text-lg font-medium">Projects</h1>

      {isEmpty ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            No projects registered. Point Maskor at a vault to get started.
          </p>
          <RegisterForm onSuccess={() => {}} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {projects.map((project) => (
              <div
                key={project.projectUUID}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium truncate">{project.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {project.vaultPath}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <DeregisterDialog project={project} onSuccess={() => {}} />
                  <Button
                    size="sm"
                    onClick={() =>
                      navigate({
                        to: "/projects/$projectId",
                        params: { projectId: project.projectUUID },
                      })
                    }
                  >
                    Open
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Register project
            </h2>
            <RegisterForm onSuccess={() => {}} />
          </div>
        </>
      )}
    </div>
  );
};
