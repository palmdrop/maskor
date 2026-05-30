import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { ReadonlyProse } from "./readonly-prose";
import { anchorSentinel } from "./anchor-sentinel";

const renderProse = (content: string) =>
  render(<ReadonlyProse content={content} fontSize={16} maxParagraphWidth={72} />);

describe("ReadonlyProse", () => {
  it("renders markdown content as prose", async () => {
    const { container } = renderProse("## A heading\n\nSome **bold** body text.");
    await waitFor(() => {
      expect(container.querySelector("h2")?.textContent).toBe("A heading");
    });
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });

  it("turns an anchor sentinel into an invisible div with id=fragment-<id>", async () => {
    const content = `${anchorSentinel("frag-xyz")}\n\nThe body that follows the anchor.`;
    const { container } = renderProse(content);

    await waitFor(() => {
      expect(container.querySelector("#fragment-frag-xyz")).not.toBeNull();
    });

    const anchor = container.querySelector("#fragment-frag-xyz");
    // The anchor renders no visible text — only the body paragraph is visible.
    expect(anchor?.textContent).toBe("");
    expect(container.textContent).toContain("The body that follows the anchor.");
    // The raw sentinel control characters never leak into the rendered text.
    expect(container.textContent).not.toContain("maskor-anchor");
  });

  it("keeps html:false — raw HTML in content is escaped, not executed", async () => {
    const content = "Before <script>window.__pwned = true</script> after.";
    const { container } = renderProse(content);

    await waitFor(() => {
      expect(container.textContent).toContain("Before");
    });

    // No script element materializes; the markup renders as visible text.
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>");
  });
});
