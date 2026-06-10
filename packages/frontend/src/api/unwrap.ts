/**
 * Narrows a resolved orval response envelope to its success `data`.
 *
 * `customFetch` throws `ApiRequestError` on any non-2xx, so a promise that resolved
 * carries the success variant — the per-call `if (result.status !== 200) throw …`
 * checks the editors used to do were unreachable dead code (and, worse, would have
 * stripped the correlation id the command system relies on). This helper replaces
 * them: it trusts the throw-on-failure contract and types the result as the 200 data.
 *
 * Use it on the resolved result of a `mutateAsync` / awaited fetch — not on a React
 * Query `data` field, which can be `undefined` while loading and must be guarded.
 */
export const unwrap = <T extends { status: number; data: unknown }>(
  envelope: T,
): Extract<T, { status: 200 }>["data"] => (envelope as Extract<T, { status: 200 }>).data;
