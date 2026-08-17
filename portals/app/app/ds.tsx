"use client";

import type { ReactNode } from "react";
import { ThemeProvider, themeBootstrapScript } from "@vxture/design-system";

// The single client boundary through which server components reach the design
// system.
//
// It exists because of a packaging defect, not a preference. The umbrella's
// main entry is `"use client"` AND uses `export *` (to re-export design-ui and
// design-tokens), and Next.js rejects that combination outright the moment a
// SERVER component imports it:
//
//   Error: It's currently unsupported to use "export *" in a client boundary.
//          Please use named exports instead.
//
// So `app/layout.tsx` cannot import the DS at all, even to render a provider.
// Re-exporting by name from our own client module gives Next a boundary it
// accepts, and confines the workaround to one file with the reason attached.
// Reported upstream on vxture/vxture-platform#268.
//
// Client components (`product-gate.tsx`) may import the DS directly - the rule
// only bites when the server graph reaches it.

export { ShellBrand, ShellBootScreen } from "@vxture/design-system";

/**
 * Theme wiring: the pre-paint class-setter plus the provider.
 *
 * The script has to be rendered HERE rather than in the server layout for the
 * same reason: `themeBootstrapScript` is a plain string exported from a client
 * module, and a server component that imports one gets a client reference, not
 * the text. Rendered from a client component it is still emitted into the SSR
 * HTML, so it runs while the document is parsing - which is the whole point,
 * since an effect would run one frame too late and the frame is where the
 * flash lives.
 */
export function AppTheme({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      <ThemeProvider defaultMode="system">{children}</ThemeProvider>
    </>
  );
}
