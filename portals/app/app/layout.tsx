import type { ReactNode } from "react";
import { BRAND } from "@vxtpl/shared/brand";
import { AppTheme } from "./ds";
import "./globals.css";

export const metadata = {
  title: BRAND.displayName,
  description: `${BRAND.displayName} - a Vxture product`,
  icons: { icon: "/logo.svg" },
};

/**
 * The document, and nothing else.
 *
 * Route layouts select their own chrome. The public entry and gate use the
 * public header, and workspace routes use the header with workspace navigation.
 *
 * THEME. The design system's dark mode is driven by a `.dark` class on
 * `<html>`, and it never uses `prefers-color-scheme` - so a stylesheet that
 * reaches for the media query instead is answering a different question from
 * the one the DS is answering, and the two disagree the moment the OS is dark.
 * vxtpl had exactly that bug after the 5.x migration: its own surfaces flipped
 * and the DS's tokens did not.
 *
 * `AppTheme` carries both halves: the pre-paint class-setter and the provider.
 * It lives in `ds.tsx` rather than here because the DS cannot be imported from
 * a server component at all - see that file.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={BRAND.defaultLocale} suppressHydrationWarning>
      <body>
        <AppTheme>{children}</AppTheme>
      </body>
    </html>
  );
}
