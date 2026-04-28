import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

// Standalone dummy component — no import of actual source code
const Counter = ({ label }: { label: string }) => {
  const [count, setCount] = useState(0);
  return (
    <div>
      <span>{label}</span>
      <button onClick={() => setCount((c) => c + 1)}>increment</button>
      <output>{count}</output>
    </div>
  );
};

describe("@maskor/frontend", () => {
  it("renders a label", () => {
    render(<Counter label="Fragments processed" />);
    expect(screen.getByText("Fragments processed")).toBeInTheDocument();
  });

  it("increments count when button is clicked", async () => {
    render(<Counter label="test" />);
    const button = screen.getByRole("button", { name: /increment/i });
    await userEvent.click(button);
    expect(screen.getByRole("status")).toHaveTextContent("1");
  });
});
