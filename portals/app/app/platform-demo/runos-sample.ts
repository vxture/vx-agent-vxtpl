/**
 * Live, read-only document conversion used by the platform acceptance page.
 * @package @vxtpl/app
 * @layer Application
 * @category Verification
 * @author AI-Generated
 * @date 2026-11-26
 */

import { getRunosClientConfig, type CallToolOptions } from "../runos/client";
import { canDiscoverDocumentConverter, convertHtmlToMarkdown, DOCUMENT_CONVERTER } from "../runos/document-conversion";
import type { Check, ProbeReceipt } from "./types";

const HEADING = "Vxture acceptance sample";
const HTML = `<!doctype html><html><body><h1>${HEADING}</h1><p>Weekly progress report.</p></body></html>`;

export async function checkRunosSample(call: CallToolOptions): Promise<Check> {
  const config = getRunosClientConfig();
  if (!config) return { state: "waiting", detail: "等待配置 RUNOS_API_URL" };

  const capabilityId = process.env.PLATFORM_DEMO_RUNOS_CAPABILITY_ID;
  if (capabilityId && capabilityId !== DOCUMENT_CONVERTER) {
    return { state: "blocked", detail: "登记的能力与文档转换样本不匹配" };
  }
  const eligible = await canDiscoverDocumentConverter(config, call);
  if (!capabilityId) return { state: "waiting", detail: "目录已读取，等待登记文档转换验收能力" };

  return eligible
    ? { state: "verified", detail: "当前主体可发现已登记的只读文档转换连接器" }
    : { state: "blocked", detail: "当前目录未返回已登记的只读文档转换操作" };
}

export async function runRunosSample(call: CallToolOptions): Promise<ProbeReceipt> {
  const config = getRunosClientConfig();
  if (!config) return { ok: false, detail: "Runos 尚未配置" };
  if (process.env.PLATFORM_DEMO_RUNOS_CAPABILITY_ID !== DOCUMENT_CONVERTER) {
    return { ok: false, detail: "尚未登记文档转换验收能力" };
  }
  const result = await convertHtmlToMarkdown(config, HTML, call,
    (markdown) => markdown.includes(`# ${HEADING}`) && markdown.includes("Weekly progress report."),
  );
  const receipt = result.callId;
  if (result.status !== "converted") return { ok: false, detail: "Runos 未确认只读文档转换结果", receipt };
  if (!result.outcomeAcknowledged) {
    return { ok: false, detail: "Runos 未确认结果回报", receipt };
  }
  return {
    ok: true, detail: "Runos 已转换样本文档并确认结果回报", receipt,
    evidence: { provider: "runos", taskId: call.taskId, capabilityId: DOCUMENT_CONVERTER, outcomeAcknowledged: true },
  };
}
