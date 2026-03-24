import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

export interface PageContext {
  entityType: "appointment" | "client" | "invoice" | "job" | "quote" | "vehicle" | null;
  entityId: string | null;
  entityLabel: string | null;
  clientId: string | null;
  clientName: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  appointmentId: string | null;
  invoiceId: string | null;
}

const defaultPageContext: PageContext = {
  entityType: null,
  entityId: null,
  entityLabel: null,
  clientId: null,
  clientName: null,
  vehicleId: null,
  vehicleLabel: null,
  appointmentId: null,
  invoiceId: null,
};

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  pageContext: PageContext;
  setPageContext: (ctx: PageContext | null) => void;
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  open: false,
  setOpen: () => {},
  pageContext: defaultPageContext,
  setPageContext: () => {},
});

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pageContext, setPageContextState] = useState<PageContext>(defaultPageContext);

  const handleSetPageContext = (ctx: PageContext | null) => {
    setPageContextState(ctx ?? defaultPageContext);
  };

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen, pageContext, setPageContext: handleSetPageContext }}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const { open, setOpen } = useContext(CommandPaletteContext);
  return { open, setOpen };
}

export function usePageContext() {
  const { pageContext, setPageContext } = useContext(CommandPaletteContext);
  return { pageContext, setPageContext };
}
