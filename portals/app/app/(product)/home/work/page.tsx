/**
 * Paginated list of personal work available to the current workspace.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

import { redirect } from "next/navigation";
import { Button, ViewHeader } from "../../../ds";
import { ProductContent } from "../../../framework/product-content";
import { productGateHref, productRoutes } from "../../../framework/product-experience";
import { ALL_WORK_PAGE_SIZE } from "../../../framework/recent-work";
import { RecentWorkCard } from "../../../framework/recent-work-card";
import { readRecentWork } from "../../../framework/recent-work.server";

export const dynamic = "force-dynamic";

export default async function AllWorkPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: query } = await searchParams;
  const page = typeof query === "string" && /^[1-9]\d{0,7}$/.test(query) ? Number(query) : 1;
  const work = await readRecentWork(ALL_WORK_PAGE_SIZE, (page - 1) * ALL_WORK_PAGE_SIZE);
  if (work.status === "anonymous") redirect(productGateHref(productRoutes.work));

  return (
    <ProductContent>
      <div lang="zh-CN">
        <ViewHeader title={"\u5168\u90e8\u5de5\u4f5c"} action={<Button variant="ghost" asChild><a href={productRoutes.home}>{"\u8fd4\u56de\u5de5\u4f5c\u9996\u9875"}</a></Button>} />
        {work.status === "ready" && work.items.length > 0 ? (
          <section className="workspace-work-section" aria-label={"\u5de5\u4f5c\u8bb0\u5f55"}>
            <div className="workspace-work-grid">
              {work.items.map((item) => <RecentWorkCard key={item.id} item={item} />)}
            </div>
          </section>
        ) : (
          <p className="workspace-work-state">
            {work.status === "unavailable" ? "\u6682\u65f6\u65e0\u6cd5\u8bfb\u53d6\u5de5\u4f5c\u8bb0\u5f55" : work.status === "locked" ? "\u5f53\u524d\u5de5\u4f5c\u7a7a\u95f4\u6ca1\u6709\u53ef\u67e5\u770b\u7684\u5de5\u4f5c\u8bb0\u5f55" : "\u8fd9\u4e00\u9875\u6ca1\u6709\u5de5\u4f5c\u8bb0\u5f55"}
          </p>
        )}
        {work.status === "ready" && (page > 1 || work.more) && (
          <nav className="workspace-work-paging" aria-label={"\u5de5\u4f5c\u5206\u9875"}>
            {page > 1 && <a href={`${productRoutes.work}?page=${page - 1}`}>{"\u4e0a\u4e00\u9875"}</a>}
            {work.more && <a href={`${productRoutes.work}?page=${page + 1}`}>{"\u4e0b\u4e00\u9875"}</a>}
          </nav>
        )}
      </div>
    </ProductContent>
  );
}
