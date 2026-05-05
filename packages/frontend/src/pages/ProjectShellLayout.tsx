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

  const linkClassName =
    "rounded px-3 py-1.5 text-sm hover:bg-muted [&.active]:bg-accent [&.active]:text-accent-foreground";

  return (
    <div className="flex flex-col h-screen">
      <nav className="flex flex-row w-screen gap-1 shrink-0 border-b border-border p-0">
        <Link to="/" className={linkClassName}>
          {`<`}
        </Link>
        <Link
          to="/projects/$projectId/config"
          params={{ projectId }}
          className={linkClassName}
          search={{
            tab: "general",
          }}
        >
          {projectName}
        </Link>
        <Link to="/projects/$projectId/fragments" params={{ projectId }} className={linkClassName}>
          Fragments
        </Link>
        <Link to="/projects/$projectId/overview" params={{ projectId }} className={linkClassName}>
          Overview
        </Link>
      </nav>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
};
