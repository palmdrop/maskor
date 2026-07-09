import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { EMPTY_LINK_LOOKUPS } from "@lib/document-links/resolver";
import { SlotEditor, type SlotLinkApi } from "./slot-editor";

const documentLinks = (navigate = vi.fn()): SlotLinkApi => ({
  lookups: { ...EMPTY_LINK_LOOKUPS, notes: new Map([["setting", "note-uuid"]]) },
  suggestionItems: [{ pathType: "notes", key: "setting" }],
  navigate,
});

describe("SlotEditor document links", () => {
  it("decorates a resolved [[link]] in the rich comment editor", async () => {
    const { container } = render(
      <SlotEditor
        value="see [[notes/setting]]"
        mode="rich"
        onChange={vi.fn()}
        documentLinks={documentLinks()}
      />,
    );
    // The DocumentLink extension decorates the resolved link range with `.doc-link`.
    await waitFor(() => expect(container.querySelector(".doc-link")).not.toBeNull());
  });

  it("marks a broken [[link]] in the rich comment editor", async () => {
    const { container } = render(
      <SlotEditor
        value="see [[notes/missing]]"
        mode="rich"
        onChange={vi.fn()}
        documentLinks={documentLinks()}
      />,
    );
    await waitFor(() => expect(container.querySelector(".doc-link-broken")).not.toBeNull());
  });

  it("does not decorate links when no link surface is wired", async () => {
    const { container } = render(
      <SlotEditor value="see [[notes/setting]]" mode="rich" onChange={vi.fn()} />,
    );
    // Give the editor a beat to mount; without documentLinks nothing is decorated.
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull());
    expect(container.querySelector(".doc-link")).toBeNull();
  });
});
