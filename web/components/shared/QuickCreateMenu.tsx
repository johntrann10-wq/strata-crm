import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "./CommandPaletteContext";

export function QuickCreateMenu() {
  const { setOpen } = useCommandPalette();
  const [shortcut, setShortcut] = useState("⌘K");

  useEffect(() => {
    if (!navigator.platform.includes("Mac")) {
      setShortcut("Ctrl K");
    }
  }, []);

  return (
    <Button
      variant="default"
      size="sm"
      className={cn("gap-2 h-8 px-3 bg-orange-500 hover:bg-orange-500/90 text-white border-0 shadow-none text-[13px] font-medium")}
      onClick={() => setOpen(true)}
    >
      <Plus className="h-3.5 w-3.5" />
      New
      <kbd className="hidden md:inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium text-white/60 bg-white/15 leading-none">
        {shortcut}
      </kbd>
    </Button>
  );
}