/**
 * Product adapter for converting inline HTML through the entitled Runos connector.
 * @package @vxtpl/app
 * @layer Application
 * @category Capability
 * @author AI-Generated
 * @date 2026-11-26
 */

import {
  runosDiscover, runosInvoke, runosReportOutcome, runosResolve,
  type CallToolOptions, type RunosClientConfig,
} from "./client";

export const DOCUMENT_CONVERTER = "markitdown.document-to-markdown";
const CONVERT_OPERATION = "convert_to_markdown";

type Conversion =
  | { status: "converted"; markdown: string; callId: string; outcomeAcknowledged: boolean }
  | { status: "unavailable" | "failed"; callId?: string };

export async function canDiscoverDocumentConverter(config: RunosClientConfig, call: CallToolOptions): Promise<boolean> {
  const result = await runosDiscover(config, DOCUMENT_CONVERTER, { ...call, category: "documents", limit: 10 });
  if (!result.ok || !Array.isArray(result.data?.capabilities)) throw new Error("Runos discovery unavailable");
  return result.data.capabilities.some((entry) =>
    entry.capability_id === DOCUMENT_CONVERTER && entry.primitive_type === "connector"
    && entry.operations?.some((op) => op.operation === CONVERT_OPERATION && op.risk_level === "read"),
  );
}

export async function convertHtmlToMarkdown(
  config: RunosClientConfig,
  html: string,
  call: CallToolOptions,
  acceptMarkdown?: (markdown: string) => boolean,
): Promise<Conversion> {
  if (!await canDiscoverDocumentConverter(config, call)) return { status: "unavailable" };
  const resolved = await runosResolve(config, DOCUMENT_CONVERTER, call);
  if (!resolved.ok) return { status: "unavailable" };
  const contract = resolved.data;
  if (contract?.capability_id !== DOCUMENT_CONVERTER || contract.primitive_type !== "connector"
    || !contract.version || !contract.contract?.operations?.some(
      (op) => op.operation === CONVERT_OPERATION && op.riskLevel === "read",
    )) return { status: "unavailable" };

  const args = { uri: `data:text/html;base64,${Buffer.from(html).toString("base64")}` };
  const result = await runosInvoke(config, DOCUMENT_CONVERTER, CONVERT_OPERATION, args, {
    ...call, version: contract.version,
  });
  const callId = result.ok ? result.callId : result.failure.call_id;
  const value = result.ok ? result.data?.markdown ?? result.text : undefined;
  const markdown = typeof value === "string" && value.trim() && (!acceptMarkdown || acceptMarkdown(value)) ? value : null;
  const acknowledgement = await runosReportOutcome(config, callId && markdown ? "success" : "failure", {
    ...call, capabilitiesUsed: [DOCUMENT_CONVERTER],
  }).catch(() => undefined);
  if (!callId || !markdown) return { status: "failed", callId };
  return {
    status: "converted", markdown, callId,
    outcomeAcknowledged: acknowledgement?.ok === true && acknowledgement.data?.acknowledged === true,
  };
}
