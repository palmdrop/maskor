import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { defineScope, defineScopeCommand } from "../define";

const ledger: { lastRunner?: string } = {};

const outer = defineScope<{ marker: "outer" }>("outer-conflict", { label: "Outer scope" });
const inner = defineScope<{ marker: "inner" }>("inner-conflict", { label: "Inner scope" });

const outerCommand = defineScopeCommand(outer, {
  id: "outer:hotkey",
  label: "Outer hotkey",
  category: "other",
  hotkey: "mod+e",
  run: () => {
    ledger.lastRunner = "outer";
  },
});

const innerCommand = defineScopeCommand(inner, {
  id: "inner:hotkey",
  label: "Inner hotkey",
  category: "other",
  hotkey: "mod+e",
  run: () => {
    ledger.lastRunner = "inner";
  },
});

vi.mock("../catalog", () => ({
  allCommands: [outerCommand, innerCommand] as const,
}));

const { CommandsProvider } = await import("../CommandsProvider");
const { HotkeyBinder } = await import("../HotkeyBinder");
const { useCommandScope } = await import("../useCommandScope");

const fireKeydown = (options: KeyboardEventInit) => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...options }));
  });
};

describe("HotkeyBinder — innermost-scope conflict resolution (v2)", () => {
  it("invokes the innermost-mounted scope's command when both are bound to the same hotkey", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const Inner = () => {
      useCommandScope(inner, { marker: "inner" });
      return null;
    };
    const Outer = () => {
      useCommandScope(outer, { marker: "outer" });
      return <Inner />;
    };

    render(
      <CommandsProvider>
        <HotkeyBinder />
        <Outer />
      </CommandsProvider>,
    );

    fireKeydown({ key: "e", metaKey: true });

    expect(ledger.lastRunner).toBe("inner");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("matched multiple"));
    warnSpy.mockRestore();
  });
});
