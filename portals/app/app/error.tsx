/**
 * Route error state with an explicit retry.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { Button } from "./ds";
import { ProductContent } from "./framework/product-content";
import { productRoutes } from "./framework/product-experience";

export default function RouteError({ reset }: { reset: () => void }) {
  return (
    <ProductContent>
      <div className="product-workspace-intro">
        <h1>Could not load this page</h1>
        <div className="product-workspace-actions">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="ghost"><a href={productRoutes.home}>Back to workspace</a></Button>
        </div>
      </div>
    </ProductContent>
  );
}
