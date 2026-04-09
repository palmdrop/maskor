import {
  createRouter,
  createRoute,
  createRootRouteWithContext,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { ProjectSelectionPage } from "./pages/ProjectSelectionPage";
import { ProjectShellPage } from "./pages/ProjectShellPage";
import { getListProjectsQueryOptions } from "./api/generated/projects/projects";

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async ({ context: { queryClient } }) => {
    // Pre-populate TQ cache so ProjectSelectionPage renders without a second fetch.
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

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectShellPage,
});

const routeTree = rootRoute.addChildren([indexRoute, projectRoute]);

export const router = createRouter({ routeTree, context: { queryClient: undefined! } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
