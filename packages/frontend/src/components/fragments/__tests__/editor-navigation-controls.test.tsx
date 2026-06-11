import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EditorNavigationControls } from "../editor-navigation-controls";

afterEach(cleanup);

describe("EditorNavigationControls", () => {
  it("renders Previous and Next, both enabled by default", () => {
    render(<EditorNavigationControls onNext={vi.fn()} onPrevious={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("dispatches onNext / onPrevious on click", () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    render(<EditorNavigationControls onNext={onNext} onPrevious={onPrevious} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrevious).toHaveBeenCalledOnce();
  });

  it("disables a button only at its explicit boundary (hasNext / hasPrevious === false)", () => {
    render(
      <EditorNavigationControls
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        hasNext={false}
        hasPrevious
      />,
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("disables both and shows loading while navigating", () => {
    render(<EditorNavigationControls onNext={vi.fn()} onPrevious={vi.fn()} isNavigating />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    const next = screen.getByRole("button", { name: "Loading…" });
    expect(next).toBeDisabled();
  });
});
