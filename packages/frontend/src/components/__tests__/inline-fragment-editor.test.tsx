import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import type { ProseEditorHandle } from "@components/prose-editor";

// --- Mocks ---

let capturedOnSave: (() => void) | undefined;
let mockEditorContent = "initial content";

vi.mock("@components/prose-editor", () => ({
  ProseEditor: forwardRef<
    ProseEditorHandle,
    { content: string; vimMode: boolean; onSave?: () => void }
  >(function ProseEditorStub({ content, vimMode, onSave }, ref) {
    capturedOnSave = onSave;
    useImperativeHandle(ref, () => ({
      getContent: () => mockEditorContent,
      setContent: vi.fn(),
      getSelection: () => ({ text: "", isEmpty: true }),
      focus: vi.fn(),
      getCurrentBlock: () => null,
      addAnchorAtBlock: vi.fn(),
      removeAnchor: vi.fn(),
      revealAnchor: vi.fn(),
      focusAnchorBlock: vi.fn(),
      getScrollElement: () => null,
      getBlocks: () => [],
      setHighlightedAnchor: vi.fn(),
    }));
    return (
      <div
        data-testid="prose-editor-stub"
        data-content={content}
        data-vim-mode={String(vimMode)}
      />
    );
  }),
}));

vi.mock("@hooks/useProjectEditorConfig", () => ({
  useProjectEditorConfig: vi.fn(),
}));

const { useProjectEditorConfig } = await import("@hooks/useProjectEditorConfig");
const { InlineFragmentEditor } = await import("../inline-fragment-editor");

const PROJECT_ID = "project-1";

const defaultConfig = {
  vimMode: false,
  rawMarkdownMode: false,
  fontSize: 16,
  maxParagraphWidth: 72,
  vimClipboardSync: true,
};

describe("InlineFragmentEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEditorContent = "initial content";
    capturedOnSave = undefined;
    (useProjectEditorConfig as Mock).mockReturnValue(defaultConfig);
  });

  it("renders ProseEditor seeded with the incoming content", () => {
    render(
      <InlineFragmentEditor
        projectId={PROJECT_ID}
        content="Hello world"
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={false}
      />,
    );
    expect(screen.getByTestId("prose-editor-stub")).toHaveAttribute("data-content", "Hello world");
  });

  it("passes vimMode from project config to ProseEditor", () => {
    (useProjectEditorConfig as Mock).mockReturnValue({ ...defaultConfig, vimMode: true });

    render(
      <InlineFragmentEditor
        projectId={PROJECT_ID}
        content="body"
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={false}
      />,
    );
    expect(screen.getByTestId("prose-editor-stub")).toHaveAttribute("data-vim-mode", "true");
  });

  it("save button emits the current editor content", async () => {
    mockEditorContent = "edited body";
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <InlineFragmentEditor
        projectId={PROJECT_ID}
        content="original body"
        onSave={onSave}
        onCancel={vi.fn()}
        isSaving={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("edited body");
    });
  });

  it("cancel button calls onCancel without saving", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <InlineFragmentEditor
        projectId={PROJECT_ID}
        content="body"
        onSave={onSave}
        onCancel={onCancel}
        isSaving={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Cmd+Enter saves the current editor content", async () => {
    mockEditorContent = "keyboard saved";
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <InlineFragmentEditor
        projectId={PROJECT_ID}
        content="body"
        onSave={onSave}
        onCancel={vi.fn()}
        isSaving={false}
      />,
    );

    fireEvent.keyDown(container.firstChild as Element, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("keyboard saved");
    });
  });

  it("Ctrl+Enter saves the current editor content", async () => {
    mockEditorContent = "ctrl saved";
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <InlineFragmentEditor
        projectId={PROJECT_ID}
        content="body"
        onSave={onSave}
        onCancel={vi.fn()}
        isSaving={false}
      />,
    );

    fireEvent.keyDown(container.firstChild as Element, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("ctrl saved");
    });
  });

  it("Esc calls onCancel", () => {
    const onCancel = vi.fn();

    const { container } = render(
      <InlineFragmentEditor
        projectId={PROJECT_ID}
        content="body"
        onSave={vi.fn()}
        onCancel={onCancel}
        isSaving={false}
      />,
    );

    fireEvent.keyDown(container.firstChild as Element, { key: "Escape" });

    expect(onCancel).toHaveBeenCalled();
  });

  it("onSave prop wired to ProseEditor fires save (vim :w path)", async () => {
    mockEditorContent = "vim saved";
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <InlineFragmentEditor
        projectId={PROJECT_ID}
        content="body"
        onSave={onSave}
        onCancel={vi.fn()}
        isSaving={false}
      />,
    );

    capturedOnSave?.();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("vim saved");
    });
  });

  it("shows 'Saving…' label and disables buttons while isSaving", () => {
    render(
      <InlineFragmentEditor
        projectId={PROJECT_ID}
        content="body"
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={true}
      />,
    );

    expect(screen.getByRole("button", { name: /Saving…/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeDisabled();
  });
});
