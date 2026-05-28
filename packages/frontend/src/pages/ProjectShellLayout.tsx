import { useCallback, useState } from "react";
import { Link, Outlet, useParams } from "@tanstack/react-router";
import { useGetProject } from "@api/generated/projects/projects";
import { useVaultEvents } from "@hooks/useVaultEvents";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { projectShellScope, type CreateKind } from "@lib/commands/scopes/project-shell";
import { RebuildStatusProvider } from "@contexts/RebuildStatusContext";
import { GlobalCreateDialogs, type ActiveCreate } from "@components/global-create-dialogs";
import { QuickSwitcher } from "@components/quick-switcher/QuickSwitcher";

export const ProjectShellLayout = () => {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const { data: envelope } = useGetProject(projectId);
  const [activeCreate, setActiveCreate] = useState<ActiveCreate>(null);

  useVaultEvents(projectId);

  const openCreate = useCallback((kind: CreateKind) => {
    setActiveCreate(kind);
  }, []);

  useCommandScope(projectShellScope, { openCreate });

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
        <Link to="/projects/$projectId/suggestion" params={{ projectId }} className={linkClassName}>
          Edit
        </Link>
        <Link to="/projects/$projectId/stats" params={{ projectId }} className={linkClassName}>
          Stats
        </Link>
        <Link to="/projects/$projectId/history" params={{ projectId }} className={linkClassName}>
          History
        </Link>
        <Link to="/projects/$projectId/preview" params={{ projectId }} className={linkClassName}>
          Preview
        </Link>
        <Link to="/projects/$projectId/drafts" params={{ projectId }} className={linkClassName}>
          Drafts
        </Link>
      </nav>
      <div className="flex-1 min-h-0 overflow-hidden">
        <RebuildStatusProvider projectId={projectId}>
          <Outlet />
        </RebuildStatusProvider>
      </div>
      <GlobalCreateDialogs
        projectId={projectId}
        activeCreate={activeCreate}
        onClose={() => setActiveCreate(null)}
      />
      <QuickSwitcher projectId={projectId} />
    </div>
  );
};
