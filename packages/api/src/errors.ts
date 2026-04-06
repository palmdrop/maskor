import { ProjectNotFoundError } from "@maskor/storage";
import { VaultError } from "@maskor/storage";

type ErrorResponseBody = {
  error: string;
  message: string;
  hint?: string;
};

const jsonResponse = (body: ErrorResponseBody, status: number): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

export const handleStorageError = (error: unknown): Response => {
  if (error instanceof ProjectNotFoundError) {
    return jsonResponse({ error: "NOT_FOUND", message: error.message }, 404);
  }

  if (error instanceof VaultError) {
    switch (error.code) {
      case "FRAGMENT_NOT_FOUND":
      case "ENTITY_NOT_FOUND":
        return jsonResponse({ error: "NOT_FOUND", message: error.message }, 404);
      case "STALE_INDEX":
        return jsonResponse(
          { error: "NOT_FOUND", message: error.message, hint: "index_may_be_stale" },
          404,
        );
      default:
        return jsonResponse({ error: "INTERNAL_ERROR", message: error.message }, 500);
    }
  }

  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  return jsonResponse({ error: "INTERNAL_ERROR", message }, 500);
};
