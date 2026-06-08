import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { defineScope, defineGlobalCommand, defineScopeCommand } from "../define";
import { ApiRequestError } from "@api/errors";
import type { CommandErrorFilter } from "../CommandsProvider";

const { toastError, recordCommandError } = vi.hoisted(() => ({
  toastError: vi.fn(),
  recordCommandError: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("@api/generated/action-log/action-log", () => ({
  RecordCommandError: recordCommandError,
}));

vi.mock("../router-helpers", () => ({ getActiveProjectId: () => "project-1" }));

// Controls the error each failing command throws on the next run.
const control: { error: unknown } = { error: new Error("boom") };

const failingGlobal = defineGlobalCommand({
  id: "test:failing",
  label: "Failing",
  category: "other",
  onFailure: "It failed.",
  run: () => {
    throw control.error;
  },
});

const silentGlobal = defineGlobalCommand({
  id: "test:silent",
  label: "Silent",
  category: "other",
  run: () => {
    throw control.error;
  },
});

const scopeX = defineScope<{ ready: boolean }>("scope-x", { label: "Scope X" });
const scopeFailing = defineScopeCommand(scopeX, {
  id: "scope-x:failing",
  label: "Scope failing",
  category: "other",
  onFailure: "Scope failed.",
  run: () => {
    throw control.error;
  },
});

vi.mock("../catalog", () => ({
  allCommands: [failingGlobal, silentGlobal, scopeFailing] as const,
}));

const { CommandsProvider, useCommandsContext } = await import("../CommandsProvider");
const { useCommandScope } = await import("../useCommandScope");

const wrapper = ({ children }: { children: ReactNode }) => (
  <CommandsProvider>{children}</CommandsProvider>
);

let runHandle: (id: string, arg?: unknown) => void;
const Runner = () => {
  const { run } = useCommandsContext();
  runHandle = run;
  return null;
};

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe("CommandsProvider — command failure handling", () => {
  beforeEach(() => {
    toastError.mockClear();
    recordCommandError.mockClear();
    control.error = new Error("boom");
  });

  it("toasts and posts a command:error entry when an onFailure command throws", async () => {
    render(<Runner />, { wrapper });
    act(() => runHandle("test:failing"));
    await flush();

    expect(toastError).toHaveBeenCalledWith("It failed.", undefined);
    expect(recordCommandError).toHaveBeenCalledTimes(1);
    expect(recordCommandError).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        commandId: "test:failing",
        friendlyMessage: "It failed.",
        technicalMessage: "boom",
        correlationId: expect.any(String),
      }),
    );
  });

  it("only toasts (no POST) when the error already carries a correlationId", async () => {
    control.error = new ApiRequestError(500, { message: "server boom" }, "corr-backend-1");
    render(<Runner />, { wrapper });
    act(() => runHandle("test:failing"));
    await flush();

    expect(toastError).toHaveBeenCalledWith("It failed.", undefined);
    expect(recordCommandError).not.toHaveBeenCalled();
  });

  it("does not toast for a command without onFailure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Runner />, { wrapper });
    act(() => runHandle("test:silent"));
    await flush();

    expect(toastError).not.toHaveBeenCalled();
    expect(recordCommandError).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("suppresses the default handling when a scope's onCommandError returns true", async () => {
    const filter: CommandErrorFilter = () => true;
    const Publisher = () => {
      useCommandScope(scopeX, { ready: true }, { onCommandError: filter });
      return null;
    };
    render(
      <>
        <Publisher />
        <Runner />
      </>,
      { wrapper },
    );
    act(() => runHandle("scope-x:failing"));
    await flush();

    expect(toastError).not.toHaveBeenCalled();
    expect(recordCommandError).not.toHaveBeenCalled();
  });

  it("falls back to the default toast when the scope filter does not claim the error", async () => {
    const filter: CommandErrorFilter = () => false;
    const Publisher = () => {
      useCommandScope(scopeX, { ready: true }, { onCommandError: filter });
      return null;
    };
    render(
      <>
        <Publisher />
        <Runner />
      </>,
      { wrapper },
    );
    act(() => runHandle("scope-x:failing"));
    await flush();

    expect(toastError).toHaveBeenCalledWith("Scope failed.", undefined);
  });
});
