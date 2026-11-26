/**
 * Application chrome for workspace routes.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Layout
 * @author AI-Generated
 * @date 2026-11-25
 */

import type { ReactNode } from "react";
import { ProductHeader } from "../framework/product-chrome";
import { SessionExit } from "../access/session-exit";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <div className="product-framework">
      <ProductHeader workspace />
      <SessionExit />
      {children}
    </div>
  );
}
