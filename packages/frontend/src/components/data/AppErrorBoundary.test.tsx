import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ApiRequestError } from "@api/errors";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ href: "/projects/p1/fragments" }),
}));

const { AppErrorBoundary } = await import("./AppErrorBoundary");

const wrap = (children: ReactNode) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </QueryClientProvider>,
  );
};

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    // The boundary intentionally lets React log the caught error; silence it so
    // the suite output stays readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("catches a thrown child and renders ViewError", () => {
    const Boom = (): never => {
      throw new ApiRequestError(500, { message: "kaboom" }, "corr-9");
    };
    wrap(<Boom />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    expect(screen.getByText("corr-9")).toBeInTheDocument();
  });

  it("Retry resets the query error boundary and refetches the failed query", async () => {
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(new ApiRequestError(500, { message: "transient" }))
      .mockResolvedValue("recovered");

    const Child = () => {
      const { data } = useQuery({
        queryKey: ["app-error-boundary-test"],
        queryFn,
        throwOnError: true,
        retry: false,
      });
      return <div>loaded: {String(data)}</div>;
    };

    wrap(<Child />);

    // First load fails → boundary surfaces ViewError.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("transient")).toBeInTheDocument();

    // Retry resets the boundary; the refetch resolves and the child renders.
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("loaded: recovered")).toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
