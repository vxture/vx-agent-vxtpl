/**
 * Workspace entry for the enabled product modules.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

import { Button, SectionHeader } from "../../ds";
import { gateLoginHref } from "../../access/destination";
import { ProductContent } from "../../framework/product-content";
import { productExperience, productRoutes } from "../../framework/product-experience";
import { RecentWorkCard } from "../../framework/recent-work-card";
import { HOME_WORK_LIMIT } from "../../framework/recent-work";
import { readRecentWork } from "../../framework/recent-work.server";
import { WorkspaceHeadline } from "../../framework/workspace-headline";
import { isDeployedStage } from "../../lib/deploy-stage";
import "../../framework/workspace-home.css";

export const dynamic = "force-dynamic";

export default async function WorkspaceHome() {
  const work = await readRecentWork(HOME_WORK_LIMIT);
  const latest = work.status === "ready" ? work.items[0] : undefined;
  const { example } = productExperience;
  return (
    <ProductContent className="workspace-overview">
      <header className="workspace-overview-hero">
        <WorkspaceHeadline />
        <div className="product-workspace-actions">
          <Button asChild><a href={work.status === "anonymous" ? gateLoginHref(productRoutes.home) : productRoutes.chat}>{work.status === "anonymous" ? "\u767b\u5f55" : "\u5f00\u59cb\u5bf9\u8bdd"}</a></Button>
          {latest && <Button variant="outline" asChild><a href={`${productRoutes.work}/${latest.id}`}>{"\u67e5\u770b\u4e0a\u6b21\u8bb0\u5f55"}</a></Button>}
          {example && <Button variant="ghost" asChild><a href={example.href}>{example.label}</a></Button>}
          <Button variant="ghost" asChild><a href="/platform-check">{"平台接入演示"}</a></Button>
          {!isDeployedStage() && <Button variant="ghost" asChild><a href={productRoutes.frameworks}>{"\u6846\u67b6\u9884\u89c8"}</a></Button>}
        </div>
      </header>
      {(work.status === "ready" || work.status === "unavailable") && (
        <section className="workspace-work-section" aria-label={"\u6700\u8fd1\u5de5\u4f5c"} lang="zh-CN">
          <SectionHeader
            title={"\u6700\u8fd1\u5de5\u4f5c"}
            action={work.status === "ready" && work.items.length ? <Button variant="ghost" asChild><a href={productRoutes.work}>{"\u5168\u90e8\u5de5\u4f5c"}</a></Button> : undefined}
          />
          {work.status === "unavailable" ? (
            <p className="workspace-work-state">{"\u6682\u65f6\u65e0\u6cd5\u8bfb\u53d6\u8bb0\u5f55 "}<a href={productRoutes.home}>{"\u91cd\u65b0\u68c0\u67e5"}</a></p>
          ) : work.items.length ? (
            <div className="workspace-work-grid" data-overview>
              {work.items.map((item) => <RecentWorkCard key={item.id} item={item} />)}
            </div>
          ) : (
            <p className="workspace-work-state">{"\u6682\u65e0\u6700\u8fd1\u5de5\u4f5c "}{example && <a href={example.href}>{example.label}</a>}</p>
          )}
        </section>
      )}
    </ProductContent>
  );
}
