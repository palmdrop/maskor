import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { FragmentSummary } from "@api/generated/maskorAPI.schemas";
import { VerticalArcStrip } from "../VerticalArcStrip";

const makeFragment = (uuid: string, aspects: Record<string, { weight: number }>): FragmentSummary =>
  ({
    uuid,
    key: uuid,
    isDiscarded: false,
    excerpt: null,
    aspects,
  }) as unknown as FragmentSummary;

const colors = new Map([
  ["grief", "#ff0000"],
  ["hope", "#00ff00"],
]);

describe("VerticalArcStrip", () => {
  it("renders nothing when there are no fragments", () => {
    const { container } = render(
      <VerticalArcStrip
        orderedFragmentUuids={[]}
        fragmentByUuid={new Map()}
        colorByAspectKey={colors}
        hiddenAspectKeys={new Set()}
      />,
    );
    expect(container.querySelector('[data-testid="vertical-arc-strip"]')).toBeNull();
  });

  it("aligns points to fragment rows on the vertical axis", () => {
    const fragmentByUuid = new Map([
      ["a", makeFragment("a", { grief: { weight: 1 } })],
      ["b", makeFragment("b", { grief: { weight: 0 } })],
    ]);
    const { container } = render(
      <VerticalArcStrip
        orderedFragmentUuids={["a", "b"]}
        fragmentByUuid={fragmentByUuid}
        colorByAspectKey={colors}
        hiddenAspectKeys={new Set()}
        rowHeight={20}
        width={50}
      />,
    );
    const circles = container.querySelectorAll('g[data-aspect-key="grief"] circle');
    expect(circles).toHaveLength(2);
    // Row 0 center y = 20 * 0.5 = 10; row 1 center y = 20 * 1.5 = 30.
    expect(circles[0]!.getAttribute("cy")).toBe("10");
    expect(circles[1]!.getAttribute("cy")).toBe("30");
    // weight=1 → x = width; weight=0 → x = 0 (horizontal deviation by weight).
    expect(circles[0]!.getAttribute("cx")).toBe("50");
    expect(circles[1]!.getAttribute("cx")).toBe("0");
  });

  it("omits aspects toggled off via aspect visibility", () => {
    const fragmentByUuid = new Map([
      ["a", makeFragment("a", { grief: { weight: 0.5 }, hope: { weight: 0.5 } })],
    ]);
    const { container } = render(
      <VerticalArcStrip
        orderedFragmentUuids={["a"]}
        fragmentByUuid={fragmentByUuid}
        colorByAspectKey={colors}
        hiddenAspectKeys={new Set(["grief"])}
      />,
    );
    expect(container.querySelector('g[data-aspect-key="grief"]')).toBeNull();
    expect(container.querySelector('g[data-aspect-key="hope"]')).not.toBeNull();
  });
});
