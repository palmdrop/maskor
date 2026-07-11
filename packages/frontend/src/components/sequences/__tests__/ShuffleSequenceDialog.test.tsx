import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { ApiRequestError } from "@api/errors";

const { generateMock } = vi.hoisted(() => ({
  generateMock: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("@api/generated/sequences/sequences", () => ({
  useGenerateSequence: () => generateMock,
  getListSequencesQueryKey: () => ["sequences", "list"],
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { ShuffleSequenceDialog } from "../ShuffleSequenceDialog";
import { toast } from "sonner";

const projectId = "proj-uuid";

const sequence = (overrides: Partial<Sequence>): Sequence =>
  ({
    uuid: "seq",
    name: "Seq",
    isMain: false,
    active: true,
    projectUuid: projectId,
    sections: [],
    ...overrides,
  }) as Sequence;

const main = sequence({ uuid: "main-uuid", name: "Main", isMain: true });
const activeSecondary = sequence({ uuid: "active-uuid", name: "Active Chain", active: true });
const inactiveSecondary = sequence({
  uuid: "inactive-uuid",
  name: "Inactive Chain",
  active: false,
});
const sequences = [main, activeSecondary, inactiveSecondary];

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const renderDialog = (
  overrides: Partial<React.ComponentProps<typeof ShuffleSequenceDialog>> = {},
) =>
  render(
    <ShuffleSequenceDialog
      projectId={projectId}
      sequences={sequences}
      open={true}
      onOpenChange={vi.fn()}
      onGenerated={vi.fn()}
      {...overrides}
    />,
    { wrapper: Wrapper },
  );

beforeEach(() => {
  generateMock.mutateAsync.mockReset();
  generateMock.isPending = false;
  (toast.error as ReturnType<typeof vi.fn>).mockReset();
});

describe("ShuffleSequenceDialog", () => {
  it("lists non-main sequences and pre-checks the active ones", () => {
    renderDialog();
    // Main sequence is not a candidate.
    expect(screen.queryByText("Main")).toBeNull();

    const activeCheckbox = screen
      .getByLabelText(/Active Chain/)
      .closest("label")!
      .querySelector("input")!;
    const inactiveCheckbox = screen
      .getByText("Inactive Chain")
      .closest("label")!
      .querySelector("input")!;
    expect(activeCheckbox).toBeChecked();
    expect(inactiveCheckbox).not.toBeChecked();
  });

  it("generates with the selected constraint ids and reports the new sequence", async () => {
    const created = sequence({ uuid: "new-uuid", name: "Shuffle 1" });
    generateMock.mutateAsync.mockResolvedValue({
      status: 201,
      data: { sequences: [...sequences, created] },
    });
    const onGenerated = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onGenerated, onOpenChange });

    fireEvent.click(screen.getByRole("button", { name: "Shuffle" }));

    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith("new-uuid"));
    expect(generateMock.mutateAsync).toHaveBeenCalledWith({
      projectId,
      data: { constraintSequenceIds: ["active-uuid"] },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an inline conflict and stays open on a constraint cycle", async () => {
    generateMock.mutateAsync.mockRejectedValue(
      new ApiRequestError(409, {
        reason: "constraint_cycle",
        cycles: [{ sequenceUuids: ["active-uuid", "inactive-uuid"], fragmentUuids: ["a", "b"] }],
      }),
    );
    const onGenerated = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onGenerated, onOpenChange });

    fireEvent.click(screen.getByRole("button", { name: "Shuffle" }));

    await waitFor(() => expect(screen.getByText(/contradict each other/i)).toBeInTheDocument());
    // Names resolved from uuids.
    expect(screen.getByText(/Active Chain ↔ Inactive Chain/)).toBeInTheDocument();
    expect(onGenerated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
