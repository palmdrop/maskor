import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommandsProvider } from "@lib/commands/CommandsProvider";

const previewMutateAsync = vi.fn();
const splitMutateAsync = vi.fn();

vi.mock("@api/generated/fragments/fragments", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@api/generated/fragments/fragments")>();
  return {
    ...actual,
    usePreviewSplitFragment: () => ({ mutateAsync: previewMutateAsync, isPending: false }),
    useSplitFragment: () => ({ mutateAsync: splitMutateAsync, isPending: false }),
  };
});

vi.mock("@api/action-log", () => ({
  useInvalidateActionLog: () => vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

import { SplitFragmentDialog } from "./SplitFragmentDialog";

const previewResponse = (
  pieces: ReadonlyArray<{ pieceIndex: number; key: string; excerpt: string }>,
) => ({ status: 200 as const, data: { pieces, count: pieces.length } });

const renderDialog = (onOpenChange = vi.fn(), onSplit = vi.fn()) =>
  render(
    <CommandsProvider>
      <SplitFragmentDialog
        projectId="project-1"
        fragmentId="fragment-1"
        open
        onOpenChange={onOpenChange}
        onSplit={onSplit}
      />
    </CommandsProvider>,
  );

beforeEach(() => {
  previewMutateAsync.mockReset();
  splitMutateAsync.mockReset();
});

describe("SplitFragmentDialog", () => {
  it("renders the live preview piece list and count", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "intro", excerpt: "Opening line" },
        { pieceIndex: 2, key: "middle", excerpt: "Second line" },
        { pieceIndex: 3, key: "end", excerpt: "Third line" },
      ]),
    );

    renderDialog();

    await waitFor(() => expect(screen.getByText("3 pieces")).toBeInTheDocument());
    expect(screen.getByText("1. intro")).toBeInTheDocument();
    expect(screen.getByText("3. end")).toBeInTheDocument();
  });

  it("disables Split for a single-piece (no-op) preview", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([{ pieceIndex: 1, key: "whole", excerpt: "All of it" }]),
    );

    renderDialog();

    await waitFor(() =>
      expect(screen.getByText("1 piece — nothing to split.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Split" })).toBeDisabled();
  });

  it("dispatches the split through the command system on confirm", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "a", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );
    splitMutateAsync.mockResolvedValue({
      status: 200,
      data: { sourceFragmentUuid: "fragment-1", createdCount: 1, createdUuids: ["new-1"] },
    });
    const onOpenChange = vi.fn();
    const onSplit = vi.fn();

    renderDialog(onOpenChange, onSplit);

    const confirm = await screen.findByRole("button", { name: "Split" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(splitMutateAsync).toHaveBeenCalledWith({
        projectId: "project-1",
        data: { fragmentId: "fragment-1", delimiter: { type: "heading", level: 1 } },
      }),
    );
    await waitFor(() => {
      expect(onSplit).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
