import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDeleteProject,
  getListProjectsQueryKey,
} from "../../../api/generated/projects/projects";
import type { Project } from "../../../api/generated/maskorAPI.schemas";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";

export const DeregisterDialog = ({
  project,
  onSuccess,
}: {
  project: Project;
  onSuccess: () => void;
}) => {
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
