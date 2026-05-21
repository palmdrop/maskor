import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ExtractToNoteDialog } from "../extract-to-note-dialog";
import { getListNotesQueryKey } from "@api/generated/notes/notes";
import type { IndexedNote } from "@api/generated/maskorAPI.schemas";

vi.mock("@api/generated/notes/notes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@api/generated/notes/notes")>();
  return {
    ...actual,
    useExtractNote: vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    })),
  };
});

const { useExtractNote } = await import("@api/generated/notes/notes");

const projectId = "proj-uuid";
const sourceUuid = "src-entity-uuid";
const sourceType = "fragment" as const;
const selectionText = "The mist settled over the harbour.";
const headers = new Headers();

const makeNote = (key: string): IndexedNote => ({
  uuid: `uuid-${key}`,
  key,
  filePath: `notes/${key}.md`,
});

const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Wrapper =
  (queryClient: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

const renderDialog = (
  queryClient: QueryClient,
  notes: IndexedNote[],
  overrides: Partial<React.ComponentProps<typeof ExtractToNoteDialog>> = {},
) => {
  queryClient.setQueryData(getListNotesQueryKey(projectId), {
    data: notes,
    status: 200,
    headers,
  });
  return render(
    <ExtractToNoteDialog
      open={true}
      projectId={projectId}
      sourceUuid={sourceUuid}
      sourceType={sourceType}
      selectionText={selectionText}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      {...overrides}
    />,
    { wrapper: Wrapper(queryClient) },
  );
};

describe("ExtractToNoteDialog", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
    vi.mocked(useExtractNote).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  });

  it("renders the dialog with title and key input", async () => {
    renderDialog(queryClient, []);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("Extract to note")).toBeInTheDocument();
  });

  it("shows the selection preview", async () => {
    renderDialog(queryClient, []);
    expect(screen.getByText(selectionText)).toBeInTheDocument();
  });

  it("pre-fills 'unnamed-note-1' when no notes exist", async () => {
    renderDialog(queryClient, []);
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("unnamed-note-1");
    });
  });

  it("pre-fills 'unnamed-note-2' when unnamed-note-1 already exists", async () => {
    renderDialog(queryClient, [makeNote("unnamed-note-1")]);
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("unnamed-note-2");
    });
  });

  it("shows note-specific clash error for an existing note key", async () => {
    const user = userEvent.setup();
    renderDialog(queryClient, [makeNote("existing-key")]);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "existing-key");
    await waitFor(() => {
      expect(screen.getByText("A note with this key already exists")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    });
  });

  it("allows a key that clashes with a fragment key (cross-type keys are independent)", async () => {
    renderDialog(queryClient, []);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    const user = userEvent.setup();
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "harbour-lights");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm/i })).not.toBeDisabled();
    });
  });

  it("calls mutateAsync with correct payload including sourceUuid and sourceType", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      status: 201,
      data: { uuid: "new-note-uuid" },
    });
    vi.mocked(useExtractNote).mockReturnValue({ mutateAsync, isPending: false } as never);
    const onSuccess = vi.fn();
    renderDialog(queryClient, [], { onSuccess });

    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("unnamed-note-1"));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        projectId,
        data: expect.objectContaining({
          key: "unnamed-note-1",
          content: selectionText,
          sourceUuid,
          sourceType,
          sourceMode: "keep",
          navigated: true,
        }),
      });
      expect(onSuccess).toHaveBeenCalledWith("new-note-uuid");
    });
  });

  it("shows server error message inline when extraction fails", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      status: 409,
      data: { message: "Key already taken on server" },
    });
    vi.mocked(useExtractNote).mockReturnValue({ mutateAsync, isPending: false } as never);
    renderDialog(queryClient, []);

    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("unnamed-note-1"));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByText("Key already taken on server")).toBeInTheDocument();
    });
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    renderDialog(queryClient, [], { onClose });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
