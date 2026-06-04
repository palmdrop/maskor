import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { projectIdParamSchema } from "../schemas/shared";
import {
  SuggestionNextResponseSchema,
  SuggestionNextQuerySchema,
  SuggestionVisitParamSchema,
  SuggestionPickParamSchema,
  SuggestionCurrentResponseSchema,
  SuggestionSetCurrentParamSchema,
  SuggestionSetCurrentBodySchema,
} from "../schemas/suggestion";
import { ErrorResponseSchema } from "../schemas/error";

export const suggestionRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const getCurrentSuggestionRoute = createRoute({
  operationId: "getCurrentSuggestion",
  method: "get",
  path: "/current",
  tags: ["Suggestion"],
  summary: "Get the current/active suggested fragment for suggestion mode",
  request: {
    params: projectIdParamSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: SuggestionCurrentResponseSchema } },
      description: "Current suggestion or null when no current suggestion is set",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const getNextSuggestionRoute = createRoute({
  operationId: "getNextSuggestion",
  method: "get",
  path: "/next",
  tags: ["Suggestion"],
  summary: "Get the next suggested fragment for suggestion mode",
  request: {
    params: projectIdParamSchema,
    query: SuggestionNextQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: SuggestionNextResponseSchema } },
      description: "Next suggestion or null when pool is empty",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const recordVisitRoute = createRoute({
  operationId: "recordFragmentVisit",
  method: "post",
  path: "/visit/{fragmentId}",
  tags: ["Suggestion"],
  summary: "Record a voluntary fragment open outside suggestion mode",
  request: {
    params: SuggestionVisitParamSchema,
  },
  responses: {
    204: { description: "Visit recorded" },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const recordPickRoute = createRoute({
  operationId: "recordFragmentPick",
  method: "post",
  path: "/pick/{fragmentId}",
  tags: ["Suggestion"],
  summary:
    "Record an explicit user pick (e.g. quick-switcher): bumps voluntary_open_count, adds to cooldown, marks user-picked so the next getNext skips avoidance accounting for the picked fragment.",
  request: {
    params: SuggestionPickParamSchema,
  },
  responses: {
    204: { description: "Pick recorded" },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const setCurrentSuggestionRoute = createRoute({
  operationId: "setCurrentSuggestion",
  method: "put",
  path: "/current",
  tags: ["Suggestion"],
  summary:
    "Set the current-suggestion pointer to a specific fragment (e.g. after browser back-navigation).",
  request: {
    params: SuggestionSetCurrentParamSchema,
    body: {
      content: { "application/json": { schema: SuggestionSetCurrentBodySchema } },
      required: true,
    },
  },
  responses: {
    204: { description: "Pointer updated" },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

suggestionRouter.openapi(getCurrentSuggestionRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentUuid, avoidanceCount } =
      await storageService.suggestion.getCurrent(projectContext);

    if (!fragmentUuid) {
      return ctx.json({ fragment: null, avoidanceCount: 0 }, 200);
    }
    const fragment = await storageService.fragments.read(projectContext, fragmentUuid);
    return ctx.json({ fragment, avoidanceCount }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

suggestionRouter.openapi(getNextSuggestionRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { exclude } = ctx.req.valid("query");

    const project = await storageService.getProject(projectContext.projectUUID);
    const readinessThreshold = project.suggestion.readinessThreshold;

    const { fragmentUuid, avoidanceCount } = await storageService.suggestion.getNext(
      projectContext,
      exclude,
      readinessThreshold,
    );

    if (!fragmentUuid) {
      return ctx.json({ fragment: null, avoidanceCount: 0 }, 200);
    }

    const fragment = await storageService.fragments.read(projectContext, fragmentUuid);
    return ctx.json({ fragment, avoidanceCount }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

suggestionRouter.openapi(recordVisitRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("param");

    storageService.suggestion.recordVisit(projectContext, fragmentId);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});

suggestionRouter.openapi(recordPickRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("param");

    await storageService.suggestion.recordPick(projectContext, fragmentId);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});

suggestionRouter.openapi(setCurrentSuggestionRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("json");

    await storageService.suggestion.setCurrent(projectContext, fragmentId);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});
