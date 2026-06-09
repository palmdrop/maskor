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
import { RouteErrorComponent } from "./components/data/RouteErrorComponent";
import { ViewPending } from "./components/data/ViewPending";
import {
  getListFragmentsQueryOptions,
  getGetFragmentQueryOptions,
  getListFragmentSummariesQueryOptions,
} from "./api/generated/fragments/fragments";
import {
  getGetProjectQueryOptions,
  getListProjectsQueryOptions,
} from "./api/generated/projects/projects";
import { getListSequencesQueryOptions } from "./api/generated/sequences/sequences";
import {
  getListAspectsQueryOptions,
  getGetAspectQueryOptions,
} from "./api/generated/aspects/aspects";
import { getListNotesQueryOptions, getGetNoteQueryOptions } from "./api/generated/notes/notes";
import {
  getListReferencesQueryOptions,
  getGetReferenceQueryOptions,
} from "./api/generated/references/references";
import { getListDraftsQueryOptions } from "./api/generated/drafts/drafts";
import { getGetProjectStatsQueryOptions } from "./api/generated/stats/stats";
import { getGetCurrentSuggestionQueryOptions } from "./api/generated/suggestion/suggestion";
import { getGetAssembledSequenceQueryOptions } from "./api/generated/preview/preview";
import { getActionLogQueryOptions } from "./api/action-log";
import { DEFAULT_PREVIEW_CONFIG, buildPreviewParams } from "./lib/preview/preview-params";

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectManagementPage,
  loader: ({ context: { queryClient: client } }) =>
    Promise.allSettled([client.ensureQueryData(getListProjectsQueryOptions())]),
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
  // Prefetch the fragment list so the sidebar renders without a loading flash;
  // allSettled means a failed load surfaces in-render via useSuspenseQuery
  // (caught by the route error boundary) rather than failing the navigation.
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([client.ensureQueryData(getListFragmentsQueryOptions(params.projectId))]),
});

const fragmentRoute = createRoute({
  getParentRoute: () => fragmentListRoute,
  path: "/$fragmentId",
  component: FragmentPage,
  // Prefetch the fragment plus the project/sequences the editor reads, in
  // parallel, so opening a fragment doesn't flash a loading state.
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([
      client.ensureQueryData(getGetFragmentQueryOptions(params.projectId, params.fragmentId)),
      client.ensureQueryData(getGetProjectQueryOptions(params.projectId)),
      client.ensureQueryData(getListSequencesQueryOptions(params.projectId)),
    ]),
});

const validDetailLevels = ["prose", "excerpt", "title"] as const;
export type OverviewDetailLevel = (typeof validDetailLevels)[number];

export const parseOverviewDetailLevel = (value: unknown): OverviewDetailLevel =>
  validDetailLevels.includes(value as OverviewDetailLevel)
    ? (value as OverviewDetailLevel)
    : "prose";

const overviewRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/overview",
  component: OverviewPage,
  // Prefetch the four non-conditional reads in parallel. The sequence-contents
  // query is dependent on the resolved sequence and stays a classic useQuery in
  // the ready tree (see OverviewPage).
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([
      client.ensureQueryData(getGetProjectQueryOptions(params.projectId)),
      client.ensureQueryData(getListSequencesQueryOptions(params.projectId)),
      client.ensureQueryData(getListFragmentSummariesQueryOptions(params.projectId)),
      client.ensureQueryData(getListAspectsQueryOptions(params.projectId)),
    ]),
  validateSearch: (
    search: Record<string, unknown>,
  ): { sequence?: string; detail?: OverviewDetailLevel } => ({
    sequence: typeof search.sequence === "string" ? search.sequence : undefined,
    detail:
      typeof search.detail === "string" &&
      validDetailLevels.includes(search.detail as OverviewDetailLevel)
        ? (search.detail as OverviewDetailLevel)
        : undefined,
  }),
});

const validTabs = ["general", "aspects", "notes", "references", "diagnostics"] as const;
type ConfigTab = (typeof validTabs)[number];

const projectConfigRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/config",
  component: ProjectConfigPage,
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([client.ensureQueryData(getGetProjectQueryOptions(params.projectId))]),
  validateSearch: (search: Record<string, unknown>): { tab: ConfigTab } => ({
    tab: validTabs.includes(search.tab as ConfigTab) ? (search.tab as ConfigTab) : "general",
  }),
});

const noteEditorRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/notes/$noteId",
  component: NoteEditorPage,
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([
      client.ensureQueryData(getGetNoteQueryOptions(params.projectId, params.noteId)),
      client.ensureQueryData(getListNotesQueryOptions(params.projectId)),
    ]),
  validateSearch: (search: Record<string, unknown>): { from?: string } => ({
    from: typeof search.from === "string" ? search.from : undefined,
  }),
});

const referenceEditorRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/references/$referenceId",
  component: ReferenceEditorPage,
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([
      client.ensureQueryData(getGetReferenceQueryOptions(params.projectId, params.referenceId)),
      client.ensureQueryData(getListReferencesQueryOptions(params.projectId)),
    ]),
  validateSearch: (search: Record<string, unknown>): { from?: string } => ({
    from: typeof search.from === "string" ? search.from : undefined,
  }),
});

const aspectEditorRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/aspects/$aspectId",
  component: AspectEditorPage,
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([
      client.ensureQueryData(getGetAspectQueryOptions(params.projectId, params.aspectId)),
      client.ensureQueryData(getListAspectsQueryOptions(params.projectId)),
      client.ensureQueryData(getListNotesQueryOptions(params.projectId)),
    ]),
});

const suggestionModeRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/suggestion",
  component: SuggestionModePage,
  // Prefetch the current suggestion so the initial load doesn't flash; the
  // view keeps its own in-place handling for the loadNext/save flow.
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([
      client.ensureQueryData(getGetCurrentSuggestionQueryOptions(params.projectId)),
    ]),
  validateSearch: (search: Record<string, unknown>): { fragment?: string } => ({
    fragment: typeof search.fragment === "string" ? search.fragment : undefined,
  }),
});

const projectStatsRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/stats",
  component: ProjectStatsPage,
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([client.ensureQueryData(getGetProjectStatsQueryOptions(params.projectId))]),
});

const historyRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/history",
  component: ProjectHistoryPage,
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([
      client.ensureQueryData(getActionLogQueryOptions(params.projectId, 100)),
      client.ensureQueryData(getListFragmentsQueryOptions(params.projectId)),
      client.ensureQueryData(getListAspectsQueryOptions(params.projectId)),
      client.ensureQueryData(getListNotesQueryOptions(params.projectId)),
      client.ensureQueryData(getListReferencesQueryOptions(params.projectId)),
    ]),
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
  loaderDeps: ({ search }) => ({ sequence: search.sequence }),
  // Resolve the active sequence (URL param, else the main sequence) and the
  // server-side preview config, then prefetch the assembled markdown for the
  // exact query key the component reads — so the initial preview is ready with
  // no blank wait. Toggling an option later refetches in the background.
  loader: async ({ context: { queryClient: client }, params, deps }) => {
    const [projectResult, sequencesResult] = await Promise.allSettled([
      client.ensureQueryData(getGetProjectQueryOptions(params.projectId)),
      client.ensureQueryData(getListSequencesQueryOptions(params.projectId)),
    ]);
    const sequences =
      sequencesResult.status === "fulfilled" && sequencesResult.value.status === 200
        ? sequencesResult.value.data.sequences
        : [];
    const mainSequence = sequences.find((sequence) => sequence.isMain) ?? null;
    const activeSequenceUuid = deps.sequence ?? mainSequence?.uuid ?? null;
    if (!activeSequenceUuid) return;
    const project =
      projectResult.status === "fulfilled" && projectResult.value.status === 200
        ? projectResult.value.data
        : null;
    const previewConfig = project?.preview ?? DEFAULT_PREVIEW_CONFIG;
    await Promise.allSettled([
      client.ensureQueryData(
        getGetAssembledSequenceQueryOptions(
          params.projectId,
          activeSequenceUuid,
          buildPreviewParams(previewConfig),
        ),
      ),
    ]);
  },
});

const draftsRoute = createRoute({
  getParentRoute: () => projectShellLayoutRoute,
  path: "/drafts",
  component: DraftsPage,
  loader: ({ context: { queryClient: client }, params }) =>
    Promise.allSettled([client.ensureQueryData(getListDraftsQueryOptions(params.projectId))]),
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

export const router = createRouter({
  routeTree,
  context: { queryClient },
  // Per-route catch boundary fallback: ViewError + Retry wired to the query
  // reset. Falls back to the framework default for errors it can't describe.
  defaultErrorComponent: RouteErrorComponent,
  // Layout-stable blank shell shown while a route's loader is in flight.
  defaultPendingComponent: ViewPending,
  // Tuned for a fast local app: only reveal the placeholder once a load is
  // slow enough to perceive (skip it on fast loads), and keep it on screen long
  // enough to avoid a flash when it does show.
  defaultPendingMs: 200,
  defaultPendingMinMs: 300,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
