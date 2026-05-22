import { useCallback } from "react";
import { ExtractToEntityDialogCore } from "./extract-to-entity-dialog-core";
import { validateExtractKey } from "./extract-utils";
import type { EntityKind } from "@lib/entity-kinds/registry";
import type { EntityKindBundle } from "@lib/entity-kinds/useEntityKindRegistry";

type Props = {
  open: boolean;
  bundle: EntityKindBundle;
  projectId: string;
  sourceUuid: string;
  sourceKind: EntityKind;
  selectionText: string;
  onClose: () => void;
  onSuccess: (newUuid: string) => void;
};

type ExtractMutationResult = {
  status: number;
  data: { uuid?: string; message?: string };
};

export const ExtractToEntityDialog = ({
  open,
  bundle,
  projectId,
  sourceUuid,
  sourceKind,
  selectionText,
  onClose,
  onSuccess,
}: Props) => {
  const { kind, meta, allKeys, discardedKeys, extract } = bundle;

  const validateKey = useCallback(
    (key: string): string | null => {
      if (kind === "fragment" && discardedKeys.has(key.trim())) {
        return "A discarded fragment uses this key. Restore or rename it first.";
      }
      return validateExtractKey(key, allKeys, kind);
    },
    [kind, allKeys, discardedKeys],
  );

  const handleConfirm = useCallback(
    async (key: string): Promise<string | null> => {
      const payload = {
        key,
        [meta.extractBodyField]: selectionText,
        sourceUuid,
        sourceType: sourceKind,
        sourceMode: "keep" as const,
        navigated: true,
      };
      try {
        const result = (await extract.mutateAsync({ projectId, data: payload } as never)) as
          | ExtractMutationResult
          | undefined;
        if (result?.status === 201 && result.data.uuid) {
          onSuccess(result.data.uuid);
          return null;
        }
        return result?.data.message ?? "Extraction failed. Try again.";
      } catch {
        return "Extraction failed. Try again.";
      }
    },
    [extract, projectId, selectionText, sourceUuid, sourceKind, meta.extractBodyField, onSuccess],
  );

  return (
    <ExtractToEntityDialogCore
      open={open}
      title={`Extract to ${kind}`}
      selectionText={selectionText}
      preFillPrefix={meta.preFillPrefix}
      allKeys={allKeys}
      validateKey={validateKey}
      isPending={extract.isPending}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
};
