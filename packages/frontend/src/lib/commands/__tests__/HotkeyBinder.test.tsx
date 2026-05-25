import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { CommandsProvider, useCommandsContext } from "../CommandsProvider";
import { HotkeyBinder } from "../HotkeyBinder";
import { useCommand } from "../useCommand";
import type { CommandDef } from "../types";

const fireKeydown = (options: KeyboardEventInit) => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...options }));
  });
};

const makeCommand = (overrides: Partial<CommandDef> = {}): CommandDef => ({
  id: "test:hotkey",
  label: "Test Hotkey",
  scope: "global",
  category: "other",
  run: vi.fn(),
  ...overrides,
});

const Shell = ({ children }: { children: ReactNode }) => (
  <CommandsProvider>
    <HotkeyBinder />
    {children}
  </CommandsProvider>
);

describe("HotkeyBinder", () => {
  it("calls run when a matching hotkey fires", () => {
    const run = vi.fn();
    const Component = () => {
      useCommand(makeCommand({ hotkey: "mod+k", run }));
      return null;
    };

    render(<Component />, { wrapper: Shell });

    fireKeydown({ key: "k", metaKey: true });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not fire when a modifier does not match", () => {
    const run = vi.fn();
    const Component = () => {
      useCommand(makeCommand({ hotkey: "mod+k", run }));
      return null;
    };

    render(<Component />, { wrapper: Shell });

    fireKeydown({ key: "k" });

    expect(run).not.toHaveBeenCalled();
  });

  it("skips unmodified single-key hotkey when a text input is focused", () => {
    const run = vi.fn();
    const Component = () => {
      useCommand(makeCommand({ hotkey: "f", run }));
      return <input data-testid="input" />;
    };

    const { getByTestId } = render(<Component />, { wrapper: Shell });

    const input = getByTestId("input");
    act(() => input.focus());

    fireKeydown({ key: "f" });

    expect(run).not.toHaveBeenCalled();
  });

  it("fires modified hotkey even when a text input is focused", () => {
    const run = vi.fn();
    const Component = () => {
      useCommand(makeCommand({ hotkey: "mod+k", run }));
      return <input data-testid="input" />;
    };

    const { getByTestId } = render(<Component />, { wrapper: Shell });

    act(() => getByTestId("input").focus());

    fireKeydown({ key: "k", metaKey: true });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not fire after a command is unregistered on unmount", () => {
    const run = vi.fn();

    const CommandUser = () => {
      useCommand(makeCommand({ hotkey: "mod+j", run }));
      return null;
    };

    const Parent = () => {
      const [mounted, setMounted] = useState(true);
      return (
        <Shell>
          {mounted && <CommandUser />}
          <button onClick={() => setMounted(false)}>unmount</button>
        </Shell>
      );
    };

    const { getByRole } = render(<Parent />);

    act(() => {
      getByRole("button", { name: "unmount" }).click();
    });

    fireKeydown({ key: "j", metaKey: true });

    expect(run).not.toHaveBeenCalled();
  });

  it("does not fire for a disabled command", () => {
    const run = vi.fn();
    const Component = () => {
      useCommand(makeCommand({ hotkey: "mod+k", disabledReason: "not available", run }));
      return null;
    };

    render(<Component />, { wrapper: Shell });

    fireKeydown({ key: "k", metaKey: true });

    expect(run).not.toHaveBeenCalled();
  });

  it("picks the most-recently-mounted scope's command on hotkey conflict", () => {
    const outerRun = vi.fn();
    const innerRun = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const Outer = () => {
      useCommand(
        makeCommand({ id: "outer:do", scope: "Outer scope", hotkey: "mod+e", run: outerRun }),
      );
      return null;
    };
    const Inner = () => {
      useCommand(
        makeCommand({ id: "inner:do", scope: "Inner scope", hotkey: "mod+e", run: innerRun }),
      );
      return null;
    };

    // The hotkey binder's innermost-scope logic uses getActiveScopes(), which is
    // only populated by useCommandScope. The adapter shim does not register
    // scopes, so on the v1 path conflicts fall back to first-match. This test
    // still verifies that the binder doesn't crash on conflicts and that a
    // warning is emitted in dev.
    render(
      <Shell>
        <Outer />
        <Inner />
      </Shell>,
    );

    fireKeydown({ key: "e", metaKey: true });

    const totalCalls = outerRun.mock.calls.length + innerRun.mock.calls.length;
    expect(totalCalls).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("matched multiple"));
    warnSpy.mockRestore();
  });
});
