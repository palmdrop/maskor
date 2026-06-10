import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GlobalCreateDialogs, type ActiveCreate } from "./global-create-dialogs";

const mutateFragment = vi.fn();
const mutateNote = vi.fn();
const mutateReference = vi.fn();
const mutateAspect = vi.fn();
const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }),
  };
});

vi.mock("@api/generated/fragments/fragments", () => ({
  useCreateFragment: () => ({ mutateAsync: mutateFragment, isPending: false }),
  getListFragmentsQueryKey: () => ["fragments"],
}));
vi.mock("@api/generated/notes/notes", () => ({
  useCreateNote: () => ({ mutateAsync: mutateNote, isPending: false }),
  getListNotesQueryKey: () => ["notes"],
}));
vi.mock("@api/generated/references/references", () => ({
  useCreateReference: () => ({ mutateAsync: mutateReference, isPending: false }),
  getListReferencesQueryKey: () => ["references"],
}));
vi.mock("@api/generated/aspects/aspects", () => ({
  useCreateAspect: () => ({ mutateAsync: mutateAspect, isPending: false }),
  getListAspectsQueryKey: () => ["aspects"],
}));

const renderDialog = (activeCreate: ActiveCreate, onClose = vi.fn()) =>
  render(<GlobalCreateDialogs projectId="p1" activeCreate={activeCreate} onClose={onClose} />);

describe("GlobalCreateDialogs — descriptor table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateFragment.mockResolvedValue({ status: 201, data: { uuid: "frag-1" } });
    mutateNote.mockResolvedValue({ status: 201, data: { uuid: "note-1" } });
    mutateReference.mockResolvedValue({ status: 201, data: { uuid: "ref-1" } });
    mutateAspect.mockResolvedValue({ status: 201, data: { uuid: "asp-1" } });
  });

  it("renders nothing when no kind is active", () => {
    const { container } = renderDialog(null);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["fragment", "New fragment", "Content", "TEXTAREA"],
    ["note", "New note", "Content (optional)", "TEXTAREA"],
    ["reference", "New reference", "Content (optional)", "TEXTAREA"],
    ["aspect", "New aspect", "Description (optional)", "INPUT"],
  ] as const)(
    "drives the %s dialog: title, secondary label, and control type",
    (kind, title, secondaryLabel, tag) => {
      renderDialog(kind);
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByLabelText("Key")).toBeInTheDocument();
      expect(screen.getByLabelText(secondaryLabel).tagName).toBe(tag);
    },
  );

  it("creates a fragment (trimmed content) and navigates to it", async () => {
    renderDialog("fragment");
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "scene-1" } });
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: " Hello " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mutateFragment).toHaveBeenCalledWith({
        projectId: "p1",
        data: { key: "scene-1", content: "Hello" },
      }),
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/projects/$projectId/fragments/$fragmentId",
          params: { projectId: "p1", fragmentId: "frag-1" },
        }),
      ),
    );
  });

  it("creates an aspect (description) and navigates to it", async () => {
    renderDialog("aspect");
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "tone" } });
    fireEvent.change(screen.getByLabelText("Description (optional)"), {
      target: { value: "warm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mutateAspect).toHaveBeenCalledWith({
        projectId: "p1",
        data: { key: "tone", description: "warm" },
      }),
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ params: { projectId: "p1", aspectId: "asp-1" } }),
      ),
    );
  });

  it("validates that a key is required for every kind", () => {
    renderDialog("note");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByText("Key is required.")).toBeInTheDocument();
    expect(mutateNote).not.toHaveBeenCalled();
  });

  it("requires content for fragments specifically", () => {
    renderDialog("fragment");
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "scene-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByText("Content is required.")).toBeInTheDocument();
    expect(mutateFragment).not.toHaveBeenCalled();
  });
});
