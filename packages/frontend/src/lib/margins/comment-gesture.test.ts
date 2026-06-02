import { describe, it, expect, vi } from "vitest";
import { resolveCommentTarget } from "./comment-gesture";

describe("resolveCommentTarget", () => {
  it("reuses an existing marker and injects nothing (one comment per block)", () => {
    const mint = vi.fn(() => "fresh");
    expect(resolveCommentTarget("existing", mint)).toEqual({ markerId: "existing", inject: false });
    expect(mint).not.toHaveBeenCalled();
  });

  it("mints and injects a fresh marker for an un-annotated block", () => {
    const mint = vi.fn(() => "fresh");
    expect(resolveCommentTarget(null, mint)).toEqual({ markerId: "fresh", inject: true });
    expect(mint).toHaveBeenCalledOnce();
  });
});
