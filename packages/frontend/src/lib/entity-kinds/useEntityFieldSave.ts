import { useCallback } from "react";
import { getActionLogQueryKey } from "@api/action-log";
import { unwrap } from "@api/unwrap";
import {
  useOptimisticMutation,
  type OptimisticMutationConfig,
} from "@lib/api/useOptimisticMutation";
import {
  ENTITY_HOOKS,
  type EntityHooks,
  type EntityCache,
  type EntityFor,
  type EntityUpdateFor,
  type EntityUpdateResponseFor,
} from "./entityHooks";
import type { EntityKind } from "./registry";

/**
 * The one optimistic config shared by an entity's content and live-field saves: `apply` merges the
 * patch carried in the mutation variables; `reconcile` writes the authoritative entity from the
 * response (no refetch flicker); the list (and any extra key, e.g. fragment stats) invalidates; the
 * action log refreshes on settle. A pure builder so both `useEntityFieldSave` and `useEntityEditor`
 * derive their mutation options from the same source.
 */
export const buildEntityOptimisticConfig = <K extends EntityKind>(
  hooks: EntityHooks,
  projectId: string,
  uuid: string,
): OptimisticMutationConfig<
  EntityCache<EntityFor[K]>,
  { data: Partial<EntityUpdateFor[K]> },
  EntityUpdateResponseFor[K]
> => {
  type Entity = EntityFor[K];
  type Cache = EntityCache<Entity>;
  type Variables = { data: Partial<EntityUpdateFor[K]> };
  type Response = EntityUpdateResponseFor[K];

  return {
    queryKey: hooks.getEntityQueryKey(projectId, uuid),
    apply: (previous: Cache | undefined, variables: Variables): Cache | undefined =>
      previous && previous.status === 200
        ? { ...previous, data: { ...previous.data, ...variables.data } }
        : previous,
    reconcile: (previous: Cache | undefined, response: Response): Cache | undefined =>
      previous && previous.status === 200
        ? { ...previous, data: hooks.selectEntity(unwrap(response)) as Entity }
        : previous,
    invalidate: [
      hooks.getListQueryKey(projectId),
      ...(hooks.getExtraInvalidateKeys?.(projectId, uuid) ?? []),
    ],
    settleInvalidate: [getActionLogQueryKey(projectId)],
  };
};

/**
 * Build an update-mutation input for a kind: `{ projectId, <idParamKey>: uuid, data }`. The per-kind
 * id-param key and loose `as never` mirror the pragmatism in `entityHooks` — orval's per-kind input
 * types differ only in that key.
 */
export const buildEntityInput = <K extends EntityKind>(
  hooks: EntityHooks,
  projectId: string,
  uuid: string,
  data: Partial<EntityUpdateFor[K]>,
) => ({ projectId, [hooks.idParamKey]: uuid, data }) as never;

export type UseEntityFieldSave<K extends EntityKind> = {
  /** Build a debounced live-save for a sidebar metadata field (color, category, readiness, …). */
  makeFieldSave: <T>(
    toPatch: (value: T) => Partial<EntityUpdateFor[K]>,
  ) => (value: T) => Promise<void>;
};

/**
 * The live-field save slice of the entity editor: one optimistic `useUpdate` instance plus a
 * `makeFieldSave` factory for sidebar metadata fields (color, category, readiness, references,
 * aspects, …). Unlike `useEntityEditor` it loads no entity and builds no content/key save — so a
 * sidebar form that only writes metadata fields (e.g. `FragmentMetadataForm`) uses it without a
 * redundant GET subscription or an unused content mutation. `useEntityEditor` composes it for the
 * field half; this hook is the lighter standalone entry point.
 *
 * `kind` is fixed per route mount, so selecting the kind's hooks from `ENTITY_HOOKS` is
 * rules-of-hooks-safe.
 */
export const useEntityFieldSave = <K extends EntityKind>(
  kind: K,
  projectId: string,
  uuid: string,
): UseEntityFieldSave<K> => {
  type Cache = EntityCache<EntityFor[K]>;
  type Variables = { data: Partial<EntityUpdateFor[K]> };
  type Response = EntityUpdateResponseFor[K];

  const hooks = ENTITY_HOOKS[kind];

  const fieldMutationOptions = useOptimisticMutation<Cache, Variables, Response>(
    buildEntityOptimisticConfig<K>(hooks, projectId, uuid),
  );
  const fieldMutation = hooks.useUpdateEntity({ mutation: fieldMutationOptions });

  const makeFieldSave = useCallback(
    <T>(toPatch: (value: T) => Partial<EntityUpdateFor[K]>) =>
      async (value: T) => {
        await fieldMutation.mutateAsync(
          buildEntityInput<K>(hooks, projectId, uuid, toPatch(value)),
        );
      },
    [fieldMutation, hooks, projectId, uuid],
  );

  return { makeFieldSave };
};
