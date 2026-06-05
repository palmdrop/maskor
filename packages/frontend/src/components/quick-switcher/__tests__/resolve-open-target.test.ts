import { describe, it, expect } from "vitest";
import {
  classifyRoute,
  resolveOpenTarget,
  type CurrentRouteKind,
  type EntityKind,
} from "../resolve-open-target";

const projectId = "p-1";

describe("classifyRoute", () => {
  it.each<[string, CurrentRouteKind]>([
    ["/projects/$projectId/fragments/$fragmentId", "fragment-editor"],
    ["/projects/$projectId/suggestion", "suggestion-mode"],
    ["/projects/$projectId/aspects/$aspectId", "aspect-editor"],
    ["/projects/$projectId/notes/$noteId", "note-editor"],
    ["/projects/$projectId/references/$referenceId", "reference-editor"],
    ["/projects/$projectId/overview", "overview"],
  ])("maps route id %s to %s", (routeId, expected) => {
    expect(classifyRoute([routeId])).toBe(expected);
  });

  it("picks the innermost matched route", () => {
    // The shell layout match appears first, the leaf fragment route last.
    expect(
      classifyRoute([
        "/projects/$projectId",
        "/projects/$projectId/fragments",
        "/projects/$projectId/fragments/$fragmentId",
      ]),
    ).toBe("fragment-editor");
  });

  it("falls back to 'other' for unknown routes", () => {
    expect(classifyRoute(["/projects/$projectId/stats"])).toBe("other");
    expect(classifyRoute([])).toBe("other");
  });
});

describe("resolveOpenTarget — fragment picks", () => {
  const fragment = { kind: "fragment" as EntityKind, uuid: "f-1" };

  it("from suggestion-mode → swap in place via search.fragment", () => {
    const result = resolveOpenTarget("suggestion-mode", fragment, projectId);
    expect(result).toEqual({
      to: "/projects/$projectId/suggestion",
      params: { projectId },
      search: { fragment: "f-1" },
    });
  });

  it.each<CurrentRouteKind>([
    "fragment-editor",
    "aspect-editor",
    "note-editor",
    "reference-editor",
    "overview",
    "other",
  ])("from %s → navigate (or route swap) to /fragments/:uuid", (route) => {
    const result = resolveOpenTarget(route, fragment, projectId);
    expect(result).toEqual({
      to: "/projects/$projectId/fragments/$fragmentId",
      params: { projectId, fragmentId: "f-1" },
    });
  });
});

describe("resolveOpenTarget — aspect picks", () => {
  const aspect = { kind: "aspect" as EntityKind, uuid: "a-1" };

  it.each<CurrentRouteKind>([
    "fragment-editor",
    "suggestion-mode",
    "aspect-editor",
    "note-editor",
    "reference-editor",
    "overview",
    "other",
  ])("from %s → navigate to aspect editor", (route) => {
    expect(resolveOpenTarget(route, aspect, projectId)).toEqual({
      to: "/projects/$projectId/aspects/$aspectId",
      params: { projectId, aspectId: "a-1" },
    });
  });
});

describe("resolveOpenTarget — note picks", () => {
  const note = { kind: "note" as EntityKind, uuid: "n-1" };

  it.each<CurrentRouteKind>([
    "fragment-editor",
    "suggestion-mode",
    "aspect-editor",
    "note-editor",
    "reference-editor",
    "overview",
    "other",
  ])("from %s → navigate to note editor", (route) => {
    expect(resolveOpenTarget(route, note, projectId)).toEqual({
      to: "/projects/$projectId/notes/$noteId",
      params: { projectId, noteId: "n-1" },
    });
  });
});

describe("resolveOpenTarget — reference picks", () => {
  const reference = { kind: "reference" as EntityKind, uuid: "r-1" };

  it.each<CurrentRouteKind>([
    "fragment-editor",
    "suggestion-mode",
    "aspect-editor",
    "note-editor",
    "reference-editor",
    "overview",
    "other",
  ])("from %s → navigate to reference editor", (route) => {
    expect(resolveOpenTarget(route, reference, projectId)).toEqual({
      to: "/projects/$projectId/references/$referenceId",
      params: { projectId, referenceId: "r-1" },
    });
  });
});

describe("resolveOpenTarget — sequence picks", () => {
  const sequence = { kind: "sequence" as EntityKind, uuid: "s-1" };

  it.each<CurrentRouteKind>([
    "fragment-editor",
    "suggestion-mode",
    "aspect-editor",
    "note-editor",
    "reference-editor",
    "overview",
    "other",
  ])("from %s → always navigate to overview with merged search", (route) => {
    const result = resolveOpenTarget(route, sequence, projectId);
    expect(result.to).toBe("/projects/$projectId/overview");
    expect(result.params).toEqual({ projectId });
    expect(typeof result.search).toBe("function");
  });

  it("search merge preserves previous keys (e.g. detail)", () => {
    const result = resolveOpenTarget("overview", sequence, projectId);
    const merge = result.search as (previous: Record<string, unknown>) => Record<string, unknown>;
    expect(merge({ detail: "excerpt" })).toEqual({ detail: "excerpt", sequence: "s-1" });
    expect(merge({})).toEqual({ sequence: "s-1" });
  });
});
