import { HTTPException } from "hono/http-exception";
import { ProjectNotFoundError } from "@maskor/storage";
import { VaultError } from "@maskor/storage";

const errorResponse = (body: Record<string, unknown>, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Always throws — returns never so catch blocks that call this don't widen the handler return type.
// The thrown HTTPException is caught by app.onError and converted to a Response.
export const throwStorageError = (error: unknown): never => {
  if (error instanceof ProjectNotFoundError) {
    throw new HTTPException(404, {
      res: errorResponse({ error: "NOT_FOUND", message: error.message }, 404),
    });
  }

  if (error instanceof VaultError) {
    switch (error.code) {
      case "FRAGMENT_NOT_FOUND":
      case "ENTITY_NOT_FOUND":
        throw new HTTPException(404, {
          res: errorResponse({ error: "NOT_FOUND", message: error.message }, 404),
        });
      case "STALE_INDEX":
        throw new HTTPException(503, {
          res: errorResponse(
            {
              error: "SERVICE_UNAVAILABLE",
              message: "Index is temporarily out of sync, please retry.",
              hint: "index_may_be_stale",
            },
            503,
          ),
        });
      default:
        throw new HTTPException(500, {
          res: errorResponse({ error: "INTERNAL_ERROR", message: error.message }, 500),
        });
    }
  }

  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  throw new HTTPException(500, {
    res: errorResponse({ error: "INTERNAL_ERROR", message }, 500),
  });
};
