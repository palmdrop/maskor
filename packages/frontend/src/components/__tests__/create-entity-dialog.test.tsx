import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateEntityDialog } from "../create-entity-dialog";

const sequenceOptions = [
  { uuid: "seq-1", name: "Chapter 1" },
  { uuid: "seq-2", name: "Chapter 2" },
];

describe("CreateEntityDialog — sequence picker", () => {
  it("pre-selects the default sequence and passes it to onCreate", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateEntityDialog
        triggerLabel="New fragment"
        dialogTitle="New fragment"
        entityName="fragment"
        contentRequired
        isPending={false}
        onCreate={onCreate}
        sequenceOptions={sequenceOptions}
        defaultSequenceId="seq-2"
      />,
    );

    await user.click(screen.getByRole("button", { name: "New fragment" }));

    // The picker renders and reflects the pre-selected default.
    expect(screen.getByText("Add to sequence (optional)")).toBeInTheDocument();
    expect(screen.getByText("Chapter 2")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Key"), "new-scene");
    await user.type(screen.getByLabelText("Content"), "body");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("new-scene", "body", "seq-2"));
  });

  it("passes undefined when the picker is absent", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateEntityDialog
        triggerLabel="New note"
        dialogTitle="New note"
        entityName="note"
        isPending={false}
        onCreate={onCreate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New note" }));
    expect(screen.queryByText("Add to sequence (optional)")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Key"), "a-note");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("a-note", "", undefined));
  });

  it("defaults to None when no default sequence is given, passing undefined", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateEntityDialog
        triggerLabel="New fragment"
        dialogTitle="New fragment"
        entityName="fragment"
        contentRequired
        isPending={false}
        onCreate={onCreate}
        sequenceOptions={sequenceOptions}
        defaultSequenceId={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New fragment" }));
    expect(screen.getByText("None")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Key"), "loose");
    await user.type(screen.getByLabelText("Content"), "body");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("loose", "body", undefined));
  });
});
