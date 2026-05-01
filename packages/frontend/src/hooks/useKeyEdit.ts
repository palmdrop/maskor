import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  currentKey: string;
  isPending: boolean;
  onRename: (key: string) => Promise<void>;
};

export type KeyEditState = {
  keyEditing: boolean;
  keyValue: string;
  setKeyValue: (value: string) => void;
  keyError: string | null;
  keyInputRef: React.RefObject<HTMLInputElement | null>;
  startEditing: () => void;
  cancelEditing: () => void;
  handleKeySave: () => Promise<void>;
};

export const useKeyEdit = ({ currentKey, isPending, onRename }: Options): KeyEditState => {
  const [keyEditing, setKeyEditing] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (keyEditing) keyInputRef.current?.focus();
  }, [keyEditing]);

  const startEditing = useCallback(() => {
    setKeyValue(currentKey);
    setKeyError(null);
    setKeyEditing(true);
  }, [currentKey]);

  const cancelEditing = useCallback(() => {
    setKeyEditing(false);
  }, []);

  const handleKeySave = useCallback(async () => {
    if (isPending) return;
    const trimmed = keyValue.trim();
    if (!trimmed || trimmed === currentKey) {
      setKeyEditing(false);
      return;
    }
    setKeyError(null);
    try {
      await onRename(trimmed);
      setKeyEditing(false);
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "Rename failed.");
      setKeyEditing(false);
    }
  }, [isPending, keyValue, currentKey, onRename]);

  return {
    keyEditing,
    keyValue,
    setKeyValue,
    keyError,
    keyInputRef,
    startEditing,
    cancelEditing,
    handleKeySave,
  };
};
