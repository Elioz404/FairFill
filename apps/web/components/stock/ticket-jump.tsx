"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

/** Small-screen shortcut to the trade card, hidden while the card is on screen. */
export function TicketJump({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const ticket = document.getElementById("trade");
    if (!ticket) return;
    // Only while the card is still below the fold: past it, the user has already seen it.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setVisible(!entry.isIntersecting && entry.boundingClientRect.top > 0);
      },
      { threshold: 0.05 },
    );
    observer.observe(ticket);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={clsx(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink-950/90 px-4 py-3 backdrop-blur-xl transition-transform duration-300 lg:hidden",
        visible ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <a
        href="#trade"
        tabIndex={visible ? 0 : -1}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("trade")?.scrollIntoView({ block: "start", behavior: "smooth" });
        }}
        className="flex w-full items-center justify-center rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-gold-bright"
      >
        {label}
      </a>
    </div>
  );
}
