/**
 * Entry page for the development framework catalogue.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

import Link from "next/link";
import { ProductHeader } from "../../framework/product-chrome";
import { ProductContent } from "../../framework/product-content";
import { frameworkSamples } from "./catalog";

export default function FrameworkCatalogue() {
  return (
    <div className="product-framework">
      <ProductHeader workspace />
      <ProductContent>
        <h1 className="text-title-xl">Platform product frameworks</h1>
        <ul className="framework-catalogue">
          {frameworkSamples.map(({ key, title, href, summary }) => (
            <li key={key}><Link href={href}>{title}</Link><p>{summary}</p></li>
          ))}
        </ul>
      </ProductContent>
    </div>
  );
}
