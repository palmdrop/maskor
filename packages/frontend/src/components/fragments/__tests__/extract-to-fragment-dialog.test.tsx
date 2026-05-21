import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ExtractToFragmentDialog } from "../extract-to-fragment-dialog";
import {
  getListFragmentsQueryKey,
  getExtractFragmentMutationOptions,
} from "@api/generated/fragments/fragments";
import type { IndexedFragment } from "@api/generated/maskorAPI.schemas";

vi.mock("@api/generated/fragments/fragments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@api/generated/fragments/fragments")>();
  return {
    ...actual,
    useExtractFragment: vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    })),
  };
});

const { useExtractFragment } = await import("@api/generated/fragments/fragments");

const projectId = "proj-uuid";
const sourceFragmentUuid = "src-fragment-uuid";
const selectionText = "The lights flickered at dusk.";
const headers = new Headers();

const makeFragment = (key: string, isDiscarded = false): IndexedFragment => ({
  uuid: `uuid-${key}`,
  key,
  isDiscarded,
  excerpt: null,
  aspects: {},
  readiness: 0,
  filePath: `fragments/${key}.md`,
  contentHash: "hash",
});

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Wrapper =
  (queryClient: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

const renderDialog = (
  queryClient: QueryClient,
  fragments: IndexedFragment[],
  overrides: Partial<React.ComponentProps<typeof ExtractToFragmentDialog>> = {},
) => {
  queryClient.setQueryData(getListFragmentsQueryKey(projectId), {
    data: fragments,
    status: 200,
    headers,
  });
  return render(
    <ExtractToFragmentDialog
      open={true}
      projectId={projectId}
      sourceFragmentUuid={sourceFragmentUuid}
      selectionText={selectionText}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      {...overrides}
    />,
    { wrapper: Wrapper(queryClient) },
  );
};

describe("ExtractToFragmentDialog", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
    vi.mocked(useExtractFragment).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  });

  it("renders the dialog with a key input", async () => {
    renderDialog(queryClient, []);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("Extract to fragment")).toBeInTheDocument();
  });

  it("shows the selection preview", async () => {
    renderDialog(queryClient, []);
    expect(screen.getByText(selectionText)).toBeInTheDocument();
  });

  it("pre-fills 'unnamed-fragment-1' when no fragments exist", async () => {
    renderDialog(queryClient, []);
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("unnamed-fragment-1");
    });
  });

  it("pre-fills 'unnamed-fragment-2' when unnamed-fragment-1 already exists", async () => {
    renderDialog(queryClient, [makeFragment("unnamed-fragment-1")]);
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("unnamed-fragment-2");
    });
  });

  it("pre-fills smallest unused n even when discarded fragments occupy earlier keys", async () => {
    renderDialog(queryClient, [
      makeFragment("unnamed-fragment-1", true),
      makeFragment("unnamed-fragment-2", true),
    ]);
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("unnamed-fragment-3");
    });
  });

  it("Confirm is enabled when pre-fill is valid and unused", async () => {
    renderDialog(queryClient, []);
    await waitFor(() => {
      const confirmButton = screen.getByRole("button", { name: /confirm/i });
      expect(confirmButton).not.toBeDisabled();
    });
  });

  it("Confirm is disabled when key field is cleared", async () => {
    const user = userEvent.setup();
    renderDialog(queryClient, []);
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("unnamed-fragment-1"));
    await user.clear(screen.getByRole("textbox"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    });
  });

  it("shows clash error for a live fragment key", async () => {
    const user = userEvent.setup();
    renderDialog(queryClient, [makeFragment("existing-key")]);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "existing-key");
    await waitFor(() => {
      expect(screen.getByText("A fragment with this key already exists")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    });
  });

  it("shows discarded-specific clash error", async () => {
    const user = userEvent.setup();
    renderDialog(queryClient, [makeFragment("discarded-key", true)]);
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

  it("calls mutateAsync with correct payload and calls onSuccess on 201", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      status: 201,
      data: { uuid: "new-frag-uuid" },
    });
    vi.mocked(useExtractFragment).mockReturnValue({ mutateAsync, isPending: false } as never);
    const onSuccess = vi.fn();
    renderDialog(queryClient, [], { onSuccess });

    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("unnamed-fragment-1"));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        projectId,
        data: expect.objectContaining({
          key: "unnamed-fragment-1",
          content: selectionText,
          sourceFragmentUuid,
          sourceMode: "keep",
          navigated: true,
        }),
      });
      expect(onSuccess).toHaveBeenCalledWith("new-frag-uuid");
    });
  });

  it("shows server error message inline when extract fails", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      status: 409,
      data: { message: "Key already taken on server" },
    });
    vi.mocked(useExtractFragment).mockReturnValue({ mutateAsync, isPending: false } as never);
    renderDialog(queryClient, []);

    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("unnamed-fragment-1"));
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
