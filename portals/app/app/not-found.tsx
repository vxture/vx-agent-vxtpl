/**
 * Product-level missing page with a safe return action.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

import { Button } from "./ds";
import { ProductContent } from "./framework/product-content";
import { productRoutes } from "./framework/product-experience";

export default function NotFound() {
  return (
    <ProductContent>
      <div className="product-workspace-intro">
        <h1>Page unavailable</h1>
        <p>This page may have moved or may be unavailable in the current workspace.</p>
        <div className="product-workspace-actions">
          <Button asChild><a href={productRoutes.home}>Back to workspace</a></Button>
        </div>
      </div>
    </ProductContent>
  );
}
