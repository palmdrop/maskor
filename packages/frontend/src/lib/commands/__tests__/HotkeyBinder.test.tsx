import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { defineScope, defineScopeCommand } from "../define";

// Synthetic catalog — uses scope commands so we exercise the v2 publication
// path that the binder consults via getActiveScopes(). Each command's `run`
// records into the ledger so tests can assert it fired.
const ledger: { runs: string[] } = { runs: [] };

const scope = defineScope<{ marker: "x" }>("hotkey-test", { label: "Hotkey test" });

const modK = defineScopeCommand(scope, {
  id: "test:mod-k",
  label: "Mod+K",
  category: "other",
  hotkey: "mod+k",
  run: () => {
    ledger.runs.push("test:mod-k");
  },
});

const plainF = defineScopeCommand(scope, {
  id: "test:plain-f",
  label: "F",
  category: "other",
  hotkey: "f",
  run: () => {
    ledger.runs.push("test:plain-f");
  },
});

const modJ = defineScopeCommand(scope, {
  id: "test:mod-j",
  label: "Mod+J",
  category: "other",
  hotkey: "mod+j",
  run: () => {
    ledger.runs.push("test:mod-j");
  },
});

const modKDisabled = defineScopeCommand(scope, {
  id: "test:mod-k-disabled",
  label: "Mod+K disabled",
  category: "other",
  hotkey: "mod+k",
  disabled: () => "not available",
  run: () => {
    ledger.runs.push("test:mod-k-disabled");
  },
});

vi.mock("../catalog", () => ({
  allCommands: [modK, plainF, modJ, modKDisabled] as const,
}));

const { CommandsProvider } = await import("../CommandsProvider");
const { HotkeyBinder } = await import("../HotkeyBinder");
const { useCommandScope } = await import("../useCommandScope");

const Publisher = () => {
  useCommandScope(scope, { marker: "x" });
  return null;
};

const Shell = ({ children }: { children: ReactNode }) => (
  <CommandsProvider>
    <HotkeyBinder />
    {children}
  </CommandsProvider>
);

const fireKeydown = (options: KeyboardEventInit) => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...options }));
  });
};

const reset = () => {
  ledger.runs = [];
};

describe("HotkeyBinder", () => {
  it("invokes the matching command on a hotkey press", () => {
    reset();
    render(
      <Shell>
        <Publisher />
      </Shell>,
    );
    fireKeydown({ key: "k", metaKey: true });
    // Without disabled, both modK and modKDisabled match — but disabledReason
    // makes the binder skip the disabled one. Innermost-scope tie-breaker
    // doesn't fire here because both are in the same scope.
    expect(ledger.runs).toContain("test:mod-k");
    expect(ledger.runs).not.toContain("test:mod-k-disabled");
  });

  it("does not fire when modifier does not match", () => {
    reset();
    render(
      <Shell>
        <Publisher />
      </Shell>,
    );
    fireKeydown({ key: "k" });
    expect(ledger.runs).toEqual([]);
  });

  it("skips unmodified single-key hotkey when a text input is focused", () => {
    reset();
    const { getByTestId } = render(
      <Shell>
        <Publisher />
        <input data-testid="input" />
      </Shell>,
    );
    act(() => getByTestId("input").focus());
    fireKeydown({ key: "f" });
    expect(ledger.runs).toEqual([]);
  });

  it("fires modified hotkey even when a text input is focused", () => {
    reset();
    const { getByTestId } = render(
      <Shell>
        <Publisher />
        <input data-testid="input" />
      </Shell>,
    );
    act(() => getByTestId("input").focus());
    fireKeydown({ key: "k", metaKey: true });
    expect(ledger.runs).toContain("test:mod-k");
  });

  it("does not fire after the scope is unmounted", () => {
    reset();
    const Parent = () => {
      const [mounted, setMounted] = useState(true);
      return (
        <Shell>
          {mounted && <Publisher />}
          <button onClick={() => setMounted(false)}>unmount</button>
        </Shell>
      );
    };
    const { getByRole } = render(<Parent />);
    act(() => {
      getByRole("button", { name: "unmount" }).click();
    });
    fireKeydown({ key: "j", metaKey: true });
    expect(ledger.runs).toEqual([]);
  });

  it("does not fire a disabled command", () => {
    // Verified above as part of the matching-command test (modKDisabled has
    // the same hotkey as modK but disabled: () => "not available"). Sanity
    // check here without the enabled twin in the candidate set is covered
    // by the unit-level disabled tests in scope-smoke.test.ts.
    expect(modKDisabled.disabled?.({ marker: "x" })).toBe("not available");
  });
});
