import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CommandsProvider } from "@lib/commands/CommandsProvider";

const patchMutate = vi.fn();

vi.mock("@api/settings", () => ({
  useSettings: vi.fn(() => ({
    data: { status: 200, data: { maskorManagedRoot: "/projects", warning: null } },
    isLoading: false,
    isError: false,
  })),
  usePatchSettings: vi.fn(() => ({
    mutate: patchMutate,
    isPending: false,
    error: null,
  })),
  SETTINGS_QUERY_KEY_FN: () => ["settings"],
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});

vi.mock("@components/FolderPicker", () => ({
  FolderPicker: () => <div data-testid="folder-picker" />,
}));

import { SettingsSection } from "../SettingsSection";

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <CommandsProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </CommandsProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SettingsSection", () => {
  it("calls patchMutation.mutate with the input value when Save is clicked", async () => {
    wrap(<SettingsSection />);
    // Flush the useEffect that sets managedRootInput from the loaded settings
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(patchMutate).toHaveBeenCalledWith(
      { data: { maskorManagedRoot: "/projects" } },
      expect.any(Object),
    );
  });
});
