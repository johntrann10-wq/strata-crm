import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]",
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  swipeToClose = false,
  onSwipeClose,
  showHandle,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  swipeToClose?: boolean;
  onSwipeClose?: () => void;
  showHandle?: boolean;
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const gestureRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    axisLocked: boolean;
    dragging: boolean;
  } | null>(null);
  const [dragOffset, setDragOffset] = React.useState(0);

  const shouldShowHandle = showHandle ?? side === "bottom";
  const supportsSwipeClose = swipeToClose && (side === "bottom" || side === "left" || side === "right");

  const releaseGesture = React.useCallback(
    (shouldClose: boolean) => {
      gestureRef.current = null;
      setDragOffset(0);
      if (shouldClose) {
        onSwipeClose?.();
      }
    },
    [onSwipeClose]
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!supportsSwipeClose || event.pointerType === "mouse") return;
      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        axisLocked: false,
        dragging: false,
      };
    },
    [supportsSwipeClose]
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || !supportsSwipeClose) return;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const contentNode = contentRef.current;

      if (!gesture.axisLocked) {
        const wantsVertical = side === "bottom";
        const isGestureMatch = wantsVertical ? absY > Math.max(absX * 1.2, 8) : absX > Math.max(absY * 1.2, 8);
        if (!isGestureMatch) return;
        if (side === "bottom" && contentNode && contentNode.scrollTop > 0 && deltaY > 0) return;
        gesture.axisLocked = true;
      }

      let nextOffset = 0;
      if (side === "bottom") nextOffset = Math.max(0, deltaY);
      if (side === "left") nextOffset = Math.min(0, deltaX);
      if (side === "right") nextOffset = Math.max(0, deltaX);

      if (nextOffset === 0 && !gesture.dragging) return;
      gesture.dragging = true;
      setDragOffset(nextOffset);
    },
    [side, supportsSwipeClose]
  );

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || !supportsSwipeClose) return;
      const shouldClose =
        (side === "bottom" && dragOffset > 96) ||
        ((side === "left" || side === "right") && Math.abs(dragOffset) > 84);
      releaseGesture(shouldClose);
    },
    [dragOffset, releaseGesture, side, supportsSwipeClose]
  );

  const handlePointerCancel = React.useCallback(() => {
    if (!supportsSwipeClose) return;
    releaseGesture(false);
  }, [releaseGesture, supportsSwipeClose]);

  const dragTransform =
    side === "bottom"
      ? `translate3d(0, ${dragOffset}px, 0)`
      : side === "left" || side === "right"
        ? `translate3d(${dragOffset}px, 0, 0)`
        : undefined;

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={contentRef}
        data-slot="sheet-content"
        className={cn(
          "ios-momentum-y native-sheet-shell bg-background/98 data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 overflow-y-auto overscroll-y-contain transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-[min(92vw,24rem)] border-l border-border/80 pb-[max(1rem,env(safe-area-inset-bottom))] sm:w-[24rem]",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-[min(92vw,24rem)] border-r border-border/80 pb-[max(1rem,env(safe-area-inset-bottom))] sm:w-[24rem]",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 max-h-[90svh] border-b border-border/80",
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 max-h-[90svh] rounded-t-[1.5rem] border-t border-border/80 pb-[max(1rem,env(safe-area-inset-bottom))]",
          className
        )}
        style={
          dragOffset !== 0
            ? {
                transform: dragTransform,
                transitionDuration: "0ms",
              }
            : undefined
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        {...props}
      >
        {shouldShowHandle ? (
          <div className={cn("pointer-events-none flex shrink-0 justify-center", side === "bottom" ? "pt-3" : "pt-4")}>
            <span aria-hidden="true" className="native-sheet-handle" />
          </div>
        ) : null}
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-background/88 opacity-80 transition hover:border-border hover:bg-accent focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-2 p-5 sm:p-6", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 border-t border-border/70 p-5 sm:p-6", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground text-xl font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm leading-6", className)}
      {...props}
    />
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription };
