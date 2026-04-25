import { useEffect, useState } from "react";
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
import { triggerNativeHaptic } from "@/lib/nativeFieldOps";

function withLocation(path: string): string {
  const currentLocationId = getCurrentLocationId();
  return currentLocationId
    ? `${path}${path.includes("?") ? "&" : "?"}locationId=${encodeURIComponent(currentLocationId)}`
    : path;
}

export function QuickCreateMenu() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpen } = useCommandPalette();
  const [shortcut, setShortcut] = useState("Cmd K");

  useEffect(() => {
    if (!navigator.platform.includes("Mac")) {
      setShortcut("Ctrl K");
    }
  }, []);

  const currentPath = `${location.pathname}${location.search}`;
  const go = async (path: string) => {
    await triggerNativeHaptic("light");
    navigate(`${path}${path.includes("?") ? "&" : "?"}from=${encodeURIComponent(currentPath)}`);
  };

  return (
    <DropdownMenu onOpenChange={(open) => void triggerNativeHaptic(open ? "light" : "medium")}>
      <DropdownMenuTrigger asChild>
        <Button variant="default" size="sm" className={cn("native-touch-surface h-9 gap-2 px-3.5 text-[13px]")}>
          <Plus className="h-3.5 w-3.5" />
          <span className="sm:hidden">Create</span>
          <span className="hidden sm:inline">Quick create</span>
          <ChevronDown className="h-3.5 w-3.5 text-white/70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-[1.2rem] border-white/70 bg-white/96 p-1 shadow-[0_20px_48px_rgba(15,23,42,0.14)]">
        <DropdownMenuLabel>Quick create</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void go(withLocation("/appointments/new"))}>
          <CalendarPlus className="text-orange-500" />
          New appointment
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void go("/leads")}>
          <PhoneCall className="text-blue-500" />
          New lead
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void go("/quotes/new")}>
          <Receipt className="text-purple-500" />
          New quote
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void go("/invoices/new")}>
          <FileText className="text-green-500" />
          New invoice
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void triggerNativeHaptic("light");
            setOpen(true);
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
