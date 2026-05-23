import {
  createRouter,
  createRoute,
  createRootRouteWithContext,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { ProjectManagementPage } from "./pages/ProjectManagementPage";
import { ProjectShellLayout } from "./pages/ProjectShellLayout";
import { FragmentListPage } from "./pages/FragmentListPage";
import { FragmentPage } from "./pages/FragmentPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectConfigPage } from "./pages/ProjectConfigPage";
import { NoteEditorPage } from "./pages/NoteEditorPage";
import { ReferenceEditorPage } from "./pages/ReferenceEditorPage";
import { AspectEditorPage } from "./pages/AspectEditorPage";
import { SuggestionModePage } from "./pages/SuggestionModePage";
import { ProjectStatsPage } from "./pages/ProjectStatsPage";
import { ProjectHistoryPage } from "./pages/ProjectHistoryPage";
import { FragmentImportPage } from "./pages/FragmentImportPage";
import { PreviewPage } from "./pages/PreviewPage";
import { DraftsPage } from "./pages/DraftsPage";
import { queryClient } from "./queryClient";

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectManagementPage,
});

const projectShellLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectShellLayout,
});

const projectShellIndexRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/fragments",
      params: { projectId: params.projectId },
    });
  },
});

const fragmentListRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/fragments",
  component: FragmentListPage,
});

const fragmentRoute = createRoute({
  getParentRoute: () => fragmentListRoute,
  path: "/$fragmentId",
  component: FragmentPage,
});

const validDensities = ["full", "compact", "mini"] as const;
export type OverviewDensity = (typeof validDensities)[number];

export const parseOverviewDensity = (value: unknown): OverviewDensity =>
  validDensities.includes(value as OverviewDensity) ? (value as OverviewDensity) : "full";

const overviewRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/overview",
  component: OverviewPage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { sequence?: string; density: OverviewDensity } => ({
    sequence: typeof search.sequence === "string" ? search.sequence : undefined,
    density: parseOverviewDensity(search.density),
  }),
});

const validTabs = ["general", "aspects", "notes", "references"] as const;
type ConfigTab = (typeof validTabs)[number];

const projectConfigRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/config",
  component: ProjectConfigPage,
  validateSearch: (search: Record<string, unknown>): { tab: ConfigTab } => ({
    tab: validTabs.includes(search.tab as ConfigTab) ? (search.tab as ConfigTab) : "general",
  }),
});

const noteEditorRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/notes/$noteId",
  component: NoteEditorPage,
  validateSearch: (search: Record<string, unknown>): { from?: string } => ({
    from: typeof search.from === "string" ? search.from : undefined,
  }),
});

const referenceEditorRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/references/$referenceId",
  component: ReferenceEditorPage,
  validateSearch: (search: Record<string, unknown>): { from?: string } => ({
    from: typeof search.from === "string" ? search.from : undefined,
  }),
});

const aspectEditorRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/aspects/$aspectId",
  component: AspectEditorPage,
});

const suggestionModeRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/suggestion",
  component: SuggestionModePage,
  validateSearch: (search: Record<string, unknown>): { fragment?: string } => ({
    fragment: typeof search.fragment === "string" ? search.fragment : undefined,
  }),
});

const projectStatsRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/stats",
  component: ProjectStatsPage,
});

const historyRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/history",
  component: ProjectHistoryPage,
});

const fragmentImportRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/fragments/import",
  component: FragmentImportPage,
});

const previewRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/preview",
  component: PreviewPage,
  validateSearch: (search: Record<string, unknown>): { sequence?: string } => ({
    sequence: typeof search.sequence === "string" ? search.sequence : undefined,
  }),
});

const draftsRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/drafts",
  component: DraftsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectShellLayoutRoute.addChildren([
    projectShellIndexRoute,
    fragmentListRoute.addChildren([fragmentRoute]),
    fragmentImportRoute,
    previewRoute,
    draftsRoute,
    overviewRoute,
    projectConfigRoute,
    noteEditorRoute,
    referenceEditorRoute,
    aspectEditorRoute,
    suggestionModeRoute,
    projectStatsRoute,
    historyRoute,
  ]),
]);

export const router = createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
