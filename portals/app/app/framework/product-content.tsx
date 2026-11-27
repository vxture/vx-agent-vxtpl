/**
 * Center content container for public and workspace pages.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

import type { ReactNode } from "react";
import "./product-framework.css";

const contentWidths = {
  narrow: "1280",
  default: "1536",
  wide: "1920",
  "1536": "1536",
  "1920": "1920",
} as const;

export type ProductContentWidth = keyof typeof contentWidths;

export function ProductContent({
  children,
  width = "default",
  className = "",
}: {
  children: ReactNode;
  width?: ProductContentWidth;
  className?: string;
}) {
  return (
    <main className={`product-framework-content ${className}`} data-content-width={contentWidths[width]}>
      {children}
    </main>
  );
}
