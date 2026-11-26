/**
 * Map framework sample with an unconfigured product stage.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

import Link from "next/link";
import { Icon } from "../../../ds";
import { CanvasWorkspace } from "../../../framework/canvas-workspace";
import { productRoutes } from "../../../framework/product-experience";

export default function CanvasSample() {
  return (
    <CanvasWorkspace
      title={"\u5730\u56fe\u5de5\u4f5c\u53f0"}
      view="Default view"
      information={
        <>
          <h2>Default view</h2>
          <p>This framework provides a stage and overlay tools for product content.</p>
          <Link href={productRoutes.frameworks}>Framework catalogue</Link>
        </>
      }
    >
      <div className="canvas-sample-stage">
        <Icon name="map-pin" size="lg" aria-hidden="true" />
        <h1>No map configured</h1>
      </div>
    </CanvasWorkspace>
  );
}
