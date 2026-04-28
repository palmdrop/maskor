import { Link, Outlet, useParams } from "@tanstack/react-router";
import { useGetProject } from "../api/generated/projects/projects";
import { useVaultEvents } from "../hooks/useVaultEvents";
import { useKeyboardNav } from "../hooks/useKeyboardNav";

export const ProjectShellLayout = () => {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const { data: envelope } = useGetProject(projectId);

  useVaultEvents(projectId);
  useKeyboardNav(projectId);

  const projectName = envelope?.status === 200 ? envelope.data.name : null;

  return (
    <div className="flex h-screen">
      <nav className="flex flex-col gap-1 w-48 shrink-0 border-r border-border p-4">
        {projectName && (
          <p className="mb-3 truncate text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {projectName}
          </p>
        )}
        <Link
          to="/projects/$projectId/fragments"
          params={{ projectId }}
          activeOptions={{ includeChildren: true }}
          className="rounded px-3 py-1.5 text-sm hover:bg-muted [&.active]:bg-accent [&.active]:text-accent-foreground"
        >
          Fragments
        </Link>
        <Link
          to="/projects/$projectId/overview"
          params={{ projectId }}
          className="rounded px-3 py-1.5 text-sm hover:bg-muted [&.active]:bg-accent [&.active]:text-accent-foreground"
        >
          Overview
        </Link>
        <Link
          to="/projects/$projectId/config"
          params={{ projectId }}
          className="rounded px-3 py-1.5 text-sm hover:bg-muted [&.active]:bg-accent [&.active]:text-accent-foreground"
        >
          Config
        </Link>
      </nav>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
};
