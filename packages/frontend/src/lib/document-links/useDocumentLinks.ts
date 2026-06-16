import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useListFragments } from "@api/generated/fragments/fragments";
import { useListNotes } from "@api/generated/notes/notes";
import { useListReferences } from "@api/generated/references/references";
import { useListAspects } from "@api/generated/aspects/aspects";
import {
  EMPTY_LINK_LOOKUPS,
  linkRouteFor,
  resolveParsedLink,
  type LinkLookups,
  type ResolvedLink,
} from "./resolver";
import type { LinkPathType, ParsedDocumentLink } from "@maskor/shared";

type KeyedEntity = { key: string; uuid: string };

const toLookup = (entities: KeyedEntity[] | undefined): Map<string, string> =>
  new Map((entities ?? []).map((entity) => [entity.key, entity.uuid]));

// Project-wide document-link plumbing: the key→uuid lookups (built from the four entity lists), a
// pure resolver, and a navigate-to-target action. Shared by the editor link extensions and any link
// surface. Lists are cached by React Query, so this is cheap to call per editor.
export const useDocumentLinks = (projectId: string) => {
  const navigate = useNavigate();
  const { data: fragmentsEnvelope } = useListFragments(projectId);
  const { data: notesEnvelope } = useListNotes(projectId);
  const { data: referencesEnvelope } = useListReferences(projectId);
  const { data: aspectsEnvelope } = useListAspects(projectId);

  const lookups: LinkLookups = useMemo(() => {
    if (
      fragmentsEnvelope?.status !== 200 &&
      notesEnvelope?.status !== 200 &&
      referencesEnvelope?.status !== 200 &&
      aspectsEnvelope?.status !== 200
    ) {
      return EMPTY_LINK_LOOKUPS;
    }
    return {
      fragments: toLookup(fragmentsEnvelope?.status === 200 ? fragmentsEnvelope.data : []),
      notes: toLookup(notesEnvelope?.status === 200 ? notesEnvelope.data : []),
      references: toLookup(referencesEnvelope?.status === 200 ? referencesEnvelope.data : []),
      aspects: toLookup(aspectsEnvelope?.status === 200 ? aspectsEnvelope.data : []),
    };
  }, [fragmentsEnvelope, notesEnvelope, referencesEnvelope, aspectsEnvelope]);

  const resolve = useCallback(
    (parsed: ParsedDocumentLink): ResolvedLink => resolveParsedLink(parsed, lookups),
    [lookups],
  );

  // Flat list of every linkable entity, for the "Insert link" picker.
  const entities = useMemo(
    () =>
      (["fragments", "notes", "references", "aspects"] as LinkPathType[]).flatMap((pathType) =>
        [...lookups[pathType].keys()].map((key) => ({ pathType, key })),
      ),
    [lookups],
  );

  const navigateToLink = useCallback(
    (pathType: LinkPathType, uuid: string) => {
      const route = linkRouteFor(pathType, uuid, projectId);
      void navigate(route);
    },
    [navigate, projectId],
  );

  return { lookups, entities, resolve, navigateToLink };
};

export type DocumentLinksApi = ReturnType<typeof useDocumentLinks>;
