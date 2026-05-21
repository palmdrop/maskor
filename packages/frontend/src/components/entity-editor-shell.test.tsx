import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import type { Ref } from "react";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// ---- Stubs ----

const proseGetContentMock = vi.fn(() => "current editor content");
const proseSetContentMock = vi.fn();
const proseGetSelectionMock = vi.fn(() => ({ text: "", isEmpty: true }));
const onChangeRef: { current: (() => void) | undefined } = { current: undefined };

type ProseEditorHandle = {
  getContent: () => string;
  setContent: (value: string) => void;
  getSelection: () => { text: string; isEmpty: boolean };
};

type ProseEditorProps = { content: string; onChange?: () => void; onSave?: () => void };

vi.mock("./prose-editor", () => ({
  ProseEditor: forwardRef<ProseEditorHandle, ProseEditorProps>(function StubEditor(
    { onChange }: ProseEditorProps,
    ref: Ref<ProseEditorHandle>,
  ) {
    useImperativeHandle(ref, () => ({
      getContent: proseGetContentMock,
      setContent: proseSetContentMock,
      getSelection: proseGetSelectionMock,
    }));
    onChangeRef.current = onChange;
    return <div data-testid="prose-stub" />;
  }),
}));

vi.mock("./fragments/extract-to-fragment-dialog", () => ({
  ExtractToFragmentDialog: () => null,
}));

vi.mock("@hooks/useProjectEditorConfig", () => ({
  useProjectEditorConfig: () => ({
    vimMode: false,
    rawMarkdownMode: false,
    fontSize: 14,
    maxParagraphWidth: 80,
  }),
}));

// ---- useEntityContentSwap mock ----
const swapHookMock = vi.fn();
vi.mock("@hooks/useEntityContentSwap", () => ({
  useEntityContentSwap: (...args: unknown[]) => swapHookMock(...args),
}));

import { EntityEditorShell } from "./entity-editor-shell";

const baseProps = {
  label: "Fragment",
  projectId: "project-1",
  entityKind: "fragment" as const,
  entityUUID: "uuid-1",
  entityKey: "my-fragment",
  content: "server content",
  isPending: false,
};

const wrap = ({ children }: { children: ReactNode }) => (
  <CommandsProvider>{children}</CommandsProvider>
);

beforeEach(() => {
  proseGetContentMock.mockReset();
  proseGetContentMock.mockReturnValue("current editor content");
  proseSetContentMock.mockReset();
  proseGetSelectionMock.mockReset();
  proseGetSelectionMock.mockReturnValue({ text: "", isEmpty: true });
  swapHookMock.mockReset();
});

describe("EntityEditorShell — swap integration", () => {
  it("hydrates the editor and marks dirty when a recovery exists on mount", async () => {
    swapHookMock.mockReturnValue({
      recovery: { content: "cached content", at: new Date("2026-05-19T10:00:00.000Z") },
      clear: vi.fn().mockResolvedValue(undefined),
    });
    const onProseChange = vi.fn();

    render(
      <EntityEditorShell
        {...baseProps}
        isDirty={false}
        onProseChange={onProseChange}
        onSaved={() => {}}
        onKeySave={async () => {}}
        onContentSave={async () => {}}
      />,
      { wrapper: wrap },
    );

    await act(async () => {});

    expect(proseSetContentMock).toHaveBeenCalledWith("cached content");
    expect(onProseChange).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/unsaved changes/i);
  });

  it("does not hydrate when no recovery exists", async () => {
    swapHookMock.mockReturnValue({ recovery: null, clear: vi.fn().mockResolvedValue(undefined) });

    render(
      <EntityEditorShell
        {...baseProps}
        isDirty={false}
        onProseChange={() => {}}
        onSaved={() => {}}
        onKeySave={async () => {}}
        onContentSave={async () => {}}
      />,
      { wrapper: wrap },
    );

    await act(async () => {});

    expect(proseSetContentMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears the swap after a successful content save", async () => {
    const clear = vi.fn().mockResolvedValue(undefined);
    swapHookMock.mockReturnValue({ recovery: null, clear });
    const onContentSave = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();

    render(
      <EntityEditorShell
        {...baseProps}
        isDirty={true}
        onProseChange={() => {}}
        onSaved={onSaved}
        onKeySave={async () => {}}
        onContentSave={onContentSave}
      />,
      { wrapper: wrap },
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await act(async () => {});

    expect(onContentSave).toHaveBeenCalledWith("current editor content");
    expect(clear).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("does not clear the swap when content save fails", async () => {
    const clear = vi.fn().mockResolvedValue(undefined);
    swapHookMock.mockReturnValue({ recovery: null, clear });
    const onContentSave = vi.fn().mockRejectedValue(new Error("boom"));
    const onSaved = vi.fn();

    render(
      <EntityEditorShell
        {...baseProps}
        isDirty={true}
        onProseChange={() => {}}
        onSaved={onSaved}
        onKeySave={async () => {}}
        onContentSave={onContentSave}
      />,
      { wrapper: wrap },
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await act(async () => {});

    expect(onContentSave).toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("Restore from server replaces editor content, clears the swap, and calls onContentRevert", async () => {
    const clear = vi.fn().mockResolvedValue(undefined);
    swapHookMock.mockReturnValue({
      recovery: { content: "cached body", at: new Date("2026-05-19T10:00:00.000Z") },
      clear,
    });
    const onContentRevert = vi.fn();

    render(
      <EntityEditorShell
        {...baseProps}
        isDirty={true}
        onProseChange={() => {}}
        onSaved={() => {}}
        onContentRevert={onContentRevert}
        onKeySave={async () => {}}
        onContentSave={async () => {}}
      />,
      { wrapper: wrap },
    );

    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: /restore from server/i }));
    await act(async () => {});

    expect(proseSetContentMock).toHaveBeenLastCalledWith("server content");
    expect(clear).toHaveBeenCalledTimes(1);
    expect(onContentRevert).toHaveBeenCalledTimes(1);
  });
});
