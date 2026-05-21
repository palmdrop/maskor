import { createContext, useContext, useState, type ReactNode } from "react";
import type {
  InsertSourceMode,
  InsertNextMode,
} from "@components/append-or-prepend-dialog";

type InsertTogglesContextValue = {
  sourceMode: InsertSourceMode;
  nextMode: InsertNextMode;
  setSourceMode: (mode: InsertSourceMode) => void;
  setNextMode: (mode: InsertNextMode) => void;
};

const InsertTogglesContext = createContext<InsertTogglesContextValue | null>(null);

export const InsertTogglesProvider = ({ children }: { children: ReactNode }) => {
  const [sourceMode, setSourceMode] = useState<InsertSourceMode>("cut");
  const [nextMode, setNextMode] = useState<InsertNextMode>("stay");
  return (
    <InsertTogglesContext.Provider value={{ sourceMode, nextMode, setSourceMode, setNextMode }}>
      {children}
    </InsertTogglesContext.Provider>
  );
};

export const useInsertToggles = (): InsertTogglesContextValue => {
  const context = useContext(InsertTogglesContext);
  if (!context) {
    throw new Error("useInsertToggles must be used within an InsertTogglesProvider");
  }
  return context;
};
