import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CalendarPlus, ChevronDown, FileText, PhoneCall, Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getCurrentLocationId } from "@/lib/auth";
import { useCommandPalette } from "./CommandPaletteContext";
import { triggerImpactFeedback, triggerSelectionFeedback } from "@/lib/nativeInteractions";

function withLocation(path: string): string {
  const currentLocationId = getCurrentLocationId();
  return currentLocationId
    ? `${path}${path.includes("?") ? "&" : "?"}locationId=${encodeURIComponent(currentLocationId)}`
    : path;
}

export function QuickCreateMenu() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const [open, setOpen] = useState(false);
  const [shortcut, setShortcut] = useState("Cmd K");

  useEffect(() => {
    if (!navigator.platform.includes("Mac")) {
      setShortcut("Ctrl K");
    }
  }, []);

  const currentPath = `${location.pathname}${location.search}`;
  const go = useCallback(
    (path: string) => {
      void triggerImpactFeedback("light");
      setOpen(false);
      navigate(`${path}${path.includes("?") ? "&" : "?"}from=${encodeURIComponent(currentPath)}`);
    },
    [currentPath, navigate]
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen !== open) {
          void triggerSelectionFeedback();
        }
        setOpen(nextOpen);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="default" size="sm" className={cn("h-9 gap-2 px-3.5 text-[13px]")}>
          <Plus className="h-3.5 w-3.5" />
          <span className="sm:hidden">Create</span>
          <span className="hidden sm:inline">Quick create</span>
          <ChevronDown className="h-3.5 w-3.5 text-white/70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Quick create</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => go(withLocation("/appointments/new"))}>
          <CalendarPlus className="text-orange-500" />
          New appointment
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("/leads?compose=1")}>
          <PhoneCall className="text-blue-500" />
          New lead
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("/quotes/new")}>
          <Receipt className="text-purple-500" />
          New quote
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("/invoices/new")}>
          <FileText className="text-green-500" />
          New invoice
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void triggerSelectionFeedback();
            setOpen(false);
            setCommandPaletteOpen(true);
          }}
        >
          <Search className="text-muted-foreground" />
          Open command palette
          <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
