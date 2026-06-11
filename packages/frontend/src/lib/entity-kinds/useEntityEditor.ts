import { useCallback, useState } from "react";
import { unwrap } from "@api/unwrap";
import { useOptimisticMutation } from "@lib/api/useOptimisticMutation";
import {
  ENTITY_HOOKS,
  type EntityCache,
  type EntityFor,
  type EntityUpdateFor,
  type EntityUpdateResponseFor,
} from "./entityHooks";
import {
  useEntityFieldSave,
  buildEntityOptimisticConfig,
  buildEntityInput,
} from "./useEntityFieldSave";
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
 * The data core shared by every entity editor. Loads the entity, and routes its key / content /
 * live-field saves through `useOptimisticMutation` against the single-entity cache: each save
 * optimistically merges its patch, reconciles the authoritative entity from the response (no
 * refetch flicker), invalidates the list (+ any extra key), and refreshes the action log on settle.
 *
 * Two `useUpdate` instances are built deliberately — content/key saves drive `isPending` (gating
 * the Save button / Cmd+S), while live-field saves come from `useEntityFieldSave` so they never
 * toggle it (mirrors `AspectEditor`'s historical dual `useUpdateAspect`). A sidebar form that only
 * needs `makeFieldSave` can call `useEntityFieldSave` directly — no entity load, no content mutation.
 *
 * `kind` is fixed per route mount, so selecting the kind's hooks from `ENTITY_HOOKS` and calling
 * them is rules-of-hooks-safe.
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

  // The content/key mutation instance — its `isPending` gates Save / Cmd+S. Live-field saves use a
  // separate instance (via useEntityFieldSave) so they never toggle it.
  const contentMutationOptions = useOptimisticMutation<Cache, Variables, Response>(
    buildEntityOptimisticConfig<K>(hooks, projectId, uuid),
  );
  const contentMutation = hooks.useUpdateEntity({ mutation: contentMutationOptions });

  const { makeFieldSave } = useEntityFieldSave(kind, projectId, uuid);

  const [cascadeWarnings, setCascadeWarnings] = useState<string[]>([]);
  const dismissWarnings = useCallback(() => setCascadeWarnings([]), []);

  const onKeySave = useCallback(
    async (key: string) => {
      const result = await contentMutation.mutateAsync(
        buildEntityInput<K>(hooks, projectId, uuid, { key } as Partial<Update>),
      );
      setCascadeWarnings(hooks.selectWarnings(unwrap(result as Response)));
    },
    [contentMutation, hooks, projectId, uuid],
  );

  const onContentSave = useCallback(
    async (content: string) => {
      await contentMutation.mutateAsync(
        buildEntityInput<K>(hooks, projectId, uuid, {
          [hooks.bodyField]: content,
        } as Partial<Update>),
      );
    },
    [contentMutation, hooks, projectId, uuid],
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
