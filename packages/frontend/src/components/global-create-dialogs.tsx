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
import { Input } from "@components/ui/input";
import { Textarea } from "@components/ui/textarea";
import { Field } from "@components/ui/field";
import { FieldError } from "@components/ui/field-error";
import { BusyButton } from "@components/ui/busy-button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";

export type ActiveCreate = "fragment" | "note" | "reference" | "aspect" | null;

type CreateKind = Exclude<ActiveCreate, null>;

type GlobalCreateDialogsProps = {
  projectId: string;
  activeCreate: ActiveCreate;
  onClose: () => void;
};

// Per-kind descriptor driving the single create dialog below. Kept local on
// purpose: the merged `lib/entity-kinds` registry covers edit/extract/insert
// (GET + UPDATE hooks, extract/insert metadata) but has no create hook or
// navigation route, so there is no create slot to fold this into without
// extending the registry. See references/suggestions.md for the trade-off.
type CreateDescriptor = {
  title: string;
  keyPlaceholder?: string;
  secondaryLabel: string;
  secondaryMultiline: boolean;
  secondaryRows?: number;
  secondaryRequired: boolean;
  isPending: boolean;
  // Create the entity + invalidate its list query. Returns the new uuid on a
  // 201, null on any other status, and throws on transport/validation failure.
  create: (key: string, secondary: string) => Promise<string | null>;
  navigate: (uuid: string) => void;
};

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

  const [key, setKey] = useState("");
  const [secondary, setSecondary] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setKey("");
    setSecondary("");
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const descriptors: Record<CreateKind, CreateDescriptor> = {
    fragment: {
      title: "New fragment",
      secondaryLabel: "Content",
      secondaryMultiline: true,
      secondaryRows: 6,
      secondaryRequired: true,
      isPending: createFragment.isPending,
      create: async (entityKey, content) => {
        const response = await createFragment.mutateAsync({
          projectId,
          data: { key: entityKey, content: content.trim() },
        });
        await queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) });
        return response.status === 201 ? response.data.uuid : null;
      },
      navigate: (uuid) =>
        void navigate({
          to: "/projects/$projectId/fragments/$fragmentId",
          params: { projectId, fragmentId: uuid },
        }),
    },
    note: {
      title: "New note",
      secondaryLabel: "Content (optional)",
      secondaryMultiline: true,
      secondaryRows: 4,
      secondaryRequired: false,
      isPending: createNote.isPending,
      create: async (entityKey, content) => {
        const response = await createNote.mutateAsync({
          projectId,
          data: { key: entityKey, content },
        });
        await queryClient.invalidateQueries({ queryKey: getListNotesQueryKey(projectId) });
        return response.status === 201 ? response.data.uuid : null;
      },
      navigate: (uuid) =>
        void navigate({
          to: "/projects/$projectId/notes/$noteId",
          params: { projectId, noteId: uuid },
        }),
    },
    reference: {
      title: "New reference",
      secondaryLabel: "Content (optional)",
      secondaryMultiline: true,
      secondaryRows: 4,
      secondaryRequired: false,
      isPending: createReference.isPending,
      create: async (entityKey, content) => {
        const response = await createReference.mutateAsync({
          projectId,
          data: { key: entityKey, content },
        });
        await queryClient.invalidateQueries({ queryKey: getListReferencesQueryKey(projectId) });
        return response.status === 201 ? response.data.uuid : null;
      },
      navigate: (uuid) =>
        void navigate({
          to: "/projects/$projectId/references/$referenceId",
          params: { projectId, referenceId: uuid },
        }),
    },
    aspect: {
      title: "New aspect",
      keyPlaceholder: "e.g. tone",
      secondaryLabel: "Description (optional)",
      secondaryMultiline: false,
      secondaryRequired: false,
      isPending: createAspect.isPending,
      create: async (entityKey, description) => {
        const response = await createAspect.mutateAsync({
          projectId,
          data: { key: entityKey, description: description.trim() || undefined },
        });
        await queryClient.invalidateQueries({ queryKey: getListAspectsQueryKey(projectId) });
        return response.status === 201 ? response.data.uuid : null;
      },
      navigate: (uuid) =>
        void navigate({
          to: "/projects/$projectId/aspects/$aspectId",
          params: { projectId, aspectId: uuid },
        }),
    },
  };

  if (activeCreate === null) return null;
  const descriptor = descriptors[activeCreate];

  const handleCreate = async () => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setError("Key is required.");
      return;
    }
    if (descriptor.secondaryRequired && !secondary.trim()) {
      setError("Content is required.");
      return;
    }
    setError(null);
    try {
      const uuid = await descriptor.create(trimmedKey, secondary);
      handleClose();
      if (uuid) descriptor.navigate(uuid);
    } catch (caught) {
      setError((caught as { message?: string })?.message ?? `Failed to create ${activeCreate}.`);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && handleClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{descriptor.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="Key">
            {(control) => (
              <Input
                {...control}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleCreate();
                }}
                disabled={descriptor.isPending}
                placeholder={descriptor.keyPlaceholder}
              />
            )}
          </Field>
          <Field label={descriptor.secondaryLabel}>
            {(control) =>
              descriptor.secondaryMultiline ? (
                <Textarea
                  {...control}
                  rows={descriptor.secondaryRows}
                  value={secondary}
                  onChange={(event) => setSecondary(event.target.value)}
                  disabled={descriptor.isPending}
                />
              ) : (
                <Input
                  {...control}
                  value={secondary}
                  onChange={(event) => setSecondary(event.target.value)}
                  disabled={descriptor.isPending}
                />
              )
            }
          </Field>
          <FieldError>{error}</FieldError>
        </div>
        <DialogFooter>
          <BusyButton onClick={() => void handleCreate()} isPending={descriptor.isPending}>
            Create
          </BusyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
