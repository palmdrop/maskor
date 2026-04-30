import { useNavigate } from "@tanstack/react-router";
import { useListProjects } from "../../api/generated/projects/projects";
import { Button } from "../../components/ui/button";
import { RegisterForm } from "./components/RegisterForm";
import { DeregisterDialog } from "./components/DeregisterDialog";

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
