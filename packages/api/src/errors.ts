import { HTTPException } from "hono/http-exception";
import {
  ProjectNotFoundError,
  ProjectConflictError,
  VaultUUIDConflictError,
  ExistingVaultManifestError,
  DraftError,
  SwapEntityTypeError,
} from "@maskor/storage";
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

  if (error instanceof ProjectConflictError) {
    throw new HTTPException(409, {
      res: errorResponse({ error: "CONFLICT", message: error.message }, 409),
    });
  }

  if (error instanceof VaultUUIDConflictError) {
    throw new HTTPException(409, {
      res: errorResponse({ error: "UUID_CONFLICT", message: error.message }, 409),
    });
  }

  if (error instanceof ExistingVaultManifestError) {
    throw new HTTPException(409, {
      res: errorResponse({ error: "EXISTING_MANIFEST", message: error.message }, 409),
    });
  }

  if (error instanceof SwapEntityTypeError) {
    throw new HTTPException(400, {
      res: errorResponse(
        { error: "SWAP_UNKNOWN_ENTITY_TYPE", message: error.message, entityType: error.entityType },
        400,
      ),
    });
  }

  if (error instanceof DraftError) {
    switch (error.code) {
      case "DRAFT_NOT_FOUND":
        throw new HTTPException(404, {
          res: errorResponse({ error: "NOT_FOUND", message: error.message }, 404),
        });
      case "DRAFT_NAME_CONFLICT":
        throw new HTTPException(409, {
          res: errorResponse({ error: "DRAFT_NAME_CONFLICT", message: error.message }, 409),
        });
      case "DRAFT_OPERATION_IN_PROGRESS":
        throw new HTTPException(409, {
          res: errorResponse(
            { error: "DRAFT_OPERATION_IN_PROGRESS", message: error.message },
            409,
          ),
        });
      case "INSUFFICIENT_DISK_SPACE":
        throw new HTTPException(507, {
          res: errorResponse(
            { error: "INSUFFICIENT_DISK_SPACE", message: error.message, details: error.details },
            507,
          ),
        });
      case "DRAFT_INVALID_NAME":
        throw new HTTPException(400, {
          res: errorResponse({ error: "DRAFT_INVALID_NAME", message: error.message }, 400),
        });
      default:
        throw new HTTPException(500, {
          res: errorResponse({ error: "INTERNAL_ERROR", message: error.message }, 500),
        });
    }
  }

  if (error instanceof VaultError) {
    switch (error.code) {
      case "FRAGMENT_NOT_FOUND":
      case "ENTITY_NOT_FOUND":
      case "SEQUENCE_NOT_FOUND":
        throw new HTTPException(404, {
          res: errorResponse({ error: "NOT_FOUND", message: error.message }, 404),
        });
      case "KEY_CONFLICT":
      case "FRAGMENT_NOT_DISCARDED": {
        const body: Record<string, unknown> = { error: "CONFLICT", message: error.message };
        if (error.context.reason) body.reason = error.context.reason;
        throw new HTTPException(409, { res: errorResponse(body, 409) });
      }
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
