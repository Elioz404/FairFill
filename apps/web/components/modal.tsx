"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Native <dialog> modal: focus trap, Escape and top-layer stacking come from the browser.
 * Centered on large screens, a bottom sheet on phones.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        "m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-none overflow-hidden rounded-2xl border border-line-strong bg-ink-850 p-0 text-fg shadow-2xl",
        "backdrop:bg-ink-950/80 backdrop:backdrop-blur-sm",
        "max-sm:mb-0 max-sm:w-full max-sm:rounded-b-none",
        wide ? "sm:w-[40rem]" : "sm:w-[28rem]",
      )}
    >
      {open ? (
        <div className="flex max-h-[88dvh] flex-col animate-rise">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">{title}</h2>
              {subtitle ? <div className="mt-0.5 text-xs text-fg-muted">{subtitle}</div> : null}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-md p-1 text-fg-muted transition hover:bg-ink-750 hover:text-fg">
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-5 [scrollbar-width:thin]">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
