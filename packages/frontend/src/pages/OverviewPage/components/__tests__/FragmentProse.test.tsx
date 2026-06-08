import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FragmentProse } from "../FragmentProse";

const FRAGMENT_UUID = "frag-uuid-1";

describe("FragmentProse — in-context editing", () => {
  it("renders no edit affordance when onSaveContent is absent", () => {
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Hello world"
        isDiscarded={false}
        detailLevel="prose"
      />,
    );
    expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
  });

  it("opens an editor seeded with the fragment content and saves the edit back to its uuid", async () => {
    const onSaveContent = vi.fn().mockResolvedValue(undefined);
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Original body"
        isDiscarded={false}
        detailLevel="prose"
        onSaveContent={onSaveContent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit "frag-one"/i }));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Original body");

    fireEvent.change(textarea, { target: { value: "Edited body" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      // The selection→fragment mapping: the editor saves to its own fragmentUuid.
      expect(onSaveContent).toHaveBeenCalledWith(FRAGMENT_UUID, "Edited body");
    });
  });

  it("cancels editing without saving and restores the original content", () => {
    const onSaveContent = vi.fn();
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Original body"
        isDiscarded={false}
        detailLevel="prose"
        onSaveContent={onSaveContent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit "frag-one"/i }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Discarded edit" } });
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));

    expect(onSaveContent).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    // Re-opening shows the unchanged original, not the discarded draft.
    fireEvent.click(screen.getByRole("button", { name: /Edit "frag-one"/i }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Original body");
  });

  it("saves on ⌘/Ctrl+Enter from within the editor", async () => {
    const onSaveContent = vi.fn().mockResolvedValue(undefined);
    render(
      <FragmentProse
        fragmentUuid={FRAGMENT_UUID}
        title="frag-one"
        content="Body"
        isDiscarded={false}
        detailLevel="prose"
        onSaveContent={onSaveContent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Edit "frag-one"/i }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Quick saved" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(onSaveContent).toHaveBeenCalledWith(FRAGMENT_UUID, "Quick saved");
    });
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
