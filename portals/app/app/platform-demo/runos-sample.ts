/**
 * Live, read-only document conversion used by the platform acceptance page.
 * @package @vxtpl/app
 * @layer Application
 * @category Verification
 * @author AI-Generated
 * @date 2026-11-26
 */

import {
  getRunosClientConfig, runosDiscover, runosInvoke, runosReportOutcome, runosResolve,
  type CallToolOptions,
} from "../runos/client";
import type { Check, ProbeReceipt } from "./types";

const CAPABILITY_ID = "markitdown.document-to-markdown";
const OPERATION = "convert_to_markdown";
const HEADING = "Vxture acceptance sample";
const HTML = `<!doctype html><html><body><h1>${HEADING}</h1><p>Weekly progress report.</p></body></html>`;

function isReadOperation(operation: string, riskLevel: string | undefined): boolean {
  return operation === OPERATION && riskLevel === "read";
}

export async function checkRunosSample(call: CallToolOptions): Promise<Check> {
  const config = getRunosClientConfig();
  if (!config) return { state: "waiting", detail: "等待配置 RUNOS_API_URL" };

  const capabilityId = process.env.PLATFORM_DEMO_RUNOS_CAPABILITY_ID;
  if (capabilityId && capabilityId !== CAPABILITY_ID) {
    return { state: "blocked", detail: "登记的能力与文档转换样本不匹配" };
  }
  const result = await runosDiscover(config, CAPABILITY_ID, { ...call, category: "documents", limit: 10 });
  if (!result.ok || !Array.isArray(result.data?.capabilities)) {
    return { state: "unavailable", detail: "Runos 能力目录未返回有效响应" };
  }
  if (!capabilityId) return { state: "waiting", detail: "目录已读取，等待登记文档转换验收能力" };

  const eligible = result.data.capabilities.some((entry) =>
    entry.capability_id === CAPABILITY_ID && entry.primitive_type === "connector"
    && entry.operations?.some((op) => isReadOperation(op.operation, op.risk_level)),
  );
  return eligible
    ? { state: "verified", detail: "当前主体可发现已登记的只读文档转换连接器" }
    : { state: "blocked", detail: "当前目录未返回已登记的只读文档转换操作" };
}

export async function runRunosSample(call: CallToolOptions): Promise<ProbeReceipt> {
  const config = getRunosClientConfig();
  if (!config) return { ok: false, detail: "Runos 尚未配置" };
  const discovery = await checkRunosSample(call);
  if (discovery.state !== "verified") return { ok: false, detail: discovery.detail };

  const resolved = await runosResolve(config, CAPABILITY_ID, call);
  if (!resolved.ok) return { ok: false, detail: "Runos 未能解析已登记的文档转换连接器" };
  const contract = resolved.data;
  const operation = contract?.contract?.operations?.find((op) => isReadOperation(op.operation, op.riskLevel));
  if (contract?.capability_id !== CAPABILITY_ID || contract.primitive_type !== "connector"
    || !contract.version || !operation) {
    return { ok: false, detail: "Runos 解析结果缺少约定的只读文档转换操作" };
  }

  const args = { uri: `data:text/html;base64,${Buffer.from(HTML).toString("base64")}` };
  const result = await runosInvoke(config, CAPABILITY_ID, operation.operation, args, {
    ...call, version: contract.version,
  });
  const receipt = result.ok ? result.callId : result.failure.call_id;
  const heading = `# ${HEADING}`;
  const markdown = result.ok && [result.text, result.data?.markdown].some(
    (value) => typeof value === "string" && value.includes(heading) && value.includes("Weekly progress report."),
  );
  const success = Boolean(receipt && markdown);
  const acknowledgement = await runosReportOutcome(config, success ? "success" : "failure", {
    ...call, capabilitiesUsed: [CAPABILITY_ID],
  }).catch(() => undefined);
  if (!success) return { ok: false, detail: "Runos 未返回样本 Markdown 与调用回执", receipt };
  if (!acknowledgement?.ok || acknowledgement.data?.acknowledged !== true) {
    return { ok: false, detail: "Runos 未确认结果回报", receipt };
  }
  return {
    ok: true, detail: "Runos 已转换样本文档并确认结果回报", receipt,
    evidence: { provider: "runos", taskId: call.taskId, capabilityId: CAPABILITY_ID, outcomeAcknowledged: true },
  };
}
