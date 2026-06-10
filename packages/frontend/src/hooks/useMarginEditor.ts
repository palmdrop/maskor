import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMargin, useWriteMargin, getGetMarginQueryKey } from "@api/generated/margins/margins";
import type { Comment } from "@api/generated/maskorAPI.schemas";

export type MarginState = {
  notes: string;
  comments: Comment[];
};

export type UseMarginEditorResult = {
  notes: string;
  comments: Comment[];
  // The server margin exists as a file (false until the first save lazily creates it).
  exists: boolean;
  isLoading: boolean;
  isDirty: boolean;
  isSaving: boolean;
  setNotes: (value: string) => void;
  updateCommentBody: (markerId: string, body: string) => void;
  addCommentStub: (comment: Comment) => void;
  removeComment: (markerId: string) => void;
  save: () => Promise<void>;
  revertToServer: () => void;
  // Stable string of the current local margin, for the swap mirror.
  serialize: () => string;
  // Current local margin and the last-persisted baseline, serialized — the swap pair's
  // `currentValue`/`serverValue`.
  serializedContent: string;
  serializedServer: string;
  // Apply a serialized margin (a recovered swap payload) back into local state.
  applySerialized: (raw: string) => void;
};

// Canonical, order-stable serialization used for both dirty comparison and the swap mirror. Two
// margins are equal iff their notes and comment list (in order, field-by-field) are equal.
const serializeState = (state: MarginState): string =>
  JSON.stringify({
    notes: state.notes,
    comments: state.comments.map((comment) => ({
      markerId: comment.markerId,
      excerpt: comment.excerpt,
      body: comment.body,
    })),
  });

const parseState = (raw: string): MarginState | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<MarginState>;
    if (typeof parsed.notes !== "string" || !Array.isArray(parsed.comments)) return null;
    return { notes: parsed.notes, comments: parsed.comments as Comment[] };
  } catch {
    return null;
  }
};

const EMPTY_STATE: MarginState = { notes: "", comments: [] };

// Owns the local, unsaved view of a fragment's Margin. Seeds from the server Margin (or an empty
// margin when none exists yet), tracks dirtiness, and persists the whole margin (notes + comments)
// in one explicit save — mirroring the fragment editor's "explicit save, no auto-save" model. All
// edits (notes, comment bodies, the gesture's stub, orphan removal) are local until save; the
// backend `writeMargin` replace lazily creates the file on first write.
export const useMarginEditor = (projectId: string, fragmentId: string): UseMarginEditorResult => {
  const queryClient = useQueryClient();
  // A fragment with no Margin yet returns 404 (the normal pre-first-write state), which surfaces as
  // a thrown ApiRequestError. Don't retry it — treat the absence as an empty, not-yet-created margin.
  const marginQuery = useGetMargin(projectId, fragmentId, {
    query: { refetchOnWindowFocus: false, retry: false },
  });
  const writeMargin = useWriteMargin();

  const serverState = useMemo<MarginState>(() => {
    if (marginQuery.data?.status === 200) {
      const margin = marginQuery.data.data;
      return { notes: margin.notes, comments: margin.comments };
    }
    return EMPTY_STATE;
  }, [marginQuery.data]);

  const exists = marginQuery.data?.status === 200;

  const [local, setLocal] = useState<MarginState>(EMPTY_STATE);
  // The clean reference the editor is dirty against: the last server state we adopted, or the last
  // saved state. A re-fetch only overwrites local edits when the editor is clean (local == baseline).
  const [baseline, setBaseline] = useState<MarginState>(EMPTY_STATE);
  const [hasSeeded, setHasSeeded] = useState(false);

  const localSerialized = serializeState(local);
  const baselineSerialized = serializeState(baseline);
  const isDirty = localSerialized !== baselineSerialized;

  // Reset all tracking when the target fragment changes.
  useEffect(() => {
    setHasSeeded(false);
    setLocal(EMPTY_STATE);
    setBaseline(EMPTY_STATE);
  }, [projectId, fragmentId]);

  useEffect(() => {
    if (marginQuery.isLoading || marginQuery.isFetching) return;
    // Seed once, then re-sync only when the editor is clean (no unsaved edits to clobber).
    if (!hasSeeded || localSerialized === baselineSerialized) {
      setHasSeeded(true);
      setLocal(serverState);
      setBaseline(serverState);
    }
  }, [
    serverState,
    marginQuery.isLoading,
    marginQuery.isFetching,
    hasSeeded,
    localSerialized,
    baselineSerialized,
  ]);

  const setNotes = useCallback((value: string) => {
    setLocal((previous) => ({ ...previous, notes: value }));
  }, []);

  const updateCommentBody = useCallback((markerId: string, body: string) => {
    setLocal((previous) => ({
      ...previous,
      comments: previous.comments.map((comment) =>
        comment.markerId === markerId ? { ...comment, body } : comment,
      ),
    }));
  }, []);

  const addCommentStub = useCallback((comment: Comment) => {
    setLocal((previous) => {
      // The gesture is idempotent per marker — re-running it on the same block reseeds the excerpt
      // rather than duplicating the comment.
      const index = previous.comments.findIndex((entry) => entry.markerId === comment.markerId);
      if (index === -1) {
        return { ...previous, comments: [...previous.comments, comment] };
      }
      const comments = [...previous.comments];
      comments[index] = { ...comments[index]!, excerpt: comment.excerpt };
      return { ...previous, comments };
    });
  }, []);

  const removeComment = useCallback((markerId: string) => {
    setLocal((previous) => ({
      ...previous,
      comments: previous.comments.filter((comment) => comment.markerId !== markerId),
    }));
  }, []);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetMarginQueryKey(projectId, fragmentId) });
  }, [queryClient, projectId, fragmentId]);

  const localRef = useRef(local);
  localRef.current = local;

  const save = useCallback(async () => {
    const toSave = localRef.current;
    // customFetch throws ApiRequestError on any non-2xx, so a resolved mutateAsync is a
    // success — no in-band status check needed (the throw also kept the correlation id).
    await writeMargin.mutateAsync({
      projectId,
      fragmentId,
      data: { notes: toSave.notes, comments: toSave.comments },
    });
    // Adopt the saved state as the new clean baseline so the editor settles even before the
    // invalidated query round-trips.
    setBaseline(toSave);
    invalidate();
  }, [writeMargin, projectId, fragmentId, invalidate]);

  const revertToServer = useCallback(() => {
    setLocal(serverState);
    setBaseline(serverState);
  }, [serverState]);

  const serialize = useCallback(() => serializeState(localRef.current), []);

  const applySerialized = useCallback((raw: string) => {
    const parsed = parseState(raw);
    if (parsed) setLocal(parsed);
  }, []);

  return {
    notes: local.notes,
    comments: local.comments,
    exists,
    isLoading: marginQuery.isLoading,
    isDirty,
    isSaving: writeMargin.isPending,
    setNotes,
    updateCommentBody,
    addCommentStub,
    removeComment,
    save,
    revertToServer,
    serialize,
    serializedContent: localSerialized,
    serializedServer: baselineSerialized,
    applySerialized,
  };
};
