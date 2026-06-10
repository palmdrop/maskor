import type { QueryKey } from "@tanstack/react-query";
import {
  useGetReference,
  useUpdateReference,
  getGetReferenceQueryKey,
  getListReferencesQueryKey,
} from "@api/generated/references/references";
import {
  useGetNote,
  useUpdateNote,
  getGetNoteQueryKey,
  getListNotesQueryKey,
} from "@api/generated/notes/notes";
import {
  useGetAspect,
  useUpdateAspect,
  getGetAspectQueryKey,
  getListAspectsQueryKey,
} from "@api/generated/aspects/aspects";
import {
  useGetFragment,
  useUpdateFragment,
  getGetFragmentQueryKey,
  getListFragmentsQueryKey,
} from "@api/generated/fragments/fragments";
import { getGetFragmentStatsQueryKey } from "@api/generated/stats/stats";
import type {
  Reference,
  Note,
  Aspect,
  Fragment,
  ReferenceUpdate,
  NoteUpdate,
  AspectUpdate,
  FragmentUpdate,
  ReferenceUpdateResponse,
  NoteUpdateResponse,
  AspectUpdateResponse,
  FragmentUpdateResponse,
} from "@api/generated/maskorAPI.schemas";
import type { UpdateReferenceResponse } from "@api/generated/references/references";
import type { UpdateNoteResponse } from "@api/generated/notes/notes";
import type { UpdateAspectResponse } from "@api/generated/aspects/aspects";
import type { UpdateFragmentResponse } from "@api/generated/fragments/fragments";
import type { EntityKind } from "./registry";

// Per-kind type maps. The hook references in ENTITY_HOOKS are cast to a single loose
// signature (orval's per-kind hooks are structurally different), so these maps re-attach
// strong types at the `useEntityEditor` boundary — letting the hook return `Reference`
// vs `Aspect` and letting the optimistic reconcile narrow the update response with `unwrap`.
export type EntityFor = {
  fragment: Fragment;
  note: Note;
  reference: Reference;
  aspect: Aspect;
};

export type EntityUpdateFor = {
  fragment: FragmentUpdate;
  note: NoteUpdate;
  reference: ReferenceUpdate;
  aspect: AspectUpdate;
};

// The full (success | error) response union returned by each update mutation.
export type EntityUpdateResponseFor = {
  fragment: UpdateFragmentResponse;
  note: UpdateNoteResponse;
  reference: UpdateReferenceResponse;
  aspect: UpdateAspectResponse;
};

/** The single-entity GET cache envelope (`{ status, data }`) for a kind's entity. */
export type EntityCache<Entity> = { status: number; data: Entity };

// Loose common shapes for the generated hooks — mirrors the `as never` pragmatism in
// useEntityKindRegistry: orval's per-kind input/output types differ only in id-param key
// and response wrapper, and re-typing each would multiply generics for no real safety.
type LooseEnvelope = { status: number; data: unknown };
type LooseGetHook = (
  projectId: string,
  uuid: string,
) => { data: LooseEnvelope | undefined; isLoading: boolean; isError: boolean };
type LooseUpdateHook = (options?: { mutation?: unknown }) => {
  mutateAsync: (input: never) => Promise<LooseEnvelope>;
  isPending: boolean;
};

export type EntityHooks = {
  /** Generated single-entity GET hook (uncalled — called by the selected kind only). */
  useGetEntity: LooseGetHook;
  /** Generated update hook (uncalled). Instantiated twice: content-save vs. live-field. */
  useUpdateEntity: LooseUpdateHook;
  getEntityQueryKey: (projectId: string, uuid: string) => QueryKey;
  getListQueryKey: (projectId: string) => QueryKey;
  /** The mutation input's id-param key (`referenceId`, `noteId`, …). */
  idParamKey: "fragmentId" | "noteId" | "referenceId" | "aspectId";
  /** The update payload field carrying the prose body (`content`, or `description` for aspects). */
  bodyField: "content" | "description";
  /** Pick the authoritative entity out of an update response body. */
  selectEntity: (responseData: unknown) => unknown;
  /** Flatten an update response body's cascade warnings to a single string list. */
  selectWarnings: (responseData: unknown) => string[];
  /** Extra query keys to invalidate after a save (e.g. fragment stats). */
  getExtraInvalidateKeys?: (projectId: string, uuid: string) => QueryKey[];
};

export const ENTITY_HOOKS: Record<EntityKind, EntityHooks> = {
  reference: {
    useGetEntity: useGetReference as unknown as LooseGetHook,
    useUpdateEntity: useUpdateReference as unknown as LooseUpdateHook,
    getEntityQueryKey: getGetReferenceQueryKey,
    getListQueryKey: getListReferencesQueryKey,
    idParamKey: "referenceId",
    bodyField: "content",
    selectEntity: (data) => (data as ReferenceUpdateResponse).reference,
    selectWarnings: (data) => (data as ReferenceUpdateResponse).warnings.fragments,
  },
  note: {
    useGetEntity: useGetNote as unknown as LooseGetHook,
    useUpdateEntity: useUpdateNote as unknown as LooseUpdateHook,
    getEntityQueryKey: getGetNoteQueryKey,
    getListQueryKey: getListNotesQueryKey,
    idParamKey: "noteId",
    bodyField: "content",
    selectEntity: (data) => (data as NoteUpdateResponse).note,
    selectWarnings: (data) => {
      const { warnings } = data as NoteUpdateResponse;
      return [...warnings.fragments, ...warnings.aspects];
    },
  },
  aspect: {
    useGetEntity: useGetAspect as unknown as LooseGetHook,
    useUpdateEntity: useUpdateAspect as unknown as LooseUpdateHook,
    getEntityQueryKey: getGetAspectQueryKey,
    getListQueryKey: getListAspectsQueryKey,
    idParamKey: "aspectId",
    bodyField: "description",
    selectEntity: (data) => (data as AspectUpdateResponse).aspect,
    selectWarnings: (data) => (data as AspectUpdateResponse).warnings,
  },
  fragment: {
    useGetEntity: useGetFragment as unknown as LooseGetHook,
    useUpdateEntity: useUpdateFragment as unknown as LooseUpdateHook,
    getEntityQueryKey: getGetFragmentQueryKey,
    getListQueryKey: getListFragmentsQueryKey,
    idParamKey: "fragmentId",
    bodyField: "content",
    selectEntity: (data) => (data as FragmentUpdateResponse).fragment,
    selectWarnings: (data) => (data as FragmentUpdateResponse).warnings,
    getExtraInvalidateKeys: (projectId, uuid) => [getGetFragmentStatsQueryKey(projectId, uuid)],
  },
};
