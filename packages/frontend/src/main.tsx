import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

import "./styles/global.css";
import { queryClient } from "./queryClient";
import { CommandsProvider } from "@lib/commands/CommandsProvider";
import { HotkeyBinder } from "@lib/commands/HotkeyBinder";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CommandsProvider>
      <HotkeyBinder />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </CommandsProvider>
  </StrictMode>,
);
