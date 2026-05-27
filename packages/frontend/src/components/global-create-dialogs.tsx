import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateFragment, getListFragmentsQueryKey } from "@api/generated/fragments/fragments";
import { useCreateNote, getListNotesQueryKey } from "@api/generated/notes/notes";
import {
  useCreateReference,
  getListReferencesQueryKey,
} from "@api/generated/references/references";
import { useCreateAspect, getListAspectsQueryKey } from "@api/generated/aspects/aspects";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";

export type ActiveCreate = "fragment" | "note" | "reference" | "aspect" | null;

type GlobalCreateDialogsProps = {
  projectId: string;
  activeCreate: ActiveCreate;
  onClose: () => void;
};

type SimpleCreateFormState = {
  key: string;
  content: string;
  error: string | null;
};

const initialSimpleForm: SimpleCreateFormState = { key: "", content: "", error: null };

export const GlobalCreateDialogs = ({
  projectId,
  activeCreate,
  onClose,
}: GlobalCreateDialogsProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createFragment = useCreateFragment();
  const createNote = useCreateNote();
  const createReference = useCreateReference();
  const createAspect = useCreateAspect();

  const [simpleForm, setSimpleForm] = useState<SimpleCreateFormState>(initialSimpleForm);
  const [aspectKey, setAspectKey] = useState("");
  const [aspectDescription, setAspectDescription] = useState("");
  const [aspectError, setAspectError] = useState<string | null>(null);

  const resetSimpleForm = () => setSimpleForm(initialSimpleForm);
  const resetAspectForm = () => {
    setAspectKey("");
    setAspectDescription("");
    setAspectError(null);
  };

  const handleClose = () => {
    resetSimpleForm();
    resetAspectForm();
    onClose();
  };

  const handleCreateFragment = async () => {
    const key = simpleForm.key.trim();
    const content = simpleForm.content.trim();
    if (!key) {
      setSimpleForm((previous) => ({ ...previous, error: "Key is required." }));
      return;
    }
    if (!content) {
      setSimpleForm((previous) => ({ ...previous, error: "Content is required." }));
      return;
    }
    setSimpleForm((previous) => ({ ...previous, error: null }));
    try {
      const response = await createFragment.mutateAsync({ projectId, data: { key, content } });
      await queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) });
      handleClose();
      if (response.status === 201) {
        void navigate({
          to: "/projects/$projectId/fragments/$fragmentId",
          params: { projectId, fragmentId: response.data.uuid },
        });
      }
    } catch (caught) {
      setSimpleForm((previous) => ({
        ...previous,
        error: (caught as { message?: string })?.message ?? "Failed to create fragment.",
      }));
    }
  };

  const handleCreateNote = async () => {
    const key = simpleForm.key.trim();
    if (!key) {
      setSimpleForm((previous) => ({ ...previous, error: "Key is required." }));
      return;
    }
    setSimpleForm((previous) => ({ ...previous, error: null }));
    try {
      const response = await createNote.mutateAsync({
        projectId,
        data: { key, content: simpleForm.content },
      });
      await queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
      handleClose();
      if (response.status === 201) {
        void navigate({
          to: "/projects/$projectId/notes/$noteId",
          params: { projectId, noteId: response.data.uuid },
        });
      }
    } catch (caught) {
      setSimpleForm((previous) => ({
        ...previous,
        error: (caught as { message?: string })?.message ?? "Failed to create note.",
      }));
    }
  };

  const handleCreateReference = async () => {
    const key = simpleForm.key.trim();
    if (!key) {
      setSimpleForm((previous) => ({ ...previous, error: "Key is required." }));
      return;
    }
    setSimpleForm((previous) => ({ ...previous, error: null }));
    try {
      const response = await createReference.mutateAsync({
        projectId,
        data: { key, content: simpleForm.content },
      });
      await queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
      handleClose();
      if (response.status === 201) {
        void navigate({
          to: "/projects/$projectId/references/$referenceId",
          params: { projectId, referenceId: response.data.uuid },
        });
      }
    } catch (caught) {
      setSimpleForm((previous) => ({
        ...previous,
        error: (caught as { message?: string })?.message ?? "Failed to create reference.",
      }));
    }
  };

  const handleCreateAspect = async () => {
    const key = aspectKey.trim();
    if (!key) {
      setAspectError("Key is required.");
      return;
    }
    setAspectError(null);
    try {
      const response = await createAspect.mutateAsync({
        projectId,
        data: {
          key,
          description: aspectDescription.trim() || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
      handleClose();
      if (response.status === 201) {
        void navigate({
          to: "/projects/$projectId/aspects/$aspectId",
          params: { projectId, aspectId: response.data.uuid },
        });
      }
    } catch (caught) {
      setAspectError((caught as { message?: string })?.message ?? "Failed to create aspect.");
    }
  };

  // Fragment dialog
  if (activeCreate === "fragment") {
    const isPending = createFragment.isPending;
    return (
      <Dialog open onOpenChange={(open) => !open && handleClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New fragment</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="global-create-fragment-key">Key</Label>
              <Input
                id="global-create-fragment-key"
                value={simpleForm.key}
                onChange={(event) =>
                  setSimpleForm((previous) => ({ ...previous, key: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleCreateFragment();
                }}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="global-create-fragment-content">Content</Label>
              <textarea
                id="global-create-fragment-content"
                rows={6}
                value={simpleForm.content}
                onChange={(event) =>
                  setSimpleForm((previous) => ({ ...previous, content: event.target.value }))
                }
                disabled={isPending}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>
            {simpleForm.error && <p className="text-xs text-destructive">{simpleForm.error}</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreateFragment()} disabled={isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Note dialog
  if (activeCreate === "note") {
    const isPending = createNote.isPending;
    return (
      <Dialog open onOpenChange={(open) => !open && handleClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New note</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="global-create-note-key">Key</Label>
              <Input
                id="global-create-note-key"
                value={simpleForm.key}
                onChange={(event) =>
                  setSimpleForm((previous) => ({ ...previous, key: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleCreateNote();
                }}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="global-create-note-content">Content (optional)</Label>
              <textarea
                id="global-create-note-content"
                rows={4}
                value={simpleForm.content}
                onChange={(event) =>
                  setSimpleForm((previous) => ({ ...previous, content: event.target.value }))
                }
                disabled={isPending}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>
            {simpleForm.error && <p className="text-xs text-destructive">{simpleForm.error}</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreateNote()} disabled={isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Reference dialog
  if (activeCreate === "reference") {
    const isPending = createReference.isPending;
    return (
      <Dialog open onOpenChange={(open) => !open && handleClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New reference</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="global-create-reference-key">Key</Label>
              <Input
                id="global-create-reference-key"
                value={simpleForm.key}
                onChange={(event) =>
                  setSimpleForm((previous) => ({ ...previous, key: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleCreateReference();
                }}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="global-create-reference-content">Content (optional)</Label>
              <textarea
                id="global-create-reference-content"
                rows={4}
                value={simpleForm.content}
                onChange={(event) =>
                  setSimpleForm((previous) => ({ ...previous, content: event.target.value }))
                }
                disabled={isPending}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>
            {simpleForm.error && <p className="text-xs text-destructive">{simpleForm.error}</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreateReference()} disabled={isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Aspect dialog
  if (activeCreate === "aspect") {
    const isPending = createAspect.isPending;
    return (
      <Dialog open onOpenChange={(open) => !open && handleClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New aspect</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="global-create-aspect-key">Key</Label>
              <Input
                id="global-create-aspect-key"
                value={aspectKey}
                onChange={(event) => setAspectKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleCreateAspect();
                }}
                disabled={isPending}
                placeholder="e.g. tone"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="global-create-aspect-description">Description (optional)</Label>
              <Input
                id="global-create-aspect-description"
                value={aspectDescription}
                onChange={(event) => setAspectDescription(event.target.value)}
                disabled={isPending}
              />
            </div>
            {aspectError && <p className="text-xs text-destructive">{aspectError}</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreateAspect()} disabled={isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
};
