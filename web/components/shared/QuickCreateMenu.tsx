import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CalendarPlus, ChevronDown, FileText, Plus, Receipt, Search, UserPlus } from "lucide-react";
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
  const [shortcut, setShortcut] = useState("⌘K");

  useEffect(() => {
    if (!navigator.platform.includes("Mac")) {
      setShortcut("Ctrl K");
    }
  }, []);

  const currentPath = `${location.pathname}${location.search}`;
  const go = (path: string) =>
    navigate(`${path}${path.includes("?") ? "&" : "?"}from=${encodeURIComponent(currentPath)}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="default"
          size="sm"
          className={cn(
            "gap-2 h-8 px-3 bg-orange-500 hover:bg-orange-500/90 text-white border-0 shadow-none text-[13px] font-medium"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          New
          <ChevronDown className="h-3.5 w-3.5 text-white/70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Quick create</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => go(withLocation("/appointments/new"))}>
          <CalendarPlus className="text-orange-500" />
          New appointment
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("/clients/new")}>
          <UserPlus className="text-blue-500" />
          New client
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
        <DropdownMenuItem onSelect={() => setOpen(true)}>
          <Search className="text-muted-foreground" />
          Open command palette
          <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
