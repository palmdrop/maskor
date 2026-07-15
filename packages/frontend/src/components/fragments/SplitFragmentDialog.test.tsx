import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const previewMutateAsync = vi.fn();
const splitMutateAsync = vi.fn();
const invalidateQueries = vi.fn();

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

const toastWarning = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    warning: (...parameters: unknown[]) => toastWarning(...parameters),
    success: (...parameters: unknown[]) => toastSuccess(...parameters),
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries }) };
});

import { SplitFragmentDialog } from "./SplitFragmentDialog";

const previewResponse = (
  pieces: ReadonlyArray<{ pieceIndex: number; key: string; excerpt: string }>,
) => ({
  status: 200 as const,
  data: {
    pieces,
    count: pieces.length,
    appliedDelimiter: { type: "heading" as const, level: 1 as const },
  },
});

const renderDialog = (onOpenChange = vi.fn(), onSplit = vi.fn()) =>
  render(
    <SplitFragmentDialog
      projectId="project-1"
      fragmentId="fragment-1"
      open
      onOpenChange={onOpenChange}
      onSplit={onSplit}
    />,
  );

beforeEach(() => {
  previewMutateAsync.mockReset();
  splitMutateAsync.mockReset();
  invalidateQueries.mockReset();
  invalidateQueries.mockResolvedValue(undefined);
  toastWarning.mockReset();
  toastSuccess.mockReset();
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
    // Piece 1 is the original (read-only). With no rename flagged it is "(original)".
    expect(screen.getByText(/intro/)).toBeInTheDocument();
    expect(screen.getByText("(original)")).toBeInTheDocument();
    // Pieces 2…N are editable key inputs seeded with the derived keys.
    expect(screen.getByDisplayValue("middle")).toBeInTheDocument();
    expect(screen.getByDisplayValue("end")).toBeInTheDocument();
  });

  it("auto-selects the server-suggested delimiter on open (no delimiter sent first)", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "a", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );

    renderDialog();

    await waitFor(() => expect(previewMutateAsync).toHaveBeenCalled());
    // The first preview request omits the delimiter (auto-detect).
    expect(previewMutateAsync.mock.calls[0]![0]).toEqual({
      projectId: "project-1",
      data: { fragmentId: "fragment-1", delimiter: undefined, keepHeadingInBody: false },
    });
  });

  it("lets the user rename a new piece and sends it as a pieceKey override", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "a", excerpt: "a" },
        { pieceIndex: 2, key: "derived-b", excerpt: "b" },
      ]),
    );
    splitMutateAsync.mockResolvedValue({
      status: 200,
      data: {
        sourceFragmentUuid: "fragment-1",
        createdCount: 1,
        createdUuids: ["new-1"],
        warnings: [],
      },
    });

    renderDialog();

    const keyInput = await screen.findByDisplayValue("derived-b");
    fireEvent.change(keyInput, { target: { value: "my-renamed-piece" } });

    const confirm = screen.getByRole("button", { name: "Split" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(splitMutateAsync).toHaveBeenCalledWith({
        projectId: "project-1",
        data: {
          fragmentId: "fragment-1",
          delimiter: { type: "heading", level: 1 },
          pieceKeys: [{ pieceIndex: 2, key: "my-renamed-piece" }],
          keepHeadingInBody: false,
        },
      }),
    );
  });

  it("disables Split and shows an error when a piece key is emptied", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "a", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );

    renderDialog();

    const keyInput = await screen.findByDisplayValue("b");
    fireEvent.change(keyInput, { target: { value: "  " } });

    expect(await screen.findByText("Piece keys must not be empty.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Split" })).toBeDisabled();
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

  it("runs the split mutation directly on confirm and closes on success", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "a", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );
    splitMutateAsync.mockResolvedValue({
      status: 200,
      data: {
        sourceFragmentUuid: "fragment-1",
        createdCount: 1,
        createdUuids: ["new-1"],
        warnings: [],
      },
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
        data: {
          fragmentId: "fragment-1",
          delimiter: { type: "heading", level: 1 },
          keepHeadingInBody: false,
        },
      }),
    );
    await waitFor(() => {
      expect(onSplit).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("treats a post-split cache-refresh failure as success (no bogus error)", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "a", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );
    splitMutateAsync.mockResolvedValue({
      status: 200,
      data: {
        sourceFragmentUuid: "fragment-1",
        createdCount: 1,
        createdUuids: ["new-1"],
        warnings: [],
      },
    });
    // The split committed, but a query refetch triggered by invalidation rejects.
    // This must not surface as "Split failed." (Regression: TODO `---` split.)
    invalidateQueries.mockRejectedValue(new Error("refetch failed"));
    const onOpenChange = vi.fn();
    const onSplit = vi.fn();

    renderDialog(onOpenChange, onSplit);

    const confirm = await screen.findByRole("button", { name: "Split" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(onSplit).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(screen.queryByText("Split failed. Try again.")).not.toBeInTheDocument();
  });

  it("surfaces split warnings as a warning toast while still closing as a success", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "a", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );
    // The split committed but a follow-up write failed server-side (e.g. a
    // sequence placement) — the 200 carries the warning instead of a bogus 500.
    splitMutateAsync.mockResolvedValue({
      status: 200,
      data: {
        sourceFragmentUuid: "fragment-1",
        createdCount: 1,
        createdUuids: ["new-1"],
        warnings: [
          'The new pieces could not be inserted into sequence "Main". Place them manually.',
        ],
      },
    });
    const onOpenChange = vi.fn();
    const onSplit = vi.fn();

    renderDialog(onOpenChange, onSplit);

    const confirm = await screen.findByRole("button", { name: "Split" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(onSplit).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(toastWarning).toHaveBeenCalledWith(
      'The new pieces could not be inserted into sequence "Main". Place them manually.',
    );
    expect(screen.queryByText("Split failed. Try again.")).not.toBeInTheDocument();
  });

  it("reveals a name input pre-filled with the original fragment's key when the checkbox is checked", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "my-fragment", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );

    renderDialog();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Add pieces to a new sequence",
    });
    // Hidden until opted in.
    expect(screen.queryByLabelText("New sequence name")).not.toBeInTheDocument();
    fireEvent.click(checkbox);

    const nameInput = await screen.findByLabelText("New sequence name");
    expect(nameInput).toHaveValue("my-fragment");
  });

  it("sends intoSequence with the derived name on confirm when opted in", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "my-fragment", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );
    splitMutateAsync.mockResolvedValue({
      status: 200,
      data: {
        sourceFragmentUuid: "fragment-1",
        createdCount: 1,
        createdUuids: ["new-1"],
        warnings: [],
        createdSequenceUuid: "seq-1",
        createdSequenceName: "my-fragment",
      },
    });

    renderDialog();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Add pieces to a new sequence",
    });
    fireEvent.click(checkbox);

    const confirm = screen.getByRole("button", { name: "Split" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(splitMutateAsync).toHaveBeenCalledWith({
        projectId: "project-1",
        data: {
          fragmentId: "fragment-1",
          delimiter: { type: "heading", level: 1 },
          keepHeadingInBody: false,
          intoSequence: { name: "my-fragment" },
        },
      }),
    );
  });

  it("does not send intoSequence when the checkbox is left unchecked", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "a", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );
    splitMutateAsync.mockResolvedValue({
      status: 200,
      data: {
        sourceFragmentUuid: "fragment-1",
        createdCount: 1,
        createdUuids: ["new-1"],
        warnings: [],
      },
    });

    renderDialog();

    const confirm = await screen.findByRole("button", { name: "Split" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(splitMutateAsync).toHaveBeenCalledWith({
        projectId: "project-1",
        data: {
          fragmentId: "fragment-1",
          delimiter: { type: "heading", level: 1 },
          keepHeadingInBody: false,
        },
      }),
    );
    // No intoSequence key in the sent payload.
    expect(splitMutateAsync.mock.calls[0]![0].data.intoSequence).toBeUndefined();
  });

  it("blocks confirm when opted in but the sequence name is emptied", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "my-fragment", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );

    renderDialog();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Add pieces to a new sequence",
    });
    fireEvent.click(checkbox);

    const nameInput = await screen.findByLabelText("New sequence name");
    fireEvent.change(nameInput, { target: { value: "  " } });

    expect(await screen.findByText("A sequence name is required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Split" })).toBeDisabled();
  });

  it("surfaces a success toast naming the created sequence", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "my-fragment", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );
    splitMutateAsync.mockResolvedValue({
      status: 200,
      data: {
        sourceFragmentUuid: "fragment-1",
        createdCount: 1,
        createdUuids: ["new-1"],
        warnings: [],
        createdSequenceUuid: "seq-1",
        createdSequenceName: "my-fragment",
      },
    });

    renderDialog();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Add pieces to a new sequence",
    });
    fireEvent.click(checkbox);

    const confirm = screen.getByRole("button", { name: "Split" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'Added the pieces to a new sequence "my-fragment".',
      ),
    );
  });

  it("shows an error and keeps the dialog open when the split itself fails", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "a", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );
    splitMutateAsync.mockRejectedValue(new Error("split failed"));
    const onOpenChange = vi.fn();
    const onSplit = vi.fn();

    renderDialog(onOpenChange, onSplit);

    const confirm = await screen.findByRole("button", { name: "Split" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.getByText("Split failed. Try again.")).toBeInTheDocument());
    expect(onSplit).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("offers a keep-heading toggle (default off) and sends it on split when turned on", async () => {
    previewMutateAsync.mockResolvedValue(
      previewResponse([
        { pieceIndex: 1, key: "my-fragment", excerpt: "a" },
        { pieceIndex: 2, key: "b", excerpt: "b" },
      ]),
    );
    splitMutateAsync.mockResolvedValue({
      status: 200,
      data: {
        sourceFragmentUuid: "fragment-1",
        createdCount: 1,
        createdUuids: ["new-1"],
        warnings: [],
      },
    });

    renderDialog();

    const checkbox = await screen.findByRole("checkbox", { name: "Keep heading in the body" });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);

    const confirm = screen.getByRole("button", { name: "Split" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(splitMutateAsync).toHaveBeenCalledWith({
        projectId: "project-1",
        data: {
          fragmentId: "fragment-1",
          delimiter: { type: "heading", level: 1 },
          keepHeadingInBody: true,
        },
      }),
    );
  });

  it("marks piece 1 as renamed when the preview flags the original for rename", async () => {
    previewMutateAsync.mockResolvedValue({
      status: 200 as const,
      data: {
        pieces: [
          { pieceIndex: 1, key: "chapter-one", excerpt: "Body one", renamedOriginal: true },
          { pieceIndex: 2, key: "chapter-two", excerpt: "Body two" },
        ],
        count: 2,
        appliedDelimiter: { type: "heading" as const, level: 1 as const },
      },
    });

    renderDialog();

    expect(await screen.findByText("(original, renamed)")).toBeInTheDocument();
    expect(screen.getByText(/chapter-one/)).toBeInTheDocument();
  });

  it("hides the keep-heading toggle for a non-heading delimiter", async () => {
    previewMutateAsync.mockResolvedValue({
      status: 200 as const,
      data: {
        pieces: [
          { pieceIndex: 1, key: "a", excerpt: "a" },
          { pieceIndex: 2, key: "b", excerpt: "b" },
        ],
        count: 2,
        appliedDelimiter: { type: "thematic-break" as const },
      },
    });

    renderDialog();

    await waitFor(() => expect(screen.getByText("2 pieces")).toBeInTheDocument());
    expect(
      screen.queryByRole("checkbox", { name: "Keep heading in the body" }),
    ).not.toBeInTheDocument();
  });
});
