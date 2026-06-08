import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const PROJECT_ID = "proj-1";

// --- Mocks ---

// InlineFragmentEditor stub: renders a controlled textarea for testability.
// Captures onSave/onCancel so tests can drive save/cancel flows.
let capturedOnSave: ((content: string) => void) | undefined;
let capturedOnCancel: (() => void) | undefined;
let capturedContent: string | undefined;

vi.mock("@components/inline-fragment-editor", () => ({
  InlineFragmentEditor: ({
    content,
    onSave,
    onCancel,
    isSaving,
  }: {
    projectId: string;
    content: string;
    onSave: (content: string) => void;
    onCancel: () => void;
    isSaving: boolean;
  }) => {
    capturedOnSave = onSave;
    capturedOnCancel = onCancel;
    capturedContent = content;
    return (
      <div data-testid="inline-editor">
        <button type="button" onClick={() => onSave(content)} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
      </div>
    );
  },
}));

vi.mock("@components/readonly-prose", () => ({
  ReadonlyProse: ({ content }: { content: string }) => (
    <div data-testid="readonly-prose">{content}</div>
  ),
}));

const { FragmentProse } = await import("../FragmentProse");

const FRAGMENT_UUID = "frag-uuid-1";

describe("FragmentProse — in-context editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnSave = undefined;
    capturedOnCancel = undefined;
    capturedContent = undefined;
  });

  it("renders no edit affordance when onSaveContent is absent", () => {
    render(
      <FragmentProse
        projectId={PROJECT_ID}
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
      />,
    );
    expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
  });

  it("pencil button enters edit mode seeded with the fragment content", async () => {
    const onSaveContent = vi.fn().mockResolvedValue(undefined);
    render(
      <FragmentProse
        projectId={PROJECT_ID}
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Original body"
        isDiscarded={false}
        detailLevel="prose"
        onSaveContent={onSaveContent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit "frag-one"/i }));

    expect(screen.getByTestId("inline-editor")).toBeInTheDocument();
    expect(capturedContent).toBe("Original body");
  });

  it("double-clicking the container enters edit mode", () => {
    const onSaveContent = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <FragmentProse
        projectId={PROJECT_ID}
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Original body"
        detailLevel="prose"
        onSaveContent={onSaveContent}
      />,
    );

    fireEvent.doubleClick(container.firstChild as Element);

    expect(screen.getByTestId("inline-editor")).toBeInTheDocument();
  });

  it("single click selects the fragment without entering edit mode", () => {
    const onSelect = vi.fn();
    const onSaveContent = vi.fn();
    render(
      <FragmentProse
        projectId={PROJECT_ID}
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Original body"
        detailLevel="prose"
        onSelect={onSelect}
        onSaveContent={onSaveContent}
      />,
    );

    // Click the container (not the pencil button)
    const container = screen.getByTestId("readonly-prose").parentElement!.parentElement!;
    fireEvent.click(container);

    expect(onSelect).toHaveBeenCalledWith(FRAGMENT_UUID);
    expect(screen.queryByTestId("inline-editor")).not.toBeInTheDocument();
  });

  it("save calls onSaveContent with the fragment uuid and new content", async () => {
    const onSaveContent = vi.fn().mockResolvedValue(undefined);
    render(
      <FragmentProse
        projectId={PROJECT_ID}
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Original body"
        detailLevel="prose"
        onSaveContent={onSaveContent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit "frag-one"/i }));
    // Trigger save via the stub's save path (passes the new content to onSave)
    await act(async () => {
      capturedOnSave?.("Edited body");
    });

    await waitFor(() => {
      expect(onSaveContent).toHaveBeenCalledWith(FRAGMENT_UUID, "Edited body");
    });
  });

  it("cancel closes the editor without saving", async () => {
    const onSaveContent = vi.fn();
    render(
      <FragmentProse
        projectId={PROJECT_ID}
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Original body"
        isDiscarded={false}
        detailLevel="prose"
        onSaveContent={onSaveContent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit "frag-one"/i }));
    await act(async () => {
      capturedOnCancel?.();
    });

    expect(screen.queryByTestId("inline-editor")).not.toBeInTheDocument();
    expect(onSaveContent).not.toHaveBeenCalled();
  });

  it("pencil icon is still shown and still enters edit mode when onSaveContent is set", () => {
    render(
      <FragmentProse
        projectId={PROJECT_ID}
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Body"
        isDiscarded={false}
        detailLevel="prose"
        onSaveContent={vi.fn()}
      />,
    );

    const pencil = screen.getByRole("button", { name: /Edit "frag-one"/i });
    expect(pencil).toBeInTheDocument();

    fireEvent.click(pencil);
    expect(screen.getByTestId("inline-editor")).toBeInTheDocument();
  });
});

describe("FragmentProse — remove from sequence", () => {
  it("renders no remove affordance when onRemove is absent", () => {
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Remove "frag-one" from sequence/i }),
    ).not.toBeInTheDocument();
  });

  it("invokes onRemove when the trash affordance is clicked", () => {
    const onRemove = vi.fn();
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Remove "frag-one" from sequence/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
