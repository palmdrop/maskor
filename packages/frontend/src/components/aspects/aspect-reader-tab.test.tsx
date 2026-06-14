import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// The reader tab's responsibility is the list / accordion / orphan logic — not the preview internals
// (which instantiate a Tiptap renderer). Stub the preview so these tests stay fast and focused.
vi.mock("./aspect-preview", () => ({
  AspectPreview: ({ aspectKey }: { aspectKey: string }) => (
    <div data-testid="aspect-preview">{aspectKey}</div>
  ),
}));

import { AspectReaderTab } from "./aspect-reader-tab";
import { getListAspectsQueryKey } from "@api/generated/aspects/aspects";
import type { Fragment } from "@api/generated/maskorAPI.schemas";

const projectId = "project-1";

const baseFragment: Fragment = {
  uuid: "fragment-1",
  key: "late-winter",
  content: "body",
  readiness: 0,
  contentHash: "hash",
  references: [],
  isDiscarded: false,
  aspects: {},
  updatedAt: new Date().toISOString(),
};

const seedAspects = (queryClient: QueryClient) => {
  queryClient.setQueryData(getListAspectsQueryKey(projectId), {
    data: [{ uuid: "aspect-river", key: "the-river", category: undefined, notes: [] }],
    status: 200,
    headers: new Headers(),
  });
};

const renderTab = (fragment: Fragment, expandedAspectKey: string | null, onToggle = vi.fn()) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seedAspects(queryClient);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <AspectReaderTab
      projectId={projectId}
      fragment={fragment}
      expandedAspectKey={expandedAspectKey}
      onToggle={onToggle}
    />,
    { wrapper: Wrapper },
  );
  return onToggle;
};

describe("AspectReaderTab", () => {
  it("shows the empty state when the fragment has no aspects", () => {
    renderTab(baseFragment, null);
    expect(screen.getByText("No aspects on this fragment.")).toBeInTheDocument();
  });

  it("lists attached aspects with their weights and flags orphans", () => {
    const fragment: Fragment = {
      ...baseFragment,
      aspects: { "the-river": { weight: 0.7 }, ghost: { weight: 0.3 } },
    };
    renderTab(fragment, null);
    expect(screen.getByText("the-river")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("ghost")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    // ghost is not in the project aspect list → orphaned.
    expect(screen.getByLabelText("orphaned aspect")).toBeInTheDocument();
  });

  it("renders the preview only for the expanded live aspect", () => {
    const fragment: Fragment = {
      ...baseFragment,
      aspects: { "the-river": { weight: 0.7 } },
    };
    renderTab(fragment, "the-river");
    expect(screen.getByTestId("aspect-preview")).toHaveTextContent("the-river");
  });

  it("shows a create affordance instead of a preview for an expanded orphan", () => {
    const fragment: Fragment = {
      ...baseFragment,
      aspects: { ghost: { weight: 0.5 } },
    };
    renderTab(fragment, "ghost");
    expect(screen.queryByTestId("aspect-preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create aspect" })).toBeInTheDocument();
  });

  it("toggles via the row header", () => {
    const fragment: Fragment = {
      ...baseFragment,
      aspects: { "the-river": { weight: 0.7 } },
    };
    const onToggle = renderTab(fragment, null);
    fireEvent.click(screen.getByRole("button", { name: /the-river/ }));
    expect(onToggle).toHaveBeenCalledWith("the-river");
  });
});
