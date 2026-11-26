/**
 * Business framework sample with a draft and optional region slots.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { ViewHeader } from "../../../ds";
import { InlinePerson } from "../../../framework/inline-person";
import { ProductHeader } from "../../../framework/product-chrome";
import { productRoutes } from "../../../framework/product-experience";
import type { ProductContentWidth } from "../../../framework/product-content";
import { WorkspaceRegions } from "../../../framework/workspace-regions";
import { frameworkSamples } from "../catalog";

export default function BusinessSample() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [width, setWidth] = useState<ProductContentWidth>("1536");
  const [draft, setDraft] = useState("");

  return (
    <WorkspaceRegions
      width={width}
      renderHeader={(actions) => <ProductHeader workspace actions={actions} />}
      left={{
        title: "Resources",
        open: leftOpen,
        onOpenChange: setLeftOpen,
        content: (
          <div className="workspace-region-content">
            <h2>Frameworks</h2>
            <ul className="framework-resource-list">
              {frameworkSamples.map((item) => (
                <li key={item.key}><Link href={item.href} aria-current={item.key === "business" ? "page" : undefined}>{item.title}</Link></li>
              ))}
            </ul>
          </div>
        ),
      }}
      right={{
        title: "Properties",
        open: rightOpen,
        onOpenChange: setRightOpen,
        content: (
          <div className="workspace-region-content">
            <h2>Properties</h2>
            <dl className="product-scope-details">
              <div><dt>Draft characters</dt><dd>{draft.length}</dd></div>
              <div><dt>Content width limit</dt><dd>{width}px</dd></div>
            </dl>
          </div>
        ),
      }}
    >
      <div className="workspace-page-heading">
        <Link href={productRoutes.frameworks}>Framework catalogue</Link>
        <ViewHeader
          title="Business workspace"
          action={
            <label className="workspace-width-control">
              Content width
              <select value={width} onChange={(event) => setWidth(event.target.value === "1920" ? "1920" : "1536")}>
                <option value="1536">1536px</option>
                <option value="1920">1920px</option>
              </select>
            </label>
          }
        />
      </div>
      <section className="workspace-draft" aria-labelledby="draft-title">
        <h2 id="draft-title">Draft</h2>
        <p className="workspace-draft-byline">Sample author <InlinePerson name="Vxtpl Design Team" picture="/logo.svg" /></p>
        <label className="sr-only" htmlFor="framework-draft">Draft text</label>
        <textarea id="framework-draft" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Enter a draft" />
      </section>
    </WorkspaceRegions>
  );
}
