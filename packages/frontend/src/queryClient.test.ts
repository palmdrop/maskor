import { describe, it, expect } from "vitest";
import { ApiRequestError } from "@api/errors";
import { shouldThrowToBoundary, shouldRetryQuery, isBackgroundRefetchFailure } from "./queryClient";

const NO_DATA = false;
const HAS_DATA = true;

describe("shouldThrowToBoundary", () => {
  it("routes 5xx to the boundary on an empty cache (initial load)", () => {
    expect(shouldThrowToBoundary(new ApiRequestError(500, {}), NO_DATA)).toBe(true);
    expect(shouldThrowToBoundary(new ApiRequestError(503, {}), NO_DATA)).toBe(true);
  });

  it("leaves 4xx inline", () => {
    expect(shouldThrowToBoundary(new ApiRequestError(404, {}), NO_DATA)).toBe(false);
    expect(shouldThrowToBoundary(new ApiRequestError(400, {}), NO_DATA)).toBe(false);
    expect(shouldThrowToBoundary(new ApiRequestError(422, {}), NO_DATA)).toBe(false);
  });

  it("routes transport/unknown errors to the boundary on an empty cache", () => {
    expect(shouldThrowToBoundary(new Error("network down"), NO_DATA)).toBe(true);
    expect(shouldThrowToBoundary("boom", NO_DATA)).toBe(true);
  });

  it("does NOT tear down a view when a background refetch fails with data present", () => {
    expect(shouldThrowToBoundary(new ApiRequestError(500, {}), HAS_DATA)).toBe(false);
    expect(shouldThrowToBoundary(new Error("network down"), HAS_DATA)).toBe(false);
  });
});

describe("isBackgroundRefetchFailure", () => {
  it("is true only for a server/transport failure of an already-populated query", () => {
    expect(isBackgroundRefetchFailure(new ApiRequestError(500, {}), HAS_DATA)).toBe(true);
    expect(isBackgroundRefetchFailure(new Error("down"), HAS_DATA)).toBe(true);
    // No data yet → that's an initial-load failure (boundary), not a background one.
    expect(isBackgroundRefetchFailure(new ApiRequestError(500, {}), NO_DATA)).toBe(false);
    // 4xx of a populated query isn't surfaced as a refresh hiccup.
    expect(isBackgroundRefetchFailure(new ApiRequestError(404, {}), HAS_DATA)).toBe(false);
  });
});

describe("shouldRetryQuery", () => {
  it("never retries 4xx", () => {
    expect(shouldRetryQuery(0, new ApiRequestError(404, {}))).toBe(false);
  });

  it("retries server/transport failures once", () => {
    expect(shouldRetryQuery(0, new ApiRequestError(500, {}))).toBe(true);
    expect(shouldRetryQuery(1, new ApiRequestError(500, {}))).toBe(false);
    expect(shouldRetryQuery(0, new Error("network down"))).toBe(true);
    expect(shouldRetryQuery(1, new Error("network down"))).toBe(false);
  });
});
