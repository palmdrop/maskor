import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { CommandsProvider, useCommandsContext } from "../CommandsProvider";
import { useCommandScope } from "../useCommandScope";
import { defineScope } from "../define";

const wrapper = ({ children }: { children: ReactNode }) => (
  <CommandsProvider>{children}</CommandsProvider>
);

describe("useCommandScope", () => {
  it("registers the scope as active on mount", () => {
    const scope = defineScope<{ value: string }>("test-scope", { label: "Test scope" });
    let activeIds: string[] = [];

    const Reader = () => {
      const { getActiveScopes } = useCommandsContext();
      activeIds = getActiveScopes().map((s) => s.meta.id);
      return null;
    };

    const Component = () => {
      useCommandScope(scope, { value: "x" });
      return <Reader />;
    };

    render(<Component />, { wrapper });
    expect(activeIds).toEqual(["test-scope"]);
  });

  it("unregisters the scope on unmount", () => {
    const scope = defineScope<{ value: string }>("test-scope", { label: "Test scope" });
    let lastActiveIds: string[] = [];

    // Read in useEffect (no deps) so the value reflects state after the commit
    // phase — which is when unmount cleanups run.
    const Reader = () => {
      const { getActiveScopes } = useCommandsContext();
      useEffect(() => {
        lastActiveIds = getActiveScopes().map((s) => s.meta.id);
      });
      return null;
    };

    const Inner = () => {
      useCommandScope(scope, { value: "x" });
      return null;
    };

    const Parent = () => {
      const [mounted, setMounted] = useState(true);
      return (
        <>
          {mounted && <Inner />}
          <Reader />
          <button onClick={() => setMounted(false)}>unmount</button>
        </>
      );
    };

    const { getByRole } = render(<Parent />, { wrapper });
    act(() => {
      getByRole("button", { name: "unmount" }).click();
    });

    expect(lastActiveIds).toEqual([]);
  });

  it("keeps the published ctx ref fresh across renders", () => {
    const scope = defineScope<{ value: string }>("test-scope", { label: "Test scope" });
    let publishedCtx: { value: string } | undefined;

    const Reader = () => {
      const { getActiveScopes } = useCommandsContext();
      const active = getActiveScopes()[0];
      publishedCtx = active?.ctxRef.current as { value: string } | undefined;
      return null;
    };

    const Inner = ({ value }: { value: string }) => {
      useCommandScope(scope, { value });
      return null;
    };

    const Parent = ({ value }: { value: string }) => (
      <>
        <Inner value={value} />
        <Reader />
      </>
    );

    const { rerender } = render(<Parent value="first" />, { wrapper });
    expect(publishedCtx?.value).toBe("first");

    rerender(<Parent value="second" />);
    expect(publishedCtx?.value).toBe("second");
  });

  it("warns in dev when the same scope id is published twice", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scope = defineScope<{ value: string }>("dupe-scope", { label: "Dupe" });

    const Component = () => {
      useCommandScope(scope, { value: "a" });
      useCommandScope(scope, { value: "b" });
      return null;
    };

    render(<Component />, { wrapper });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("dupe-scope"));
    warnSpy.mockRestore();
  });

  it("orders active scopes innermost-first", () => {
    const outer = defineScope<{ marker: "outer" }>("outer", { label: "Outer" });
    const inner = defineScope<{ marker: "inner" }>("inner", { label: "Inner" });
    let orderedIds: string[] = [];

    const Reader = () => {
      const { getActiveScopes } = useCommandsContext();
      orderedIds = getActiveScopes().map((s) => s.meta.id);
      return null;
    };

    const Inner = () => {
      useCommandScope(inner, { marker: "inner" });
      return <Reader />;
    };

    const Outer = () => {
      useCommandScope(outer, { marker: "outer" });
      return <Inner />;
    };

    render(<Outer />, { wrapper });
    expect(orderedIds).toEqual(["inner", "outer"]);
  });
});
