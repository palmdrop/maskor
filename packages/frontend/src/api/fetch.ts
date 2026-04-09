import { ApiRequestError } from "./errors";

export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const response = await fetch(`/api${url}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiRequestError(response.status, body);
  }
  const data = response.status === 204 ? undefined : await response.json();
  return { data, status: response.status, headers: response.headers } as T;
};
