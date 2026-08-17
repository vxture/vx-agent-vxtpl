import type { ReactNode } from "react";
import { BRAND } from "@vxtpl/shared/brand";
import { ShellBrand } from "../ds";
import { SessionControl } from "../session-control";

/**
 * The product chrome: everything a signed-in visitor navigates with.
 *
 * It is a route group rather than the root layout so that `/gate` can opt out.
 * A route group does not appear in the URL, so `(product)/page.tsx` is still
 * `/` - the grouping buys the layout boundary and costs nothing in routing.
 *
 * The brand mark is the design system's `ShellBrand`, the same component the
 * gate uses. That matters more than it looks: the mark is the one element a
 * visitor sees on both sides of the checkpoint, so if the two are drawn by
 * different code they drift, and the drift reads as "did I land somewhere
 * else?" at exactly the moment we are asking someone to trust the sign-in.
 */

const NAV_LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/status", label: "Status" },
  { href: "/platform-check", label: "Platform check" },
  { href: "/entitlement-matrix", label: "Entitlement matrix" },
];

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topnav">
        <ShellBrand href="/" label={BRAND.displayName} />
        <nav>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
          <SessionControl />
        </nav>
      </header>
      {children}
    </div>
  );
}
