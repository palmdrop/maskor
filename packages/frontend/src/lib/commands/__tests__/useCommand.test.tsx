import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { CommandsProvider, useCommandsContext } from "../CommandsProvider";
import { useCommand } from "../useCommand";
import type { CommandDef } from "../types";

const wrapper = ({ children }: { children: ReactNode }) => (
  <CommandsProvider>{children}</CommandsProvider>
);

const makeCommand = (overrides: Partial<CommandDef> = {}): CommandDef => ({
  id: "test:command",
  label: "Test Command",
  scope: "global",
  category: "other",
  run: vi.fn(),
  ...overrides,
});

// Consumer that reads the command map
const MapReader = ({ onRead }: { onRead: (map: ReadonlyMap<string, CommandDef>) => void }) => {
  const { getMap } = useCommandsContext();
  onRead(getMap());
  return null;
};

describe("useCommand", () => {
  it("registers the command on mount", () => {
    const def = makeCommand();
    const onRead = vi.fn();

    const Component = () => {
      useCommand(def);
      return <MapReader onRead={onRead} />;
    };

    render(<Component />, { wrapper });

    const lastMap = onRead.mock.calls[onRead.mock.calls.length - 1][0] as ReadonlyMap<
      string,
      CommandDef
    >;
    expect(lastMap.has("test:command")).toBe(true);
  });

  it("unregisters the command on unmount", () => {
    const def = makeCommand();
    const onRead = vi.fn();

    const Component = () => {
      useCommand(def);
      return <MapReader onRead={onRead} />;
    };

    const Parent = () => {
      const [mounted, setMounted] = useState(true);
      return (
        <>
          {mounted && <Component />}
          <MapReader onRead={onRead} />
          <button onClick={() => setMounted(false)}>unmount</button>
        </>
      );
    };

    const { getByRole } = render(<Parent />, { wrapper });

    act(() => {
      getByRole("button", { name: "unmount" }).click();
    });

    const lastMap = onRead.mock.calls[onRead.mock.calls.length - 1][0] as ReadonlyMap<
      string,
      CommandDef
    >;
    expect(lastMap.has("test:command")).toBe(false);
  });

  it("always invokes the latest closure when run is called", async () => {
    const firstRun = vi.fn();
    const secondRun = vi.fn();

    let triggerRun: (() => void) | null = null;

    const Component = ({ runFn }: { runFn: () => void }) => {
      const { run } = useCommandsContext();
      useCommand(makeCommand({ run: runFn }));
      triggerRun = () => run("test:command");
      return null;
    };

    const { rerender } = render(<Component runFn={firstRun} />, { wrapper });

    rerender(<Component runFn={secondRun} />);

    act(() => {
      triggerRun!();
    });

    expect(firstRun).not.toHaveBeenCalled();
    expect(secondRun).toHaveBeenCalledTimes(1);
  });

  it("registered def reads arg, label, and disabledReason live from the latest render", () => {
    let capturedMap: ReadonlyMap<string, CommandDef> | null = null;

    const Component = ({
      items,
      label,
      reason,
    }: {
      items: string[];
      label: string;
      reason?: string;
    }) => {
      const { getMap } = useCommandsContext();
      useCommand(
        makeCommand({
          id: "live:command",
          label,
          disabledReason: reason,
          arg: {
            items,
            getKey: (item) => item as string,
            getLabel: (item) => item as string,
          },
        }),
      );
      capturedMap = getMap();
      return null;
    };

    const { rerender } = render(<Component items={["a"]} label="First" />, { wrapper });

    const initial = capturedMap!.get("live:command")!;
    expect(initial.label).toBe("First");
    expect(initial.arg!.items).toEqual(["a"]);
    expect(initial.disabledReason).toBeUndefined();

    rerender(<Component items={["x", "y"]} label="Second" reason="not ready" />);

    // Same Proxy reference, but reads now reflect the latest render.
    expect(initial.label).toBe("Second");
    expect(initial.arg!.items).toEqual(["x", "y"]);
    expect(initial.disabledReason).toBe("not ready");
  });

  it("warns in dev mode when a duplicate id is registered", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const Component = () => {
      useCommand(makeCommand({ id: "dupe:command" }));
      useCommand(makeCommand({ id: "dupe:command", label: "Second" }));
      return null;
    };

    render(<Component />, { wrapper });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("dupe:command"));

    warnSpy.mockRestore();
  });
});
