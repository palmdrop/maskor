import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ENTITY_KINDS, type EntityKind } from "./registry";
import { useEntityKindRegistry, type EntityKindBundle } from "./useEntityKindRegistry";
import { useInsertToggles } from "@lib/insert-toggles/InsertTogglesProvider";
import type { InsertCommandTarget } from "@lib/commands/scopes/editor";
import type {
  InsertDirection,
  InsertSourceMode,
  InsertNextMode,
} from "@components/append-or-prepend-dialog";

type InsertionTarget = {
  direction: InsertDirection;
  targetKind: EntityKind;
  targetEntity: InsertCommandTarget;
};

type InsertMutationResult = {
  status: number;
  data: { sourceCutFailed: boolean };
};

export type UseEntityInsertExtract = {
  /** Per-kind entities eligible as insert targets (excludes self + discarded fragments). */
  eligibleByKind: Record<EntityKind, InsertCommandTarget[]>;
  /** Open the extract-to-entity dialog for `kind`, seeded with the selected text. */
  extractTo: (kind: EntityKind, text: string) => void;
  /** Open the append/prepend dialog for a chosen target entity. */
  insertTo: (
    direction: InsertDirection,
    targetKind: EntityKind,
    selectionText: string,
    targetEntity: InsertCommandTarget,
  ) => void;
  /** Extract-to-entity dialog state; `target` is null when closed. */
  extract: {
    target: EntityKind | null;
    bundle: EntityKindBundle | null;
    selectionText: string;
    close: () => void;
    onSuccess: (uuid: string) => void;
  };
  /** Append/prepend dialog state; `target` is null when closed. */
  insert: {
    target: InsertionTarget | null;
    selectionText: string;
    sourceMode: InsertSourceMode;
    nextMode: InsertNextMode;
    setSourceMode: (mode: InsertSourceMode) => void;
    setNextMode: (mode: InsertNextMode) => void;
    isPending: boolean;
    close: () => void;
    confirm: () => void;
  };
};

/**
 * The entity-mutation orchestration behind an editor's extract / insert gestures, lifted out
 * of `EntityEditorShell` so the shell stays layout. Owns the dialog state and the append /
 * prepend / extract flows, sourcing targets and mutation handles from the entity-kind registry
 * and navigating to the resulting entity. The shell renders the dialogs from the returned state.
 */
export const useEntityInsertExtract = (
  projectId: string,
  sourceKind: EntityKind,
  sourceUuid: string,
): UseEntityInsertExtract => {
  const navigate = useNavigate();
  const registry = useEntityKindRegistry(projectId);

  const isInsertionPending = ENTITY_KINDS.some(
    (kind) => registry[kind].append.isPending || registry[kind].prepend.isPending,
  );

  const [extractTarget, setExtractTarget] = useState<EntityKind | null>(null);
  const [extractSelectionText, setExtractSelectionText] = useState("");

  const [insertionTarget, setInsertionTarget] = useState<InsertionTarget | null>(null);
  const [insertionSelectionText, setInsertionSelectionText] = useState("");
  const {
    sourceMode: insertSourceMode,
    nextMode: insertNextMode,
    setSourceMode: setInsertSourceMode,
    setNextMode: setInsertNextMode,
  } = useInsertToggles();

  const navigateToEntity = useCallback(
    (kind: EntityKind, uuid: string) => {
      // TanStack Router needs the route literal at the call site for params inference,
      // so the four routes stay unrolled — but only in this one helper.
      switch (kind) {
        case "fragment":
          void navigate({
            to: "/projects/$projectId/fragments/$fragmentId",
            params: { projectId, fragmentId: uuid },
          });
          return;
        case "note":
          void navigate({
            to: "/projects/$projectId/notes/$noteId",
            params: { projectId, noteId: uuid },
          });
          return;
        case "reference":
          void navigate({
            to: "/projects/$projectId/references/$referenceId",
            params: { projectId, referenceId: uuid },
          });
          return;
        case "aspect":
          void navigate({
            to: "/projects/$projectId/aspects/$aspectId",
            params: { projectId, aspectId: uuid },
          });
          return;
      }
    },
    [navigate, projectId],
  );

  const extractTo = useCallback((kind: EntityKind, text: string) => {
    setExtractSelectionText(text);
    setExtractTarget(kind);
  }, []);

  const closeExtract = useCallback(() => setExtractTarget(null), []);

  const handleExtractSuccess = useCallback(
    (uuid: string) => {
      const kind = extractTarget;
      setExtractTarget(null);
      if (kind) navigateToEntity(kind, uuid);
    },
    [extractTarget, navigateToEntity],
  );

  const eligibleByKind = useMemo<Record<EntityKind, InsertCommandTarget[]>>(() => {
    const buildList = (kind: EntityKind): InsertCommandTarget[] =>
      registry[kind].list
        .filter(
          (item) => item.uuid !== sourceUuid && !(kind === "fragment" && item.isDiscarded === true),
        )
        .map((item) => ({ uuid: item.uuid, key: item.key }));
    return {
      fragment: buildList("fragment"),
      note: buildList("note"),
      reference: buildList("reference"),
      aspect: buildList("aspect"),
    };
  }, [registry, sourceUuid]);

  const insertTo = useCallback(
    (
      direction: InsertDirection,
      targetKind: EntityKind,
      selectionText: string,
      targetEntity: InsertCommandTarget,
    ) => {
      setInsertionSelectionText(selectionText);
      setInsertionTarget({ direction, targetKind, targetEntity });
    },
    [],
  );

  const closeInsert = useCallback(() => setInsertionTarget(null), []);

  const confirmInsert = useCallback(async () => {
    if (!insertionTarget) return;
    const { direction, targetKind, targetEntity } = insertionTarget;
    const bundle = registry[targetKind];

    const mutation = direction === "append" ? bundle.append : bundle.prepend;
    const input = {
      projectId,
      [bundle.meta.insertIdParamKey]: targetEntity.uuid,
      data: {
        insertedBody: insertionSelectionText,
        sourceUuid,
        sourceType: sourceKind,
        sourceMode: insertSourceMode,
        navigated: insertNextMode === "switch",
      },
    };

    // NOTE: The assignment is not useless, ts is wrong?
    // eslint-disable-next-line no-useless-assignment
    let result: InsertMutationResult | null = null;
    try {
      result = (await mutation.mutateAsync(input as never)) as InsertMutationResult;
    } catch {
      return;
    }

    if (result?.status !== 200) return;

    setInsertionTarget(null);

    if (result.data.sourceCutFailed) {
      toast.warning(
        `Added to ${targetKind}/${targetEntity.key}. Couldn't update the source body — the selection is still there.`,
      );
    }

    if (insertNextMode === "switch") {
      navigateToEntity(targetKind, targetEntity.uuid);
    }
  }, [
    insertionTarget,
    insertionSelectionText,
    sourceUuid,
    sourceKind,
    insertSourceMode,
    insertNextMode,
    projectId,
    registry,
    navigateToEntity,
  ]);

  return {
    eligibleByKind,
    extractTo,
    insertTo,
    extract: {
      target: extractTarget,
      bundle: extractTarget ? registry[extractTarget] : null,
      selectionText: extractSelectionText,
      close: closeExtract,
      onSuccess: handleExtractSuccess,
    },
    insert: {
      target: insertionTarget,
      selectionText: insertionSelectionText,
      sourceMode: insertSourceMode,
      nextMode: insertNextMode,
      setSourceMode: setInsertSourceMode,
      setNextMode: setInsertNextMode,
      isPending: isInsertionPending,
      close: closeInsert,
      confirm: confirmInsert,
    },
  };
};
