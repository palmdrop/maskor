import { useQueryClient, type QueryKey, type UseMutationOptions } from "@tanstack/react-query";

/**
 * Context threaded from `onMutate` to `onError`/`onSuccess`: the pre-mutation
 * snapshot of the optimistic target, used to roll back on failure.
 */
export type OptimisticMutationContext<TCache> = { snapshot: TCache | undefined };

export type OptimisticMutationConfig<TCache, TVariables, TResponse> = {
  /** The query whose cache entry is optimistically updated, snapshotted, and rolled back. */
  queryKey: QueryKey;
  /**
   * Pure reducer producing the next cache value from the previous one and the mutation
   * variables. Owns the envelope/`status` guard so the primitive stays cache-shape-agnostic.
   */
  apply: (previous: TCache | undefined, variables: TVariables) => TCache | undefined;
  /**
   * When present, the authoritative server response is written back into the target on
   * success — no refetch flicker. When absent, the target is invalidated instead.
   */
  reconcile?: (previous: TCache | undefined, response: TResponse) => TCache | undefined;
  /** Extra query keys to invalidate on success, regardless of reconcile vs. invalidate. */
  invalidate?: QueryKey[];
  /**
   * Query keys to invalidate on settle — after success *or* error. Mirrors the editors'
   * `finally { invalidateActionLog() }`: the action log must refresh whether the save
   * landed or failed (a failed command records its own `command:error` entry).
   */
  settleInvalidate?: QueryKey[];
};

/** The slice of orval's `mutation` option this primitive owns. */
export type OptimisticMutationOptions<TCache, TVariables, TResponse, TError> = Pick<
  UseMutationOptions<TResponse, TError, TVariables, OptimisticMutationContext<TCache>>,
  "onMutate" | "onError" | "onSuccess" | "onSettled"
>;

/**
 * Produces the `{ onMutate, onError, onSuccess }` config for any orval mutation that wants
 * the snapshot / optimistic-apply / rollback / settle lifecycle. Spread the result into
 * orval's existing `mutation:` option — it never wraps or hides the generated hook.
 *
 * The lifecycle:
 * - `onMutate`: cancel in-flight queries, snapshot the target, apply the reducer.
 * - `onError`: restore the snapshot.
 * - `onSuccess`: reconcile the authoritative response into the target (if `reconcile` is
 *   given) or invalidate it, then invalidate every `invalidate[]` key.
 * - `onSettled`: invalidate every `settleInvalidate[]` key (success or error).
 *
 * `customFetch` throws `ApiRequestError` on any non-2xx, so `onError` fires precisely when
 * the request fails — the rollback is correct without any in-band status checking here.
 */
export const useOptimisticMutation = <TCache, TVariables, TResponse = unknown, TError = unknown>(
  config: OptimisticMutationConfig<TCache, TVariables, TResponse>,
): OptimisticMutationOptions<TCache, TVariables, TResponse, TError> => {
  const queryClient = useQueryClient();
  const { queryKey, apply, reconcile, invalidate, settleInvalidate } = config;

  return {
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<TCache>(queryKey);
      queryClient.setQueryData<TCache>(queryKey, (previous) => apply(previous, variables));
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(queryKey, context.snapshot);
      }
    },
    onSuccess: (response) => {
      if (reconcile) {
        queryClient.setQueryData<TCache>(queryKey, (previous) => reconcile(previous, response));
      } else {
        void queryClient.invalidateQueries({ queryKey });
      }
      for (const key of invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onSettled: () => {
      for (const key of settleInvalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  };
};
