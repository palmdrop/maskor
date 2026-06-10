import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { LogEntry } from "@maskor/shared";
import type { ExistenceMaps } from "../ProjectHistoryPage/ActionLogList";

const PROJECT_ID = "proj-1";
const FRAG_UUID = "frag-uuid-1";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  Link: ({ children }: { children: ReactNode }) => <span data-testid="entry-link">{children}</span>,
}));

vi.mock("../../api/action-log", () => ({ useActionLog: vi.fn() }));
vi.mock("../../api/generated/fragments/fragments", () => ({ useListFragments: vi.fn() }));
vi.mock("../../api/generated/aspects/aspects", () => ({ useListAspects: vi.fn() }));
vi.mock("../../api/generated/notes/notes", () => ({ useListNotes: vi.fn() }));
vi.mock("../../api/generated/references/references", () => ({ useListReferences: vi.fn() }));

const emptyEntityResponse = () => ({ status: 200 as const, data: [] });

// LogEntry is a 54-variant discriminated union; building one by spread of
// Partial<LogEntry> can't satisfy the discriminator narrowing, so cast at
// the helper boundary. Test consumers still get strict LogEntry typing.
const makeEntry = (overrides: Partial<LogEntry> & { id?: string } = {}): LogEntry =>
  ({
    id: overrides.id ?? crypto.randomUUID(),
    type: "fragment:edited",
    timestamp: "2026-01-01T12:00:00Z",
    actor: "user",
    target: { type: "fragment", uuid: FRAG_UUID, key: "test-fragment" },
    payload: {},
    undoable: true,
    ...overrides,
  }) as LogEntry;

const emptyExistence: ExistenceMaps = {
  fragment: new Set(),
  aspect: new Set(),
  note: new Set(),
  reference: new Set(),
};

const wrap = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const { useActionLog } = await import("../../api/action-log");
const { useListFragments } = await import("../../api/generated/fragments/fragments");
const { useListAspects } = await import("../../api/generated/aspects/aspects");
const { useListNotes } = await import("../../api/generated/notes/notes");
const { useListReferences } = await import("../../api/generated/references/references");

const { ProjectHistoryPage } = await import("../ProjectHistoryPage");
const { ActionLogList } = await import("../ProjectHistoryPage/ActionLogList");

const mockEntityLists = () => {
  (useListFragments as Mock).mockReturnValue({ data: emptyEntityResponse() });
  (useListAspects as Mock).mockReturnValue({ data: emptyEntityResponse() });
  (useListNotes as Mock).mockReturnValue({ data: emptyEntityResponse() });
  (useListReferences as Mock).mockReturnValue({ data: emptyEntityResponse() });
};

describe("ProjectHistoryPage — page states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntityLists();
  });

  it("shows loading state while action log is fetching", () => {
    (useActionLog as Mock).mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ProjectHistoryPage />, { wrapper: wrap() });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows error state when action log fetch fails", () => {
    (useActionLog as Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ProjectHistoryPage />, { wrapper: wrap() });
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it("shows empty state when there are no entries", () => {
    (useActionLog as Mock).mockReturnValue({
      data: { status: 200, data: [] },
      isLoading: false,
      isError: false,
    });
    render(<ProjectHistoryPage />, { wrapper: wrap() });
    expect(screen.getByText(/no actions recorded/i)).toBeInTheDocument();
  });

  it("renders the page heading and subtitle", () => {
    (useActionLog as Mock).mockReturnValue({
      data: { status: 200, data: [] },
      isLoading: false,
      isError: false,
    });
    render(<ProjectHistoryPage />, { wrapper: wrap() });
    expect(screen.getByText(/recent actions/i)).toBeInTheDocument();
    expect(screen.getByText(/external vault edits are not tracked/i)).toBeInTheDocument();
  });
});

describe("ActionLogList — rendering", () => {
  it("shows empty state when entries array is empty", () => {
    render(<ActionLogList projectId={PROJECT_ID} entries={[]} existence={emptyExistence} />);
    expect(screen.getByText(/no actions recorded/i)).toBeInTheDocument();
  });

  it("renders entry text from the renderer", () => {
    const entries = [makeEntry()];
    render(<ActionLogList projectId={PROJECT_ID} entries={entries} existence={emptyExistence} />);
    expect(screen.getByText(/fragment "test-fragment" edited/i)).toBeInTheDocument();
  });

  it("renders the domain chip for each entry", () => {
    const entries = [makeEntry()];
    render(<ActionLogList projectId={PROJECT_ID} entries={entries} existence={emptyExistence} />);
    expect(screen.getByText("FRAGMENTS")).toBeInTheDocument();
  });

  it("groups entries under separate day headers when timestamps span multiple days", () => {
    const entries = [
      makeEntry({ id: "a", timestamp: "2026-01-01T10:00:00Z" }),
      makeEntry({ id: "b", timestamp: "2026-01-02T10:00:00Z" }),
    ];
    render(<ActionLogList projectId={PROJECT_ID} entries={entries} existence={emptyExistence} />);
    const dayHeaders = screen.getAllByRole("heading", { level: 4 });
    expect(dayHeaders.length).toBe(2);
  });

  it("places same-day entries under one day header", () => {
    const entries = [
      makeEntry({ id: "a", timestamp: "2026-01-01T10:00:00Z" }),
      makeEntry({ id: "b", timestamp: "2026-01-01T14:30:00Z" }),
    ];
    render(<ActionLogList projectId={PROJECT_ID} entries={entries} existence={emptyExistence} />);
    const dayHeaders = screen.getAllByRole("heading", { level: 4 });
    expect(dayHeaders.length).toBe(1);
  });

  it("renders a link for a linkable entry whose entity exists", () => {
    const entries = [makeEntry()];
    const existence: ExistenceMaps = {
      fragment: new Set([FRAG_UUID]),
      aspect: new Set(),
      note: new Set(),
      reference: new Set(),
    };
    render(<ActionLogList projectId={PROJECT_ID} entries={entries} existence={existence} />);
    expect(screen.getByTestId("entry-link")).toBeInTheDocument();
  });

  it("does not render a link when the entity is absent from the existence map", () => {
    const entries = [makeEntry()];
    render(<ActionLogList projectId={PROJECT_ID} entries={entries} existence={emptyExistence} />);
    expect(screen.queryByTestId("entry-link")).not.toBeInTheDocument();
  });
});
