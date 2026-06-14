import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Render the description through a lightweight stub — the real renderer instantiates a Tiptap editor.
vi.mock("@components/readonly-prose", () => ({
  ReadonlyProse: ({ content }: { content: string }) => <div data-testid="prose">{content}</div>,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

import { AspectPreview } from "./aspect-preview";
import { getListAspectsQueryKey, getGetAspectQueryKey } from "@api/generated/aspects/aspects";

const projectId = "project-1";

const renderPreview = (aspectKey: string, seed: (queryClient: QueryClient) => void) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(queryClient);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<AspectPreview projectId={projectId} aspectKey={aspectKey} />, { wrapper: Wrapper });
};

describe("AspectPreview", () => {
  it("renders the description, notes, and an open-aspect link", () => {
    renderPreview("the-river", (queryClient) => {
      queryClient.setQueryData(getListAspectsQueryKey(projectId), {
        data: [{ uuid: "aspect-river", key: "the-river", notes: [] }],
        status: 200,
        headers: new Headers(),
      });
      queryClient.setQueryData(getGetAspectQueryKey(projectId, "aspect-river"), {
        data: {
          uuid: "aspect-river",
          key: "the-river",
          description: "A recurring motif of forgetting.",
          notes: ["setting"],
        },
        status: 200,
        headers: new Headers(),
      });
    });

    expect(screen.getByTestId("prose")).toHaveTextContent("A recurring motif of forgetting.");
    expect(screen.getByText("setting")).toBeInTheDocument();
    expect(screen.getByText("Open aspect")).toBeInTheDocument();
  });

  it("renders a no-description note when the aspect body is empty", () => {
    renderPreview("the-river", (queryClient) => {
      queryClient.setQueryData(getListAspectsQueryKey(projectId), {
        data: [{ uuid: "aspect-river", key: "the-river", notes: [] }],
        status: 200,
        headers: new Headers(),
      });
      queryClient.setQueryData(getGetAspectQueryKey(projectId, "aspect-river"), {
        data: { uuid: "aspect-river", key: "the-river", description: "", notes: [] },
        status: 200,
        headers: new Headers(),
      });
    });

    expect(screen.getByText("No description.")).toBeInTheDocument();
    expect(screen.queryByTestId("prose")).not.toBeInTheDocument();
  });

  it("notes when the aspect has no definition in the project", () => {
    renderPreview("missing", (queryClient) => {
      queryClient.setQueryData(getListAspectsQueryKey(projectId), {
        data: [],
        status: 200,
        headers: new Headers(),
      });
    });

    expect(screen.getByText("This aspect has no definition in the project.")).toBeInTheDocument();
  });
});
