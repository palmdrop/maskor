import { describe, it, expect } from "vitest";
// Drift guard for the hand-mirrored sentinel constants. `anchor-sentinel.ts`
// re-declares the exporter's sentinel syntax locally (value imports from the
// `@maskor/exporter` barrel pull a Node-only logger into the browser bundle —
// see references/suggestions.md). That mirror can silently drift from the
// canonical definition. These tests close the seam by importing the exporter's
// CANONICAL builder straight from its source file (`sentinel.ts` has zero
// imports, so it is safe in any environment and does not pull the barrel) and
// asserting the frontend mirror still agrees. If the exporter changes a
// sentinel char or the label without updating the mirror, these fail.
import { anchorSentinel as exporterAnchorSentinel } from "../../../exporter/src/sentinel";
import { anchorSentinel, ANCHOR_SENTINEL_LINE_PATTERN } from "./anchor-sentinel";

describe("anchor-sentinel ⇄ @maskor/exporter contract", () => {
  it("frontend mirror builds byte-identical tokens to the exporter", () => {
    expect(anchorSentinel("frag-xyz")).toBe(exporterAnchorSentinel("frag-xyz"));
  });

  it("frontend line pattern matches an exporter-emitted token and captures the id", () => {
    const token = exporterAnchorSentinel("piece-3");
    const match = token.match(ANCHOR_SENTINEL_LINE_PATTERN);
    expect(match?.[1]).toBe("piece-3");
  });

  it("frontend line pattern rejects a token with surrounding text (must be the whole line)", () => {
    const token = exporterAnchorSentinel("frag-1");
    expect(`leading ${token}`).not.toMatch(ANCHOR_SENTINEL_LINE_PATTERN);
    expect(`${token} trailing`).not.toMatch(ANCHOR_SENTINEL_LINE_PATTERN);
  });
});
