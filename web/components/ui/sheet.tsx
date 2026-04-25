import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function hasNamedSheetChild(children: React.ReactNode, names: string[]): boolean {
  return React.Children.toArray(children).some((child) => {
    if (!React.isValidElement(child)) return false;
    const elementType = child.type as { displayName?: string; name?: string };
    const displayName = elementType.displayName ?? elementType.name;
    if (displayName && names.includes(displayName)) return true;
    return hasNamedSheetChild(child.props.children, names);
  });
}

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

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentProps<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  return (
    <SheetPrimitive.Overlay
      ref={ref}
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]",
        className
      )}
      {...props}
    />
  );
});
SheetOverlay.displayName = "SheetOverlay";

type SheetContentProps = React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  swipeToClose?: boolean;
  onSwipeClose?: () => void;
};

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  (
    {
      className,
      children,
      side = "right",
      swipeToClose = false,
      onSwipeClose,
      style,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      ...props
    },
    ref
  ) => {
    const localRef = React.useRef<React.ElementRef<typeof SheetPrimitive.Content> | null>(null);
    const overlayRef = React.useRef<React.ElementRef<typeof SheetPrimitive.Overlay> | null>(null);
    const closeTimerRef = React.useRef<number | null>(null);
    const gestureRef = React.useRef({
      active: false,
      dragging: false,
      pointerId: null as number | null,
      startX: 0,
      startY: 0,
      startTime: 0,
      offset: 0,
    });

    const setRefs = React.useCallback(
      (node: React.ElementRef<typeof SheetPrimitive.Content> | null) => {
        localRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    const clearCloseTimer = React.useCallback(() => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    }, []);

    const clearPresentationStyles = React.useCallback(() => {
      const node = localRef.current;
      if (node) {
        node.style.removeProperty("animation");
        node.style.removeProperty("transform");
        node.style.removeProperty("transition");
        node.style.removeProperty("will-change");
      }

      const overlay = overlayRef.current;
      if (overlay) {
        overlay.style.removeProperty("animation");
        overlay.style.removeProperty("opacity");
        overlay.style.removeProperty("transition");
      }
    }, []);

    const applyDragStyles = React.useCallback((offset: number, animated: boolean, durationMs = 220) => {
      const node = localRef.current;
      if (!node) return;
      node.style.willChange = "transform";
      node.style.transition = animated ? `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none";
      node.style.transform = `translate3d(${offset}px, 0, 0)`;
    }, []);

    const applyOverlayProgress = React.useCallback((progress: number, animated: boolean, durationMs = 220) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const clamped = Math.max(0, Math.min(progress, 1));
      overlay.style.transition = animated ? `opacity ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none";
      overlay.style.opacity = String(0.5 - clamped * 0.32);
    }, []);

    const resetGesture = React.useCallback(() => {
      gestureRef.current.active = false;
      gestureRef.current.dragging = false;
      gestureRef.current.pointerId = null;
      gestureRef.current.offset = 0;
    }, []);

    React.useEffect(
      () => () => {
        clearCloseTimer();
      },
      [clearCloseTimer]
    );

    const isHorizontalSheet = side === "left" || side === "right";
    const canSwipeToClose = swipeToClose && isHorizontalSheet;

    const handlePointerDown = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerDown?.(event);
        if (!canSwipeToClose || event.pointerType === "mouse") return;

        clearCloseTimer();
        clearPresentationStyles();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        gestureRef.current.active = true;
        gestureRef.current.dragging = false;
        gestureRef.current.pointerId = event.pointerId;
        gestureRef.current.startX = event.clientX;
        gestureRef.current.startY = event.clientY;
        gestureRef.current.startTime = performance.now();
        gestureRef.current.offset = 0;
      },
      [canSwipeToClose, clearCloseTimer, clearPresentationStyles, onPointerDown]
    );

    const handlePointerMove = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerMove?.(event);
        if (!canSwipeToClose) return;

        const gesture = gestureRef.current;
        if (!gesture.active || gesture.pointerId !== event.pointerId) return;

        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        const width = localRef.current?.offsetWidth ?? 320;
        const rawOffset = side === "left" ? Math.min(0, dx) : Math.max(0, dx);
        const offset = side === "left" ? Math.max(-width, rawOffset * 0.98) : Math.min(width, rawOffset * 0.98);

        if (!gesture.dragging) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (Math.abs(dx) <= Math.abs(dy) || offset === 0) return;
          gesture.dragging = true;
        }

        event.preventDefault();
        gesture.offset = offset;
        applyDragStyles(offset, false);
        applyOverlayProgress(Math.abs(offset) / width, false);
      },
      [applyDragStyles, applyOverlayProgress, canSwipeToClose, onPointerMove, side]
    );

    const finishGesture = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        const gesture = gestureRef.current;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        if (!canSwipeToClose || !gesture.active || gesture.pointerId !== event.pointerId) {
          resetGesture();
          return;
        }

        const distance = Math.abs(gesture.offset);
        if (!gesture.dragging) {
          resetGesture();
          clearPresentationStyles();
          return;
        }

        const node = localRef.current;
        const width = node?.offsetWidth ?? 320;
        const elapsed = Math.max(1, performance.now() - gesture.startTime);
        const velocity = distance / elapsed;
        const progress = distance / width;
        const threshold = Math.min(Math.max(width * 0.22, 64), 120);
        const shouldClose = distance >= threshold || velocity > 0.55;

        clearCloseTimer();

        if (shouldClose) {
          const exitOffset = side === "left" ? -width : width;
          const exitDuration = Math.max(190, Math.round(300 - progress * 70));
          if (node) {
            node.style.animation = "none";
          }
          if (overlayRef.current) {
            overlayRef.current.style.animation = "none";
          }
          applyDragStyles(exitOffset, true, exitDuration);
          applyOverlayProgress(1, true, exitDuration);
          window.setTimeout(() => {
            onSwipeClose?.();
          }, Math.max(72, Math.round(exitDuration * 0.55)));
          closeTimerRef.current = window.setTimeout(() => {
            clearPresentationStyles();
          }, exitDuration + 180);
        } else {
          applyDragStyles(0, true, 260);
          applyOverlayProgress(0, true, 260);
          closeTimerRef.current = window.setTimeout(() => {
            clearPresentationStyles();
          }, 260);
        }

        resetGesture();
      },
      [applyDragStyles, applyOverlayProgress, canSwipeToClose, clearCloseTimer, clearPresentationStyles, onSwipeClose, resetGesture, side]
    );

    const handlePointerUp = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerUp?.(event);
        finishGesture(event);
      },
      [finishGesture, onPointerUp]
    );

    const handlePointerCancel = React.useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerCancel?.(event);
        finishGesture(event);
      },
      [finishGesture, onPointerCancel]
    );

    const hasTitle = hasNamedSheetChild(children, ["SheetTitle"]);
    const hasDescription = hasNamedSheetChild(children, ["SheetDescription"]);
    const contentProps = {
      ...props,
      ...(props["aria-describedby"] === undefined && !hasDescription ? { "aria-describedby": undefined } : {}),
    };

    return (
      <SheetPortal>
        <SheetOverlay ref={overlayRef} />
        <SheetPrimitive.Content
          ref={setRefs}
          data-slot="sheet-content"
          className={cn(
            "app-native-scroll bg-background/98 data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 overflow-y-auto shadow-[0_20px_60px_rgba(15,23,42,0.18)] transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
            side === "right" &&
              "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-[min(92vw,24rem)] rounded-l-[1.75rem] border-l border-border/80 pb-[max(1rem,env(safe-area-inset-bottom))] sm:w-[24rem]",
            side === "left" &&
              "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-[min(92vw,24rem)] rounded-r-[1.75rem] border-r border-border/80 pb-[max(1rem,env(safe-area-inset-bottom))] sm:w-[24rem]",
            side === "top" &&
              "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 max-h-[90svh] border-b border-border/80",
            side === "bottom" &&
              "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 max-h-[90svh] rounded-t-[1.5rem] border-t border-border/80 pb-[max(1rem,env(safe-area-inset-bottom))]",
            className
          )}
          style={{
            ...style,
            ...(canSwipeToClose ? { touchAction: "pan-y" as const } : {}),
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          {...contentProps}
        >
          {!hasTitle ? <SheetTitle className="sr-only">Panel</SheetTitle> : null}
          {children}
          <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-background/88 opacity-80 transition hover:border-border hover:bg-accent focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  }
);
SheetContent.displayName = "SheetContent";

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
