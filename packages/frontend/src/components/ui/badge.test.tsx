import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders children with the default variant", () => {
    render(<Badge>New</Badge>);
    const badge = screen.getByText("New");
    expect(badge).toHaveAttribute("data-variant", "default");
    expect(badge).toHaveClass("bg-primary");
  });

  it("applies the requested variant tokens", () => {
    render(<Badge variant="outline">Imported</Badge>);
    const badge = screen.getByText("Imported");
    expect(badge).toHaveAttribute("data-variant", "outline");
    expect(badge).toHaveClass("border-border");
  });

  it("renders as the child element when asChild is set", () => {
    render(
      <Badge asChild>
        <a href="/x">Link badge</a>
      </Badge>,
    );
    const link = screen.getByRole("link", { name: "Link badge" });
    expect(link).toHaveAttribute("data-slot", "badge");
  });
});
