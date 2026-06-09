import { describe, it, expect } from "vitest";
import { ApiRequestError } from "@api/errors";
import { shouldThrowToBoundary, shouldRetryQuery } from "./queryClient";

describe("shouldThrowToBoundary", () => {
  it("routes 5xx to the boundary", () => {
    expect(shouldThrowToBoundary(new ApiRequestError(500, {}))).toBe(true);
    expect(shouldThrowToBoundary(new ApiRequestError(503, {}))).toBe(true);
  });

  it("leaves 4xx inline", () => {
    expect(shouldThrowToBoundary(new ApiRequestError(404, {}))).toBe(false);
    expect(shouldThrowToBoundary(new ApiRequestError(400, {}))).toBe(false);
    expect(shouldThrowToBoundary(new ApiRequestError(422, {}))).toBe(false);
  });

  it("routes transport/unknown errors to the boundary", () => {
    expect(shouldThrowToBoundary(new Error("network down"))).toBe(true);
    expect(shouldThrowToBoundary("boom")).toBe(true);
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
