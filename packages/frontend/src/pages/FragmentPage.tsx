import { useCallback, useRef, useState } from "react";
import { useParams, useBlocker } from "@tanstack/react-router";
import { FragmentEditor } from "../components/fragments/fragment-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";

export const FragmentPage = () => {
  const from = "/projects/$projectId/fragments/$fragmentId" as const;
  const { projectId, fragmentId } = useParams({ from });

  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const blocker = useBlocker({
    shouldBlockFn: () => isDirtyRef.current,
    withResolver: true,
  });

  const handleDiscard = useCallback(() => {
    setIsDirty(false);
    blocker.proceed?.();
  }, [blocker]);

  const handleCancel = useCallback(() => {
    blocker.reset?.();
  }, [blocker]);

  return (
    <>
      <FragmentEditor
        key={fragmentId}
        projectId={projectId}
        fragmentId={fragmentId}
        onDirtyChange={setIsDirty}
      />
      <Dialog open={blocker.status === "blocked"}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have unsaved changes. Leaving will discard them.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDiscard}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
