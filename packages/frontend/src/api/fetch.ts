import { ApiRequestError } from "./errors";

export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const response = await fetch(`/api${url}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiRequestError(response.status, body);
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
