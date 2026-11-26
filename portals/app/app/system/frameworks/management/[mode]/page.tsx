/**
 * Management selection examples from the scoped route inventory.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

import { notFound } from "next/navigation";
import { ManagementSample } from "../management-sample";

export default async function SelectionPage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (mode !== "select" && mode !== "bulk") notFound();
  return <ManagementSample key={mode} mode={mode} />;
}
