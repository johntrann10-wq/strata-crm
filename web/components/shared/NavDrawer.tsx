import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export const NavDrawer = ({ children }: { children: (props: { close: () => void }) => React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full border border-border/70 bg-background/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        swipeToClose
        onSwipeClose={close}
        className="w-[min(92vw,22rem)] max-w-none p-0 transition-transform duration-300 sm:w-[24rem]"
      >
        {children({ close })}
      </SheetContent>
    </Sheet>
  );
};
