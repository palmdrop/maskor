import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useGetProject } from "@api/generated/projects/projects";
import { useVaultEvents } from "@hooks/useVaultEvents";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { projectShellScope, type CreateKind } from "@lib/commands/scopes/project-shell";
import { RebuildStatusProvider } from "@contexts/RebuildStatusContext";
import { GlobalCreateDialogs, type ActiveCreate } from "@components/global-create-dialogs";
import { ExportDialog } from "@components/ExportDialog";
import { QuickSwitcher } from "@components/quick-switcher/QuickSwitcher";
import {
  resolveLastFragmentView,
  resolveLastOverviewView,
  resolveLastPreviewView,
} from "@lib/nav-state";

export const ProjectShellLayout = () => {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const { data: envelope } = useGetProject(projectId);
  const [activeCreate, setActiveCreate] = useState<ActiveCreate>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportInitialSequenceId, setExportInitialSequenceId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Publish the navbar height so the editor's focus-mode overlay (a fixed,
  // viewport-anchored layer) can start exactly below the navbar instead of
  // covering it. Tracked live since the navbar height is content-driven.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const apply = () =>
      document.documentElement.style.setProperty("--app-navbar-height", `${nav.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  useVaultEvents(projectId);

  const openCreate = useCallback((kind: CreateKind) => {
    setActiveCreate(kind);
  }, []);

  const openExport = useCallback((sequenceId?: string | null) => {
    setExportInitialSequenceId(sequenceId ?? null);
    setExportOpen(true);
  }, []);

  useCommandScope(projectShellScope, { projectId, openCreate, openExport });

  const projectName = envelope?.status === 200 ? envelope.data.name : null;

  const linkClassName =
    "rounded px-3 py-1.5 text-sm hover:bg-muted [&.active]:bg-accent [&.active]:text-accent-foreground";

  const lastFragment = resolveLastFragmentView(projectId);
  const lastOverview = resolveLastOverviewView(projectId);
  const lastPreview = resolveLastPreviewView(projectId);

  return (
    <div className="flex flex-col h-screen">
      <nav
        ref={navRef}
        className="relative z-50 flex flex-row w-screen gap-1 shrink-0 border-b border-border bg-background p-0"
      >
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
        {/* The link points to the list route (parent) so TanStack Router marks it
            active regardless of whether a fragment is open. On click, intercept to
            restore the last-opened fragment if one is stored. */}
        <Link
          to="/projects/$projectId/fragments"
          params={{ projectId }}
          className={linkClassName}
          onClick={(event) => {
            if (lastFragment.kind === "fragment") {
              event.preventDefault();
              void navigate({
                to: "/projects/$projectId/fragments/$fragmentId",
                params: { projectId, fragmentId: lastFragment.fragmentId },
              });
            }
          }}
        >
          Fragments
        </Link>
        <Link
          to="/projects/$projectId/overview"
          params={{ projectId }}
          className={linkClassName}
          search={lastOverview.sequence ? { sequence: lastOverview.sequence } : {}}
        >
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
        <Link
          to="/projects/$projectId/preview"
          params={{ projectId }}
          className={linkClassName}
          search={lastPreview.sequence ? { sequence: lastPreview.sequence } : {}}
        >
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
      <ExportDialog
        projectId={projectId}
        open={exportOpen}
        onOpenChange={(nextOpen) => {
          setExportOpen(nextOpen);
          if (!nextOpen) setExportInitialSequenceId(null);
        }}
        initialSequenceId={exportInitialSequenceId}
      />
      <QuickSwitcher projectId={projectId} />
    </div>
  );
};
