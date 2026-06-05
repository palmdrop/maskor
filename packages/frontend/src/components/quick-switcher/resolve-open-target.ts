export type EntityKind = "fragment" | "aspect" | "note" | "reference" | "sequence";

export type CurrentRouteKind =
  | "fragment-editor"
  | "suggestion-mode"
  | "aspect-editor"
  | "note-editor"
  | "reference-editor"
  | "overview"
  | "other";

// Maps router match route ids (the same strings TanStack Router uses for
// `useParams({ from })`) to a coarse "what kind of view is mounted" label.
// Keep in sync with packages/frontend/src/router.ts.
const ROUTE_ID_TO_KIND: Record<string, CurrentRouteKind> = {
  "/projects/$projectId/fragments/$fragmentId": "fragment-editor",
  "/projects/$projectId/suggestion": "suggestion-mode",
  "/projects/$projectId/aspects/$aspectId": "aspect-editor",
  "/projects/$projectId/notes/$noteId": "note-editor",
  "/projects/$projectId/references/$referenceId": "reference-editor",
  "/projects/$projectId/overview": "overview",
};

// Pick the innermost (most specific) matched route as the active view kind.
export const classifyRoute = (matchedRouteIds: readonly string[]): CurrentRouteKind => {
  for (let index = matchedRouteIds.length - 1; index >= 0; index--) {
    const kind = ROUTE_ID_TO_KIND[matchedRouteIds[index]!];
    if (kind) {
      return kind;
    }
  }
  return "other";
};

export type OpenTarget = {
  to: string;
  params: Record<string, string>;
  search?:
    | Record<string, unknown>
    | ((previous: Record<string, unknown>) => Record<string, unknown>);
};

// Implements the open-semantics table in specifications/quick-switcher.md.
//
// Principle: the current view stays mounted iff it natively renders the picked
// entity type as its primary content. Otherwise the switcher navigates to the
// entity's canonical route. A sequence pick is always paired with a navigation
// to Overview regardless of current view.
//
// Same-route navigations (fragment editor → another fragment, aspect editor →
// another aspect, overview → same overview with a new sequence) all flow
// through router.navigate; TanStack Router resolves them as a route swap
// (param change → component remount via key) or a search update.
export const resolveOpenTarget = (
  currentRoute: CurrentRouteKind,
  picked: { kind: EntityKind; uuid: string },
  projectId: string,
): OpenTarget => {
  switch (picked.kind) {
    case "fragment":
      if (currentRoute === "suggestion-mode") {
        return {
          to: "/projects/$projectId/suggestion",
          params: { projectId },
          search: { fragment: picked.uuid },
        };
      }
      return {
        to: "/projects/$projectId/fragments/$fragmentId",
        params: { projectId, fragmentId: picked.uuid },
      };
    case "aspect":
      return {
        to: "/projects/$projectId/aspects/$aspectId",
        params: { projectId, aspectId: picked.uuid },
      };
    case "note":
      return {
        to: "/projects/$projectId/notes/$noteId",
        params: { projectId, noteId: picked.uuid },
      };
    case "reference":
      return {
        to: "/projects/$projectId/references/$referenceId",
        params: { projectId, referenceId: picked.uuid },
      };
    case "sequence":
      // Preserve detail level when already on overview by merging into previous
      // search; cross-route navigations let the overview route's validator
      // default the detail level (currently "prose").
      return {
        to: "/projects/$projectId/overview",
        params: { projectId },
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          sequence: picked.uuid,
        }),
      };
  }
};
