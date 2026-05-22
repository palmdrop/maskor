import { useMemo } from "react";
import {
  useAppendFragment,
  useExtractFragment,
  useListFragments,
  usePrependFragment,
} from "@api/generated/fragments/fragments";
import {
  useAppendNote,
  useExtractNote,
  useListNotes,
  usePrependNote,
} from "@api/generated/notes/notes";
import {
  useAppendReference,
  useExtractReference,
  useListReferences,
  usePrependReference,
} from "@api/generated/references/references";
import {
  useAppendAspect,
  useExtractAspect,
  useListAspects,
  usePrependAspect,
} from "@api/generated/aspects/aspects";
import { ENTITY_KIND_META, type EntityKind, type EntityKindMeta } from "./registry";

type EntityListItem = { uuid: string; key: string; isDiscarded?: boolean };

type MutationHandle = {
  // Cast to a loose signature — orval's per-kind input shapes differ only by id param key,
  // and the call site builds the input dynamically from `meta.insertIdParamKey` /
  // `meta.extractBodyField`. Narrow typing would multiply per-kind generics for little gain.
  mutateAsync: (input: never) => Promise<unknown>;
  isPending: boolean;
};

export type EntityKindBundle = {
  kind: EntityKind;
  meta: EntityKindMeta;
  list: EntityListItem[];
  allKeys: Set<string>;
  discardedKeys: Set<string>;
  append: MutationHandle;
  prepend: MutationHandle;
  extract: MutationHandle;
};

export type EntityKindRegistry = Record<EntityKind, EntityKindBundle>;

const buildBundle = (
  kind: EntityKind,
  envelope: { status: number; data: EntityListItem[] } | undefined,
  append: MutationHandle,
  prepend: MutationHandle,
  extract: MutationHandle,
): EntityKindBundle => {
  const list = envelope?.status === 200 ? envelope.data : [];
  const allKeys = new Set<string>();
  const discardedKeys = new Set<string>();
  for (const item of list) {
    allKeys.add(item.key);
    if (item.isDiscarded) discardedKeys.add(item.key);
  }
  return {
    kind,
    meta: ENTITY_KIND_META[kind],
    list,
    allKeys,
    discardedKeys,
    append,
    prepend,
    extract,
  };
};

export const useEntityKindRegistry = (projectId: string): EntityKindRegistry => {
  const fragmentList = useListFragments(projectId);
  const noteList = useListNotes(projectId);
  const referenceList = useListReferences(projectId);
  const aspectList = useListAspects(projectId);

  const appendFragment = useAppendFragment();
  const prependFragment = usePrependFragment();
  const extractFragment = useExtractFragment();
  const appendNote = useAppendNote();
  const prependNote = usePrependNote();
  const extractNote = useExtractNote();
  const appendReference = useAppendReference();
  const prependReference = usePrependReference();
  const extractReference = useExtractReference();
  const appendAspect = useAppendAspect();
  const prependAspect = usePrependAspect();
  const extractAspect = useExtractAspect();

  return useMemo<EntityKindRegistry>(
    () => ({
      fragment: buildBundle(
        "fragment",
        fragmentList.data as never,
        appendFragment as never,
        prependFragment as never,
        extractFragment as never,
      ),
      note: buildBundle(
        "note",
        noteList.data as never,
        appendNote as never,
        prependNote as never,
        extractNote as never,
      ),
      reference: buildBundle(
        "reference",
        referenceList.data as never,
        appendReference as never,
        prependReference as never,
        extractReference as never,
      ),
      aspect: buildBundle(
        "aspect",
        aspectList.data as never,
        appendAspect as never,
        prependAspect as never,
        extractAspect as never,
      ),
    }),
    [
      fragmentList.data,
      noteList.data,
      referenceList.data,
      aspectList.data,
      appendFragment,
      prependFragment,
      extractFragment,
      appendNote,
      prependNote,
      extractNote,
      appendReference,
      prependReference,
      extractReference,
      appendAspect,
      prependAspect,
      extractAspect,
    ],
  );
};
