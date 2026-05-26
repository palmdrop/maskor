import { describe, it, expect } from "vitest";
import { defineScope, defineGlobalCommand, defineScopeCommand } from "../define";

describe("defineScope", () => {
  it("creates a scope with id and label", () => {
    const scope = defineScope<{ foo: string }>("test-scope", { label: "Test scope" });
    expect(scope.id).toBe("test-scope");
    expect(scope.label).toBe("Test scope");
  });
});

describe("defineGlobalCommand", () => {
  it("returns a global def with kind set", () => {
    const def = defineGlobalCommand({
      id: "test:noop",
      label: "Test",
      category: "other",
      run: () => {},
    });
    expect(def.kind).toBe("global");
    expect(def.id).toBe("test:noop");
    expect(def.label).toBe("Test");
  });

  it("preserves the id as a literal type at the value level", () => {
    const def = defineGlobalCommand({
      id: "literal-id",
      label: "L",
      category: "other",
      run: () => {},
    });
    const id: "literal-id" = def.id;
    expect(id).toBe("literal-id");
  });

  it("calls run with the provided arg", () => {
    let received: number | undefined;
    const def = defineGlobalCommand({
      id: "test:with-arg",
      label: "Test",
      category: "other",
      arg: {
        items: () => [1, 2, 3],
        getKey: (n) => String(n),
        getLabel: (n) => String(n),
      },
      run: (n) => {
        received = n;
      },
    });
    void def.run(42);
    expect(received).toBe(42);
  });
});

describe("defineScopeCommand", () => {
  it("returns a scope def with scopeId and scopeLabel from the scope", () => {
    const scope = defineScope<{ value: string }>("test-scope", { label: "Test scope" });
    const def = defineScopeCommand(scope, {
      id: "test:scoped",
      label: "Scoped",
      category: "other",
      run: () => {},
    });
    expect(def.kind).toBe("scope");
    expect(def.scopeId).toBe("test-scope");
    expect(def.scopeLabel).toBe("Test scope");
    expect(def.id).toBe("test:scoped");
  });

  it("passes the published ctx to run", () => {
    const scope = defineScope<{ name: string }>("test-scope", { label: "Test scope" });
    let received: string | undefined;
    const def = defineScopeCommand(scope, {
      id: "test:scoped",
      label: "Scoped",
      category: "other",
      run: (ctx) => {
        received = ctx.name;
      },
    });
    void def.run({ name: "anton" });
    expect(received).toBe("anton");
  });

  it("passes ctx to disabled()", () => {
    const scope = defineScope<{ ready: boolean }>("test-scope", { label: "Test scope" });
    const def = defineScopeCommand(scope, {
      id: "test:scoped",
      label: "Scoped",
      category: "other",
      disabled: (ctx) => (ctx.ready ? undefined : "Not ready"),
      run: () => {},
    });
    expect(def.disabled?.({ ready: true })).toBeUndefined();
    expect(def.disabled?.({ ready: false })).toBe("Not ready");
  });
});
