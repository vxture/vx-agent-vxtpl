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

export type ProductContentWidth = "1536" | "1920";

export function ProductContent({
  children,
  width = "1536",
  className = "",
}: {
  children: ReactNode;
  width?: ProductContentWidth;
  className?: string;
}) {
  return (
    <main className={`product-framework-content ${className}`} data-content-width={width}>
      {children}
    </main>
  );
}
