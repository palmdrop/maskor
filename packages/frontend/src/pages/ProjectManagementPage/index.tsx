import { useListProjects } from "@api/generated/projects/projects";
import { ProjectRow } from "./components/ProjectRow";

export const ProjectManagementPage = () => {
  const { data: envelope, isLoading, isError } = useListProjects();

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading projects...</p>;
  }

  if (isError || !envelope) {
    return <p className="p-8 text-sm text-destructive">Failed to load projects.</p>;
  }

  const projects = envelope.status === 200 ? envelope.data : [];

  return (
    <div className="mx-auto max-w-2xl p-8 flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-lg font-medium">Projects</h1>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No projects registered. Use one of the cards below to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <ProjectRow key={project.projectUUID} project={project} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Register project
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            className="flex flex-col gap-2 rounded-lg border border-border px-4 py-4 text-left hover:bg-muted/50"
            onClick={() => console.log("adopt existing folder")}
          >
            <span className="text-sm font-medium">Adopt existing folder</span>
            <span className="text-xs text-muted-foreground">
              Point Maskor at an existing vault or folder.
            </span>
          </button>
          <button
            type="button"
            className="flex flex-col gap-2 rounded-lg border border-border px-4 py-4 text-left hover:bg-muted/50"
            onClick={() => console.log("create new project")}
          >
            <span className="text-sm font-medium">Create new project</span>
            <span className="text-xs text-muted-foreground">
              Pick any path and Maskor creates it.
            </span>
          </button>
          <button
            type="button"
            className="flex flex-col gap-2 rounded-lg border border-border px-4 py-4 text-left hover:bg-muted/50"
            onClick={() => console.log("maskor-managed folder")}
          >
            <span className="text-sm font-medium">Use Maskor-managed folder</span>
            <span className="text-xs text-muted-foreground">
              Just type a name; Maskor handles the rest.
            </span>
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Settings
        </h2>
        <p className="text-sm text-muted-foreground">Settings coming soon.</p>
      </section>
    </div>
  );
};
