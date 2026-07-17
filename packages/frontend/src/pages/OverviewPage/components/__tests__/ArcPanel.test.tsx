import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { ArcSeries } from "../../utils/arcData";
import { ArcPanel } from "../ArcPanel";

const series: ArcSeries[] = [
  {
    aspectKey: "grief",
    points: [
      { x: 10, y: 10, fragmentUuid: "a" },
      { x: 20, y: 20, fragmentUuid: "b" },
      { x: 30, y: 30, fragmentUuid: "c" },
    ],
  },
];

const colors = new Map([["grief", "#ff0000"]]);

describe("ArcPanel — hover highlight", () => {
  it("emphasizes only the points whose fragment is highlighted", () => {
    const { container } = render(
      <ArcPanel
        width={100}
        series={series}
        colorByAspectKey={colors}
        highlightedFragmentUuids={new Set(["b"])}
      />,
    );
    const highlighted = container.querySelectorAll("circle[data-highlighted]");
    expect(highlighted).toHaveLength(1);
    // The emphasized dot carries a stroke ring; unhighlighted ones do not.
    expect(highlighted[0]!.getAttribute("stroke")).toBeTruthy();
    const plain = [...container.querySelectorAll("circle")].filter(
      (circle) => !circle.hasAttribute("data-highlighted"),
    );
    expect(plain).toHaveLength(2);
    expect(plain[0]!.getAttribute("stroke")).toBeNull();
  });

  it("emphasizes no points when nothing is highlighted", () => {
    const { container } = render(
      <ArcPanel width={100} series={series} colorByAspectKey={colors} />,
    );
    expect(container.querySelectorAll("circle[data-highlighted]")).toHaveLength(0);
  });

  it("emphasizes a single-point series when highlighted", () => {
    const single: ArcSeries[] = [
      { aspectKey: "grief", points: [{ x: 5, y: 5, fragmentUuid: "a" }] },
    ];
    const { container } = render(
      <ArcPanel
        width={100}
        series={single}
        colorByAspectKey={colors}
        highlightedFragmentUuids={new Set(["a"])}
      />,
    );
    expect(container.querySelectorAll("circle[data-highlighted]")).toHaveLength(1);
  });
});
