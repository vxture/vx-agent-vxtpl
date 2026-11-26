/**
 * Detail view for a still-authorized work record.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

import { notFound } from "next/navigation";
import { Button, ViewHeader } from "../../../../ds";
import { ProductContent } from "../../../../framework/product-content";
import { productExperience, productRoutes } from "../../../../framework/product-experience";
import { RecentWorkCard } from "../../../../framework/recent-work-card";
import { readWorkRecord } from "../../../../framework/recent-work.server";

export const dynamic = "force-dynamic";

export default async function WorkRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const result = await readWorkRecord(id);
  if (result.status === "missing") notFound();

  return (
    <ProductContent>
      <div lang="zh-CN">
        <ViewHeader title={"\u5de5\u4f5c\u8bb0\u5f55"} action={<Button variant="ghost" asChild><a href={productRoutes.work}>{"\u5168\u90e8\u5de5\u4f5c"}</a></Button>} />
        {result.status === "ready" ? (
          <div className="workspace-work-detail">
            <RecentWorkCard item={result.item} showLink={false} />
            {productExperience.example && <div className="workspace-work-paging"><Button asChild><a href={productExperience.example.href}>{productExperience.example.label}</a></Button></div>}
          </div>
        ) : <p className="workspace-work-state">{"\u6682\u65f6\u65e0\u6cd5\u8bfb\u53d6\u5de5\u4f5c\u8bb0\u5f55"}</p>}
      </div>
    </ProductContent>
  );
}
