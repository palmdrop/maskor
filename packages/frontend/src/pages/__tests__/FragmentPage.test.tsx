import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render } from "@testing-library/react";
import { readLastFragment } from "@lib/nav-state";

const PROJECT_ID = "proj-1";
const FRAG_A = "frag-aaa";
const FRAG_B = "frag-bbb";

// useParams is mutable so a single mount can move between fragments, mirroring
// the real route which reuses the FragmentPage instance across fragment changes.
let currentParams: { projectId: string; fragmentId: string } = {
  projectId: PROJECT_ID,
  fragmentId: FRAG_A,
};

vi.mock("@tanstack/react-router", () => ({
  useParams: () => currentParams,
  useNavigate: () => vi.fn(),
}));

// Navigation wiring is exercised by scopes/fragment-nav.test.ts; here we only care
// about last-fragment persistence, so stub the command + order surfaces (this also
// keeps the command catalog out of this suite's module graph).
vi.mock("@lib/commands/useCommands", () => ({ useCommands: () => ({ run: vi.fn() }) }));
vi.mock("@lib/commands/useCommandScope", () => ({ useCommandScope: () => {} }));
vi.mock("@contexts/FragmentListOrderContext", () => ({ useFragmentListOrder: () => null }));

const recordFragmentVisitMock = vi.fn((_projectId: string, _fragmentId: string) =>
  Promise.resolve(),
);
vi.mock("@api/generated/suggestion/suggestion", () => ({
  RecordFragmentVisit: (projectId: string, fragmentId: string) =>
    recordFragmentVisitMock(projectId, fragmentId),
}));

const useGetFragmentMock = vi.fn(() => ({ isError: false }));
vi.mock("@api/generated/fragments/fragments", () => ({
  useGetFragment: (...args: unknown[]) => (useGetFragmentMock as Mock)(...args),
}));

// The editor is heavy and irrelevant here; stub it so the page mounts cheaply.
vi.mock("@components/fragments/fragment-editor", () => ({
  FragmentEditor: () => null,
}));

const { FragmentPage } = await import("../FragmentPage");

describe("FragmentPage — last-fragment persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    recordFragmentVisitMock.mockClear();
    useGetFragmentMock.mockReturnValue({ isError: false });
    currentParams = { projectId: PROJECT_ID, fragmentId: FRAG_A };
  });

  it("persists the opened fragment", () => {
    render(<FragmentPage />);

    expect(readLastFragment(PROJECT_ID)).toBe(FRAG_A);
    expect(recordFragmentVisitMock).toHaveBeenCalledWith(PROJECT_ID, FRAG_A);
  });

  it("persists a subsequent fragment when the same mount navigates to it", () => {
    const { rerender } = render(<FragmentPage />);
    expect(readLastFragment(PROJECT_ID)).toBe(FRAG_A);

    currentParams = { projectId: PROJECT_ID, fragmentId: FRAG_B };
    rerender(<FragmentPage />);

    expect(readLastFragment(PROJECT_ID)).toBe(FRAG_B);
    expect(recordFragmentVisitMock).toHaveBeenCalledWith(PROJECT_ID, FRAG_B);
  });

  it("clears the stored slot when the fragment turns out to be missing", () => {
    const { rerender } = render(<FragmentPage />);
    expect(readLastFragment(PROJECT_ID)).toBe(FRAG_A);

    // The query resolves to an error (deleted fragment); the slot is cleared so
    // the navbar does not loop back to it.
    useGetFragmentMock.mockReturnValue({ isError: true });
    rerender(<FragmentPage />);

    expect(readLastFragment(PROJECT_ID)).toBeNull();
  });
});
