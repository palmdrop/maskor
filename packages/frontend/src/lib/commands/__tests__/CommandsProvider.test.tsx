import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { defineScope, defineGlobalCommand, defineScopeCommand } from "../define";

// Inject a synthetic catalog for these tests.
const ledger: { lastInvoked?: { id: string; arg?: unknown; ctx?: unknown } } = {};

const globalNoop = defineGlobalCommand({
  id: "test:global-noop",
  label: "Global noop",
  category: "other",
  run: (arg: unknown) => {
    ledger.lastInvoked = { id: "test:global-noop", arg };
  },
});

const globalDisabled = defineGlobalCommand({
  id: "test:global-disabled",
  label: "Global disabled",
  category: "other",
  disabled: () => "always",
  run: () => {
    ledger.lastInvoked = { id: "test:global-disabled" };
  },
});

const scopeA = defineScope<{ value: string }>("scope-a", { label: "Scope A" });
const scopeACommand = defineScopeCommand(scopeA, {
  id: "scope-a:action",
  label: "Scope A action",
  category: "other",
  run: (ctx, arg: unknown) => {
    ledger.lastInvoked = { id: "scope-a:action", arg, ctx };
  },
});

const scopeB = defineScope<{ count: number }>("scope-b", { label: "Scope B" });
const scopeBDisabled = defineScopeCommand(scopeB, {
  id: "scope-b:disabled-when-zero",
  label: "Scope B disabled when zero",
  category: "other",
  disabled: (ctx) => (ctx.count === 0 ? "Count is zero" : undefined),
  run: (ctx) => {
    ledger.lastInvoked = { id: "scope-b:disabled-when-zero", ctx };
  },
});

vi.mock("../catalog", () => ({
  allCommands: [globalNoop, globalDisabled, scopeACommand, scopeBDisabled] as const,
}));

// Imports below run after the mock above is hoisted.
const { CommandsProvider, useCommandsContext } = await import("../CommandsProvider");
const { useCommandScope } = await import("../useCommandScope");

const wrapper = ({ children }: { children: ReactNode }) => (
  <CommandsProvider>{children}</CommandsProvider>
);

describe("CommandsProvider (v2 catalog)", () => {
  beforeEach(() => {
    ledger.lastInvoked = undefined;
  });

  it("runs a global command and passes the arg", () => {
    const Runner = () => {
      const { run } = useCommandsContext();
      run("test:global-noop", { foo: "bar" });
      return null;
    };
    render(<Runner />, { wrapper });
    expect(ledger.lastInvoked).toEqual({ id: "test:global-noop", arg: { foo: "bar" } });
  });

  it("does not invoke a disabled global command and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Runner = () => {
      const { run } = useCommandsContext();
      run("test:global-disabled");
      return null;
    };
    render(<Runner />, { wrapper });
    expect(ledger.lastInvoked).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("test:global-disabled"));
    warnSpy.mockRestore();
  });

  it("excludes inactive scope commands from getMap", () => {
    let ids: string[] = [];
    const Reader = () => {
      const { getMap } = useCommandsContext();
      ids = Array.from(getMap().keys());
      return null;
    };
    render(<Reader />, { wrapper });
    expect(ids).toContain("test:global-noop");
    expect(ids).not.toContain("scope-a:action");
    expect(ids).not.toContain("scope-b:disabled-when-zero");
  });

  it("includes scope commands when the scope is published and passes the current ctx to run", () => {
    const Publisher = ({ value }: { value: string }) => {
      useCommandScope(scopeA, { value });
      return null;
    };
    const Runner = () => {
      const { run } = useCommandsContext();
      run("scope-a:action", { x: 1 });
      return null;
    };
    render(
      <>
        <Publisher value="hello" />
        <Runner />
      </>,
      { wrapper },
    );
    expect(ledger.lastInvoked).toEqual({
      id: "scope-a:action",
      arg: { x: 1 },
      ctx: { value: "hello" },
    });
  });

  it("respects scope-command disabled state derived from current ctx", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Publisher = ({ count }: { count: number }) => {
      useCommandScope(scopeB, { count });
      return null;
    };
    const Runner = () => {
      const { run } = useCommandsContext();
      run("scope-b:disabled-when-zero");
      return null;
    };
    render(
      <>
        <Publisher count={0} />
        <Runner />
      </>,
      { wrapper },
    );
    expect(ledger.lastInvoked).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Count is zero"));
    warnSpy.mockRestore();
  });

  it("re-reads ctx on each run after the publisher re-renders", () => {
    let runHandle: (() => void) | null = null;

    const Publisher = ({ value }: { value: string }) => {
      useCommandScope(scopeA, { value });
      return null;
    };
    const Runner = () => {
      const { run } = useCommandsContext();
      runHandle = () => run("scope-a:action", { tag: "t" });
      return null;
    };

    const { rerender } = render(
      <>
        <Publisher value="first" />
        <Runner />
      </>,
      { wrapper },
    );

    act(() => runHandle!());
    expect(ledger.lastInvoked).toMatchObject({ ctx: { value: "first" } });

    rerender(
      <>
        <Publisher value="second" />
        <Runner />
      </>,
    );
    act(() => runHandle!());
    expect(ledger.lastInvoked).toMatchObject({ ctx: { value: "second" } });
  });

  it("filters out commands whose scope was unmounted", () => {
    let ids: string[] = [];
    const Publisher = () => {
      useCommandScope(scopeA, { value: "x" });
      return null;
    };
    // useEffect (no deps) re-runs after every commit, so reads reflect state
    // after unmount cleanups have run.
    const Reader = () => {
      const { getMap } = useCommandsContext();
      useEffect(() => {
        ids = Array.from(getMap().keys());
      });
      return null;
    };

    const Parent = () => {
      const [mounted, setMounted] = useState(true);
      return (
        <>
          {mounted && <Publisher />}
          <Reader />
          <button onClick={() => setMounted(false)}>unmount</button>
        </>
      );
    };

    const { getByRole } = render(<Parent />, { wrapper });
    expect(ids).toContain("scope-a:action");

    act(() => {
      getByRole("button", { name: "unmount" }).click();
    });
    expect(ids).not.toContain("scope-a:action");
  });
});
