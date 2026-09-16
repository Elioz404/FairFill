/** Three price lines converge into one fill. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="FairFill">
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8" fill="#14151a" stroke="#33363f" strokeWidth="1.5" />
      <path d="M7 9.5 C13 9.5 13 16 17 16 M7 16 H17 M7 22.5 C13 22.5 13 16 17 16" fill="none" stroke="#8c8f9b" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 16 H24.5" fill="none" stroke="#f0b90b" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24.5" cy="16" r="2.3" fill="#f0b90b" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight text-fg">FairFill</span>
    </span>
  );
}
