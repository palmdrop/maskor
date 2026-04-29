import {
  createRouter,
  createRoute,
  createRootRouteWithContext,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { ProjectSelectionPage } from "./pages/ProjectSelectionPage";
import { ProjectShellLayout } from "./pages/ProjectShellLayout";
import { FragmentListPage } from "./pages/FragmentListPage";
import { FragmentPage } from "./pages/FragmentPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectConfigPage } from "./pages/ProjectConfigPage";
import { NoteEditorPage } from "./pages/NoteEditorPage";
import { ReferenceEditorPage } from "./pages/ReferenceEditorPage";
import { AspectEditorPage } from "./pages/AspectEditorPage";
import { queryClient } from "./queryClient";

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectSelectionPage,
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

const overviewRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/overview",
  component: OverviewPage,
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
});

const referenceEditorRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/references/$referenceId",
  component: ReferenceEditorPage,
});

const aspectEditorRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/aspects/$aspectId",
  component: AspectEditorPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectShellLayoutRoute.addChildren([
    projectShellIndexRoute,
    fragmentListRoute.addChildren([fragmentRoute]),
    overviewRoute,
    projectConfigRoute,
    noteEditorRoute,
    referenceEditorRoute,
    aspectEditorRoute,
  ]),
]);

export const router = createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
