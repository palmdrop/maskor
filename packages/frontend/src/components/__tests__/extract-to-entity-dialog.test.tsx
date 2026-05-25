import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { ExtractToEntityDialog } from "../extract-to-entity-dialog";
import type { EntityKind } from "@lib/entity-kinds/registry";
import { ENTITY_KIND_META } from "@lib/entity-kinds/registry";
import type { EntityKindBundle } from "@lib/entity-kinds/useEntityKindRegistry";

const projectId = "proj-uuid";
const sourceUuid = "src-uuid";
const selectionText = "The lights flickered at dusk.";

type Item = { uuid: string; key: string; isDiscarded?: boolean };

const makeBundle = (
  kind: EntityKind,
  list: Item[],
  mutateAsync: ReturnType<typeof vi.fn>,
): EntityKindBundle => {
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
    append: { mutateAsync: vi.fn(), isPending: false },
    prepend: { mutateAsync: vi.fn(), isPending: false },
    extract: { mutateAsync, isPending: false },
  };
};

const Wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

const renderDialog = (
  kind: EntityKind,
  list: Item[],
  mutateAsync: ReturnType<typeof vi.fn>,
  overrides: Partial<React.ComponentProps<typeof ExtractToEntityDialog>> = {},
) => {
  const bundle = makeBundle(kind, list, mutateAsync);
  return render(
    <ExtractToEntityDialog
      open={true}
      bundle={bundle}
      projectId={projectId}
      sourceUuid={sourceUuid}
      sourceKind="fragment"
      selectionText={selectionText}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      {...overrides}
    />,
    { wrapper: Wrapper },
  );
};

describe("ExtractToEntityDialog — common behavior across kinds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const kind of ["fragment", "note", "reference", "aspect"] as const) {
    describe(`target = ${kind}`, () => {
      it("renders title and selection preview", () => {
        renderDialog(kind, [], vi.fn());
        expect(screen.getByText(`Extract to ${kind}`)).toBeInTheDocument();
        expect(screen.getByText(selectionText)).toBeInTheDocument();
      });

      it(`pre-fills 'unnamed-${kind}-1' when no entities exist`, async () => {
        renderDialog(kind, [], vi.fn());
        await waitFor(() => {
          expect(screen.getByRole("textbox")).toHaveValue(`unnamed-${kind}-1`);
        });
      });

      it("pre-fills smallest unused n", async () => {
        renderDialog(kind, [{ uuid: "u1", key: `unnamed-${kind}-1` }], vi.fn());
        await waitFor(() => {
          expect(screen.getByRole("textbox")).toHaveValue(`unnamed-${kind}-2`);
        });
      });

      it("Confirm becomes disabled when key field is cleared", async () => {
        const user = userEvent.setup();
        renderDialog(kind, [], vi.fn());
        await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(`unnamed-${kind}-1`));
        await user.clear(screen.getByRole("textbox"));
        await waitFor(() => {
          expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
        });
      });

      it("shows live-clash error for an existing key", async () => {
        const user = userEvent.setup();
        renderDialog(kind, [{ uuid: "u1", key: "existing-key" }], vi.fn());
        await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
        await user.clear(screen.getByRole("textbox"));
        await user.type(screen.getByRole("textbox"), "existing-key");
        const article = kind === "aspect" ? "An" : "A";
        await waitFor(() => {
          expect(
            screen.getByText(`${article} ${kind} with this key already exists`),
          ).toBeInTheDocument();
          expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
        });
      });

      it("calls mutateAsync with correct payload and onSuccess on 201", async () => {
        const mutateAsync = vi.fn().mockResolvedValue({
          status: 201,
          data: { uuid: `new-${kind}-uuid` },
        });
        const onSuccess = vi.fn();
        renderDialog(kind, [], mutateAsync, { onSuccess });

        await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(`unnamed-${kind}-1`));
        fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

        const bodyField = ENTITY_KIND_META[kind].extractBodyField;
        await waitFor(() => {
          expect(mutateAsync).toHaveBeenCalledWith({
            projectId,
            data: expect.objectContaining({
              key: `unnamed-${kind}-1`,
              [bodyField]: selectionText,
              sourceUuid,
              sourceType: "fragment",
              sourceMode: "keep",
              navigated: true,
            }),
          });
          expect(onSuccess).toHaveBeenCalledWith(`new-${kind}-uuid`);
        });
      });

      it("shows server error message inline on non-201", async () => {
        const mutateAsync = vi.fn().mockResolvedValue({
          status: 409,
          data: { message: "Key already taken on server" },
        });
        renderDialog(kind, [], mutateAsync);
        await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(`unnamed-${kind}-1`));
        fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
        await waitFor(() => {
          expect(screen.getByText("Key already taken on server")).toBeInTheDocument();
        });
      });

      it("calls onClose when Cancel is clicked", () => {
        const onClose = vi.fn();
        renderDialog(kind, [], vi.fn(), { onClose });
        fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
        expect(onClose).toHaveBeenCalled();
      });
    });
  }
});

describe("ExtractToEntityDialog — fragment-only discarded clash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces discarded-fragment-specific clash message", async () => {
    const user = userEvent.setup();
    renderDialog("fragment", [{ uuid: "u1", key: "discarded-key", isDiscarded: true }], vi.fn());
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "discarded-key");
    await waitFor(() => {
      expect(
        screen.getByText("A discarded fragment uses this key. Restore or rename it first."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    });
  });

  it("pre-fills around discarded keys (they count as taken)", async () => {
    renderDialog(
      "fragment",
      [
        { uuid: "u1", key: "unnamed-fragment-1", isDiscarded: true },
        { uuid: "u2", key: "unnamed-fragment-2", isDiscarded: true },
      ],
      vi.fn(),
    );
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("unnamed-fragment-3");
    });
  });
});
