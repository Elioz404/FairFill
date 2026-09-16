"use client";

import clsx from "clsx";
import { useState } from "react";
import { BRAND_ICONS } from "@/lib/brand-icons";

const SIZES = {
  xs: { box: "size-5", glyph: "size-3.5", text: "text-[7px]" },
  sm: { box: "size-8", glyph: "size-4", text: "text-[10px]" },
  md: { box: "size-11", glyph: "size-5", text: "text-xs" },
  lg: { box: "size-14", glyph: "size-7", text: "text-sm" },
} as const;

/**
 * Company mark: the brand glyph when known, else the logo from the Web3 API (live mode),
 * else the ticker monogram. Always monochrome on a neutral disc.
 */
export function StockLogo({
  ticker,
  logoUrl,
  size = "md",
  className,
}: {
  ticker: string;
  logoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dims = SIZES[size];
  const brand = BRAND_ICONS[ticker.toUpperCase()];
  const disc = clsx("grid shrink-0 place-items-center rounded-full border border-line-strong bg-ink-750", dims.box, className);

  if (brand) {
    return (
      <span className={disc} title={brand.title}>
        <svg viewBox="0 0 24 24" role="img" aria-label={brand.title} className={clsx(dims.glyph, "fill-fg-soft")}>
          <path d={brand.path} />
        </svg>
      </span>
    );
  }
  if (logoUrl && !failed) {
    return (
      // Remote token icons: a plain img keeps them out of the image optimizer.
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={clsx("shrink-0 rounded-full bg-ink-750 object-cover", dims.box, className)}
      />
    );
  }
  return (
    <span aria-hidden className={clsx(disc, "num font-semibold text-fg-soft", dims.text)}>
      {ticker.slice(0, size === "xs" ? 2 : 4)}
    </span>
  );
}
