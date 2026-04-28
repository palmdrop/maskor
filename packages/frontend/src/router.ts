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
import { getListProjectsQueryOptions } from "./api/generated/projects/projects";
import { queryClient } from "./queryClient";

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async ({ context: { queryClient } }) => {
    const envelope = await queryClient.ensureQueryData(getListProjectsQueryOptions());
    const projects = envelope.status === 200 ? envelope.data : [];
    if (projects.length === 1) {
      throw redirect({
        to: "/projects/$projectId",
        params: { projectId: projects[0].projectUUID },
      });
    }
  },
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

const projectConfigRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/config",
  component: ProjectConfigPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectShellLayoutRoute.addChildren([
    projectShellIndexRoute,
    fragmentListRoute.addChildren([fragmentRoute]),
    overviewRoute,
    projectConfigRoute,
  ]),
]);

export const router = createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
