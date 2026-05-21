import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { router } from "./router";

import "./styles/global.css";
import { queryClient } from "./queryClient";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import { HotkeyBinder } from "@lib/commands/HotkeyBinder";
import { CommandPalette } from "@components/command-palette/CommandPalette";
import { InsertTogglesProvider } from "@lib/insert-toggles/InsertTogglesProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CommandsProvider>
      <InsertTogglesProvider>
        <HotkeyBinder />
        <CommandPalette />
        <Toaster />
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </InsertTogglesProvider>
    </CommandsProvider>
  </StrictMode>,
);
