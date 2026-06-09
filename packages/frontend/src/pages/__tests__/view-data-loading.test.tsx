import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect, useRef, Suspense } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
  type QueryClient as QueryClientType,
} from "@tanstack/react-query";
import {
  createRouter,
  createRootRoute,
  createRoute,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { ApiRequestError } from "@api/errors";
import { RouteErrorComponent } from "@components/data/RouteErrorComponent";
import { ViewPending } from "@components/data/ViewPending";
import { shouldThrowToBoundary } from "../../queryClient";

// Exercises the Phase 2 data-loading mechanism end-to-end through the real
// router infra (loader prefetch -> useSuspenseQuery -> defaultErrorComponent ->
// Retry -> restoration), with two queries to prove the loader fans out in
// parallel rather than waterfalling.

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};
const defer = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const queryOneFn = vi.fn<() => Promise<string>>();
const queryTwoFn = vi.fn<() => Promise<string>>();
const restorationSpy = vi.fn();

const optionsOne = () => ({ queryKey: ["one"], queryFn: queryOneFn });
const optionsTwo = () => ({ queryKey: ["two"], queryFn: queryTwoFn });

const TestView = () => {
  const { data: one } = useSuspenseQuery(optionsOne());
  const { data: two } = useSuspenseQuery(optionsTwo());

  // Restoration collapsed onto the ready state: runs once on first
  // render-with-data, never when the view errored before reaching here.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    restorationSpy();
  }, []);

  return (
    <div>
      ready: {one} {two}
    </div>
  );
};

const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, throwOnError: shouldThrowToBoundary },
    },
  });

const renderRouter = (client: QueryClientType) => {
  const rootRoute = createRootRoute();
  const viewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: TestView,
    loader: () =>
      Promise.allSettled([
        client.ensureQueryData(optionsOne()),
        client.ensureQueryData(optionsTwo()),
      ]),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([viewRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    defaultErrorComponent: RouteErrorComponent,
    defaultPendingComponent: ViewPending,
    context: {},
  });
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={<ViewPending />}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <RouterProvider router={router as any} />
      </Suspense>
    </QueryClientProvider>,
  );
};

describe("view data loading (loader + suspense + boundary + retry)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryOneFn.mockReset();
    queryTwoFn.mockReset();
    restorationSpy.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("fires the loader's queries in parallel (no waterfall)", async () => {
    const first = defer<string>();
    queryOneFn.mockReturnValue(first.promise);
    queryTwoFn.mockResolvedValue("two");

    renderRouter(makeClient());

    // The second query must have been invoked without waiting for the first to
    // settle — proof the loader fanned out rather than awaiting sequentially.
    await vi.waitFor(() => expect(queryTwoFn).toHaveBeenCalledTimes(1));
    expect(queryOneFn).toHaveBeenCalledTimes(1);

    first.resolve("one");
    expect(await screen.findByText(/ready: one two/)).toBeInTheDocument();
  });

  it("renders with data and runs restoration once after ready", async () => {
    queryOneFn.mockResolvedValue("one");
    queryTwoFn.mockResolvedValue("two");

    renderRouter(makeClient());

    expect(await screen.findByText(/ready: one two/)).toBeInTheDocument();
    expect(restorationSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces ViewError + Retry on a 5xx and skips restoration, then resumes after a successful Retry", async () => {
    queryOneFn
      .mockRejectedValueOnce(new ApiRequestError(503, { message: "index down" }, "corr-77"))
      .mockResolvedValue("one");
    queryTwoFn.mockResolvedValue("two");

    renderRouter(makeClient());

    // The failed load surfaces the shared in-place error, and restoration was
    // correctly skipped (the view never reached ready).
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("index down")).toBeInTheDocument();
    expect(screen.getByText("corr-77")).toBeInTheDocument();
    expect(restorationSpy).not.toHaveBeenCalled();

    // Retry refetches; the view reaches ready and restoration runs then.
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/ready: one two/)).toBeInTheDocument();
    expect(restorationSpy).toHaveBeenCalledTimes(1);
  });

  it("retries do not run restoration while still failing", async () => {
    queryOneFn.mockRejectedValue(new ApiRequestError(500, { message: "still down" }));
    queryTwoFn.mockResolvedValue("two");

    renderRouter(makeClient());

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    // Still failing → still the error panel, restoration never ran.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(restorationSpy).not.toHaveBeenCalled();
  });
});
