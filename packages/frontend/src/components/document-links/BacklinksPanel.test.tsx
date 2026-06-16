import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}));

const useListBacklinksMock = vi.fn();
vi.mock("@api/generated/links/links", () => ({
  useListBacklinks: (...args: unknown[]) => useListBacklinksMock(...args),
}));

import { BacklinksPanel } from "./BacklinksPanel";

describe("BacklinksPanel", () => {
  it("renders nothing when there are no backlinks", () => {
    useListBacklinksMock.mockReturnValue({ data: { status: 200, data: [] } });
    const { container } = render(
      <BacklinksPanel projectId="p" targetType="note" targetKey="setting" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists referring bodies with their key, type, and snippet", () => {
    useListBacklinksMock.mockReturnValue({
      data: {
        status: 200,
        data: [
          {
            sourceType: "fragment",
            sourceUuid: "frag-1",
            sourceKey: "chapter-1",
            alias: null,
            snippet: "…links [[notes/setting]]…",
          },
        ],
      },
    });
    render(<BacklinksPanel projectId="p" targetType="note" targetKey="setting" />);
    expect(screen.getByText("Backlinks (1)")).toBeInTheDocument();
    expect(screen.getByText("chapter-1")).toBeInTheDocument();
    expect(screen.getByText("…links [[notes/setting]]…")).toBeInTheDocument();
  });
});
