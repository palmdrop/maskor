import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiRequestError } from "@api/errors";
import { ViewError } from "./ViewError";

describe("ViewError", () => {
  it("renders an ApiRequestError's message, status, and correlation id", () => {
    const error = new ApiRequestError(503, { message: "Index unavailable" }, "corr-123");
    render(<ViewError error={error} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("503")).toBeInTheDocument();
    expect(screen.getByText("corr-123")).toBeInTheDocument();
    expect(screen.getByText("Index unavailable")).toBeInTheDocument();
  });

  it("renders a plain Error's message and omits status/correlation", () => {
    render(<ViewError error={new Error("network down")} />);
    expect(screen.getByText("network down")).toBeInTheDocument();
    expect(screen.queryByText("Correlation")).not.toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
  });

  it("shows Retry only when onRetry is provided and calls it on click", async () => {
    const { rerender } = render(<ViewError error={new Error("boom")} />);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();

    const onRetry = vi.fn();
    rerender(<ViewError error={new Error("boom")} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
