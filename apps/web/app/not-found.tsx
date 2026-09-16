import Link from "next/link";
import { SearchBox } from "@/components/search-box";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="eyebrow">404</p>
      <h1 className="heading mt-4 text-5xl">Not on the tape.</h1>
      <p className="mt-4 text-fg-muted">That ticker has no tokenized version on BNB Smart Chain — or it is spelled differently.</p>
      <div className="mt-8 text-left">
        <SearchBox autoFocus />
      </div>
      <Link href="/" className="mt-8 inline-block text-sm text-gold hover:text-gold-bright">
        ← Back to the tape
      </Link>
    </div>
  );
}
