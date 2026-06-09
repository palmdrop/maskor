import { ApiRequestError } from "./errors";

export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const response = await fetch(`/api${url}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    // Read from the header, not the body: error responses are built by various
    // paths (e.g. throwStorageError constructs its own response), but the
    // correlation id is stamped on every error response in app.onError.
    const correlationId = response.headers.get("X-Correlation-Id") ?? undefined;
    throw new ApiRequestError(response.status, body, correlationId);
  }
  const data = response.status === 204 ? undefined : await parseBody(response);
  return { data, status: response.status, headers: response.headers } as T;
};

const parseBody = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.blob();
};
