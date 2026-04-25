import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { triggerNativeFeedback, type NativeFeedbackStyle } from "@/lib/nativeInteractions";

export type NativeContextAction = {
  label: string;
  detail?: string;
  href?: string;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  feedback?: NativeFeedbackStyle;
  onSelect?: () => void | Promise<void>;
};

type NativeContextActionsProps = {
  label: string;
  actions: NativeContextAction[];
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pressDelayMs?: number;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function NativeContextActions({
  label,
  actions,
  children,
  className,
  disabled,
  pressDelayMs = 430,
}: NativeContextActionsProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const availableActions = actions.filter((action) => !action.disabled);
  const isDisabled = disabled || availableActions.length === 0;

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const openSheet = () => {
    if (isDisabled) return;
    clearTimer();
    suppressClickRef.current = true;
    setOpen(true);
    triggerNativeFeedback("medium");
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => clearTimer, []);

  const handleSelect = async (action: NativeContextAction) => {
    if (action.disabled) return;
    triggerNativeFeedback(action.feedback ?? (action.destructive ? "warning" : "light"));
    setOpen(false);
    if (action.onSelect) {
      await action.onSelect();
    }
    if (action.href) {
      if (/^(tel:|sms:|mailto:|https?:)/i.test(action.href)) {
        window.location.href = action.href;
      } else {
        navigate(action.href);
      }
    }
  };

  return (
    <>
      <div
        className={cn("native-context-trigger", className)}
        data-native-context-open={open ? "true" : undefined}
        onPointerDown={(event) => {
          if (isDisabled || event.pointerType === "mouse" || isEditableTarget(event.target)) return;
          startPointRef.current = { x: event.clientX, y: event.clientY };
          clearTimer();
          timerRef.current = window.setTimeout(() => openSheet(), pressDelayMs);
        }}
        onPointerMove={(event) => {
          const startPoint = startPointRef.current;
          if (!startPoint) return;
          const dx = Math.abs(event.clientX - startPoint.x);
          const dy = Math.abs(event.clientY - startPoint.y);
          if (dx > 12 || dy > 12) {
            clearTimer();
          }
        }}
        onPointerUp={() => {
          clearTimer();
          startPointRef.current = null;
        }}
        onPointerCancel={() => {
          clearTimer();
          startPointRef.current = null;
        }}
        onPointerLeave={() => {
          clearTimer();
          startPointRef.current = null;
        }}
        onContextMenu={(event) => {
          if (isDisabled || isEditableTarget(event.target)) return;
          event.preventDefault();
          openSheet();
        }}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDownCapture={(event) => {
          if (isDisabled) return;
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            openSheet();
          }
        }}
      >
        {children}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/16 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur-[2px] sm:items-center sm:pb-0"
          role="presentation"
          onPointerDown={(event) => {
            if (event.currentTarget === event.target) {
              setOpen(false);
            }
          }}
        >
          <div
            role="menu"
            aria-label={label}
            className="w-full max-w-sm overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/96 p-1.5 shadow-[0_24px_70px_rgba(15,23,42,0.24)] backdrop-blur-xl sm:max-w-md"
          >
            <div className="px-3 pb-1.5 pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Quick actions</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-950">{label}</p>
            </div>
            <div className="space-y-1">
              {availableActions.map((action) => (
                <button
                  key={`${action.label}-${action.href ?? ""}`}
                  type="button"
                  role="menuitem"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left transition-colors active:scale-[0.99]",
                    action.destructive ? "text-rose-700 hover:bg-rose-50" : "text-slate-900 hover:bg-slate-100/80"
                  )}
                  onClick={() => void handleSelect(action)}
                >
                  {action.icon ? (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 text-slate-600">
                      {action.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{action.label}</span>
                    {action.detail ? <span className="mt-0.5 block text-xs text-slate-500">{action.detail}</span> : null}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-1 w-full rounded-[1rem] px-3 py-3 text-center text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100/75"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
