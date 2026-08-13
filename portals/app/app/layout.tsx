import type { ReactNode } from "react";
import { BRAND } from "@product-code/shared/brand";
import "./globals.css";

export const metadata = {
  title: BRAND.displayName,
  description: `${BRAND.displayName} - a Vxture product`,
};

const NAV_LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/status", label: "Status" },
  { href: "/platform-check", label: "Platform check" },
  { href: "/entitlement-matrix", label: "Entitlement matrix" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={BRAND.defaultLocale}>
      <body>
        <div className="shell">
          <header className="topnav">
            <a href="/" className="brand-mark">
              {BRAND.displayName}
            </a>
            <nav>
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
