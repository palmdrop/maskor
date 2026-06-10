import { useCallback, useMemo, useState } from "react";
import { getActionLogQueryKey } from "@api/action-log";
import { unwrap } from "@api/unwrap";
import { useOptimisticMutation } from "@lib/api/useOptimisticMutation";
import {
  ENTITY_HOOKS,
  type EntityCache,
  type EntityFor,
  type EntityUpdateFor,
  type EntityUpdateResponseFor,
} from "./entityHooks";
import type { EntityKind } from "./registry";

export type UseEntityEditor<K extends EntityKind> = {
  /** The loaded entity, or `null` while loading / on error. */
  entity: EntityFor[K] | null;
  isLoading: boolean;
  isError: boolean;
  /** True only while a content/key save is in flight — live-field saves never toggle it. */
  isPending: boolean;
  /** Cascade warnings from the last key rename (e.g. fragments that referenced the old key). */
  cascadeWarnings: string[];
  dismissWarnings: () => void;
  /** Rename the entity's key; surfaces any cascade warnings from the response. */
  onKeySave: (key: string) => Promise<void>;
  /** Save the prose body (the kind's `content` / `description` field). */
  onContentSave: (content: string) => Promise<void>;
  /** Build a debounced live-save for a sidebar metadata field (color, category, notes, …). */
  makeFieldSave: <T>(
    toPatch: (value: T) => Partial<EntityUpdateFor[K]>,
  ) => (value: T) => Promise<void>;
};

/**
 * The data core shared by every entity editor. Loads the entity, and routes its key /
 * content / live-field saves through `useOptimisticMutation` against the single-entity
 * cache: each save optimistically merges its patch, reconciles the authoritative entity
 * from the response (no refetch flicker), invalidates the list (+ any extra key), and
 * refreshes the action log on settle.
 *
 * Two `useUpdate` instances are built deliberately — content/key saves drive `isPending`
 * (gating the Save button / Cmd+S), live-field saves use the second instance so they never
 * toggle it (mirrors `AspectEditor`'s historical dual `useUpdateAspect`).
 *
 * `kind` is fixed per route mount, so selecting the kind's hooks from `ENTITY_HOOKS` and
 * calling them is rules-of-hooks-safe.
 */
export const useEntityEditor = <K extends EntityKind>(
  kind: K,
  projectId: string,
  uuid: string,
): UseEntityEditor<K> => {
  type Entity = EntityFor[K];
  type Update = EntityUpdateFor[K];
  type Cache = EntityCache<Entity>;
  type Variables = { data: Partial<Update> };
  type Response = EntityUpdateResponseFor[K];

  const hooks = ENTITY_HOOKS[kind];

  const getQuery = hooks.useGetEntity(projectId, uuid);
  const entity = (getQuery.data?.status === 200 ? getQuery.data.data : null) as Entity | null;

  const entityQueryKey = useMemo(
    () => hooks.getEntityQueryKey(projectId, uuid),
    [hooks, projectId, uuid],
  );

  // One optimistic config drives both update instances: apply merges the patch carried in the
  // mutation variables; reconcile writes the authoritative entity from the response; the list
  // (and any extra key, e.g. fragment stats) invalidates; the action log refreshes on settle.
  const optimisticConfig = {
    queryKey: entityQueryKey,
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

  const contentMutationOptions = useOptimisticMutation<Cache, Variables, Response>(
    optimisticConfig,
  );
  const fieldMutationOptions = useOptimisticMutation<Cache, Variables, Response>(optimisticConfig);
  const contentMutation = hooks.useUpdateEntity({ mutation: contentMutationOptions });
  const fieldMutation = hooks.useUpdateEntity({ mutation: fieldMutationOptions });

  const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
  const dismissWarnings = useCallback(() => setCascadeWarnings([]), []);

  const buildInput = useCallback(
    (data: Partial<Update>) => ({ projectId, [hooks.idParamKey]: uuid, data }) as never,
    [hooks, projectId, uuid],
  );

  const onKeySave = useCallback(
    async (key: string) => {
      const result = await contentMutation.mutateAsync(buildInput({ key } as Partial<Update>));
      setCascadeWarnings(hooks.selectWarnings(unwrap(result as Response)));
    },
    [contentMutation, buildInput, hooks],
  );

  const onContentSave = useCallback(
    async (content: string) => {
      await contentMutation.mutateAsync(
        buildInput({ [hooks.bodyField]: content } as Partial<Update>),
      );
    },
    [contentMutation, buildInput, hooks],
  );

  const makeFieldSave = useCallback(
    <T>(toPatch: (value: T) => Partial<Update>) =>
      async (value: T) => {
        await fieldMutation.mutateAsync(buildInput(toPatch(value)));
      },
    [fieldMutation, buildInput],
  );

  return {
    entity,
    isLoading: getQuery.isLoading,
    isError: getQuery.isError,
    isPending: contentMutation.isPending,
    cascadeWarnings,
    dismissWarnings,
    onKeySave,
    onContentSave,
    makeFieldSave,
  };
};
