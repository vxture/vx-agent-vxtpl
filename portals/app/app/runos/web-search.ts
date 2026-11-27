/**
 * Searches public sources through the entitled Runos connector.
 * @package @vxtpl/app
 * @layer Application
 * @category Capability
 * @author AI-Generated
 * @date 2026-11-27
 */

import type { SkillOutcome } from "../chat/types";
import { WEB_SEARCH_SKILL } from "../chat/types";
import { runosDiscover, runosInvoke, runosReportOutcome, runosResolve, type CallToolOptions, type RunosClientConfig } from "./client";

const CONNECTOR = "exa.web-research";
const OPERATION = "web_search_exa";
const OBJECTIVE = "Find public sources that directly answer the query. Prefer official or primary sources and include their URLs.";

export async function searchPublicWeb(
  config: RunosClientConfig,
  query: string,
  call: CallToolOptions,
): Promise<SkillOutcome> {
  const base = { code: WEB_SEARCH_SKILL, status: "unavailable", capabilityId: null, detail: "" } satisfies SkillOutcome;
  const catalog = await runosDiscover(config, CONNECTOR, { ...call, limit: 10 });
  if (!catalog.ok) return { ...base, errorCode: catalog.failure.code };
  const granted = catalog.data?.capabilities?.some((entry) =>
    entry.capability_id === CONNECTOR && entry.primitive_type === "connector" &&
    entry.operations?.some((op) => op.operation === OPERATION && op.risk_level === "read"),
  );
  if (!granted) return base;

  const selected = { ...base, capabilityId: CONNECTOR, operation: OPERATION };
  const resolved = await runosResolve(config, CONNECTOR, call);
  if (!resolved.ok) return { ...selected, errorCode: resolved.failure.code };
  const contract = resolved.data;
  if (contract?.capability_id !== CONNECTOR || contract.primitive_type !== "connector" ||
    !contract.version || !contract.contract?.operations?.some(
      (op) => op.operation === OPERATION && op.riskLevel === "read",
    )) return selected;

  const result = await runosInvoke(config, CONNECTOR, OPERATION, { query, objective: OBJECTIVE }, {
    ...call, version: contract.version,
  });
  const callId = result.ok ? result.callId : result.failure.call_id;
  const detail = result.ok && result.meta?.result_kind !== "distributed" ? (result.text ?? "").slice(0, 12_000).trim() : "";
  const sources = sourceUrls(detail);
  const completed = Boolean(callId && sources.length);
  const report = await runosReportOutcome(config, completed ? "success" : "failure", {
    ...call, capabilitiesUsed: [CONNECTOR],
  }).catch(() => undefined);
  const receipt = {
    ...selected, callId, version: result.ok ? result.meta?.version_resolved ?? contract.version : contract.version,
    outcomeAcknowledged: report?.ok === true && report.data?.acknowledged === true,
  };
  if (!completed) return { ...receipt, status: "failed", errorCode: result.ok ? "WEB_SEARCH_NO_EVIDENCE" : result.failure.code };
  return { ...receipt, status: "ran", detail, sources, resultKind: "executed", contentDigest: result.ok ? result.meta?.content_digest : undefined };
}

function sourceUrls(text: string): string[] {
  const sources = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"\]\[()]+/g)) {
    try {
      const url = new URL(match[0].replace(/[.,;:!?]+$/, ""));
      if (!url.username && !url.password) sources.add(url.href);
      if (sources.size >= 10) break;
    } catch {
      continue;
    }
  }
  return [...sources];
}
