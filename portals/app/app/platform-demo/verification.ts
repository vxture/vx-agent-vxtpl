/**
 * Platform acceptance checks using the current product and workspace.
 * @package @vxtpl/app
 * @layer Application
 * @category Verification
 * @author AI-Generated
 * @date 2026-11-26
 */

import { randomUUID } from "node:crypto";
import { BRAND } from "@vxtpl/shared/brand";
import { getOidcConfig } from "../auth/lib/config";
import { rpRedis } from "../auth/lib/session-store";
import { deployStage } from "../lib/deploy-stage";
import { prismaEnabled } from "../lib/db";
import { parseEntitlementEnvelope } from "../entitlement/platform-client";
import { productAuthority, type ProductAuthority, type SignedWorkspace } from "../entitlement/product-authority";
import { getProvisioningStore } from "../provisioning/lib/store";
import { webhookSecrets } from "../provisioning/lib/verify";
import { makePlatformConsume } from "../usage/lib/flush";
import { invalidateWorkspaceEntitlement } from "../entitlement/platform-resolver";
import { fetchChatCompletion, getAtlasClientConfig, listGrantedEndpoints, DEFAULT_ENDPOINT_CODE } from "../chat/atlas-client";
import { getRunosClientConfig } from "../runos/client";
import { checkRunosSample, runRunosSample } from "./runos-sample";
import type { Check, PlatformReport, Probe, ProbeReceipt } from "./types";

const verified = (detail: string): Check => ({ state: "verified", detail });
const waiting = (detail: string): Check => ({ state: "waiting", detail });
const unavailable = (detail = "当前无法完成核验"): Check => ({ state: "unavailable", detail });
const workspaceRequired = () => waiting("登录后选择工作空间");

function designatedOperator(session: SignedWorkspace): boolean {
  return session.workspaceId === process.env.PLATFORM_DEMO_WORKSPACE_ID
    && session.sub === process.env.PLATFORM_DEMO_SUBJECT;
}

function probePrerequisites(session: SignedWorkspace | null): Record<Probe, Check> {
  const operator = session && designatedOperator(session);
  const designated = waiting(session
    ? "此操作需要已登记的验收账号和工作空间"
    : "请使用登记的验收账号登录");
  const ready = verified("可执行一次真实调用");
  return {
    "c3-replay": !process.env.PLATFORM_API_URL ? waiting("等待平台内网接口配置") : operator ? ready : designated,
    "atlas-inference": !getAtlasClientConfig() ? waiting("等待配置 ATLAS_API_URL") : operator ? ready : designated,
    "runos-invoke": !getRunosClientConfig() ? waiting("等待配置 RUNOS_API_URL")
      : !process.env.PLATFORM_DEMO_RUNOS_CAPABILITY_ID ? waiting("等待登记 Runos 只读验收能力")
      : operator ? ready : designated,
  };
}

// Read-only evidence

async function checkIssuer(): Promise<Check> {
  const cfg = getOidcConfig();
  if (!cfg.enabled) return waiting("当前预览尚未连接 Accounts");
  const request = { cache: "no-store", signal: AbortSignal.timeout(8000) } as const;
  const [discovery, jwks] = await Promise.all([
    fetch(`${cfg.issuer}/.well-known/openid-configuration`, request),
    fetch(cfg.jwksUrl, request),
  ]);
  if (!discovery.ok || !jwks.ok) return unavailable();
  const doc = await discovery.json();
  const keys = await jwks.json();
  return doc?.issuer === cfg.issuer && doc?.jwks_uri === cfg.jwksUrl &&
    Array.isArray(keys?.keys) && keys.keys.some((key: { kty?: string }) => key?.kty === "RSA")
    ? verified("Accounts Discovery 与签名公钥匹配")
    : unavailable("Accounts 签发配置未通过核对");
}

async function checkEntitlements(authority: ProductAuthority, session: SignedWorkspace): Promise<Check> {
  const data = await authority.entitlements();
  if (!(data.status === null || typeof data.status === "string")) return unavailable("权益响应缺少有效的订阅状态");
  const entitlement = parseEntitlementEnvelope(session.workspaceId, BRAND.productCode, data);
  return verified("订阅状态 " + (entitlement.status ?? "无订阅") + "，档位 " + (entitlement.tier ?? "未分配"));
}

async function checkProvisioning(session: SignedWorkspace): Promise<Check> {
  if (!prismaEnabled() || !webhookSecrets().length) return waiting("等待开通接收端与持久存储");
  const status = await getProvisioningStore().instanceStatus(session.workspaceId, BRAND.productCode);
  if (status === "provisioned") return verified("当前工作空间的开通状态已落库");
  if (status === "deprovisioned") return verified("当前工作空间的停用状态已落库");
  return waiting("等待当前工作空间的开通投递");
}

async function checkAtlas(session: SignedWorkspace): Promise<Check> {
  const cfg = getAtlasClientConfig();
  if (!cfg) return waiting("等待配置 ATLAS_API_URL");
  const rows = await listGrantedEndpoints(cfg, { subjectToken: session.accessToken });
  return rows.some((entry) => entry.endpointCode === DEFAULT_ENDPOINT_CODE && entry.state === "active")
    ? verified(`${DEFAULT_ENDPOINT_CODE} 已授权`)
    : { state: "blocked", detail: "当前产品未授权演示模型端点" };
}

export async function readPlatformReport(session: SignedWorkspace | null): Promise<PlatformReport> {
  const missing = workspaceRequired();
  const issuerRequest = checkIssuer().catch(() => unavailable("Accounts 发现或公钥读取失败"));
  const checks: PlatformReport["checks"] = {
    issuer: missing, session: missing, exchange: missing, access: missing, roster: missing,
    entitlements: missing, provisioning: missing,
    atlas: getAtlasClientConfig() ? missing : waiting("等待配置 ATLAS_API_URL"),
    runos: getRunosClientConfig() ? missing : waiting("等待配置 RUNOS_API_URL"),
  };
  const prerequisites = probePrerequisites(session);
  if (session) {
    checks.session = session.user.activeOrg ? verified("已校验当前 Accounts 会话和组织／工作空间") : unavailable("会话缺少活动组织");
    const baseUrl = process.env.PLATFORM_API_URL;
    const authority = baseUrl ? await productAuthority(baseUrl, session).catch(() => null) : null;
    checks.exchange = authority ? verified("OBO 票绑定当前主体、组织、工作空间和产品")
      : baseUrl ? unavailable("当前会话未取得范围匹配的 OBO 票") : waiting("等待平台内网接口配置");
    checks.access = checks.exchange;
    checks.roster = waiting("等待当前主体准入");
    if (getAtlasClientConfig()) checks.atlas = checks.roster;
    if (getRunosClientConfig()) checks.runos = checks.roster;
    const allowedRequest = authority ? authority.allowed().catch(() => null) : Promise.resolve(null);
    const [allowed, entitlements, provisioning] = await Promise.all([
      allowedRequest,
      authority ? checkEntitlements(authority, session).catch(() => unavailable()) : Promise.resolve(checks.exchange),
      checkProvisioning(session).catch(() => unavailable()),
    ]);
    checks.entitlements = entitlements;
    checks.provisioning = provisioning;
    if (authority && allowed === null) checks.access = unavailable("平台准入决定暂不可用");
    if (allowed === false) checks.access = { state: "blocked", detail: "当前主体没有该产品使用权" };
    if (authority && allowed === true) {
      checks.access = verified("平台实时准入通过");
      [checks.roster, checks.atlas, checks.runos] = await Promise.all([
        authority.rosterSummary()
          .then(({ count, hasMore }) => verified(`首屏 ${count} 位已授权成员${hasMore ? "，还有后续分页" : ""}`))
          .catch(() => unavailable("授权名单读取失败")),
        checkAtlas(session).catch(() => unavailable("Atlas 授权端点读取失败")),
        checkRunosSample({ identity: { subjectToken: session.accessToken }, taskId: randomUUID() })
          .catch(() => unavailable("Runos 能力目录读取失败")),
      ]);
    }
  }
  const probeChecks = { "c3-replay": checks.access, "atlas-inference": checks.atlas, "runos-invoke": checks.runos };
  const actions = { "c3-replay": false, "atlas-inference": false, "runos-invoke": false };
  const actionDetails = { "c3-replay": "", "atlas-inference": "", "runos-invoke": "" };
  for (const probe of ["c3-replay", "atlas-inference", "runos-invoke"] as const) {
    const required = prerequisites[probe];
    const check = checks.access.state === "verified" ? probeChecks[probe] : checks.access;
    actions[probe] = required.state === "verified" && check.state === "verified";
    actionDetails[probe] = required.state !== "verified" || actions[probe] ? required.detail : check.detail;
  }
  checks.issuer = await issuerRequest;
  return {
    stage: deployStage(), checkedAt: new Date().toISOString(),
    scopeKey: session?.scopeKey ?? null, actions, actionDetails, checks,
  };
}

// Explicit metered probes

export async function runPlatformProbe(session: SignedWorkspace, probe: Probe): Promise<{ status: number; result: ProbeReceipt }> {
  if (!designatedOperator(session)) {
    return { status: 403, result: { ok: false, detail: "此操作需要已登记的验收账号和工作空间" } };
  }
  const prerequisite = probePrerequisites(session)[probe];
  if (prerequisite.state !== "verified") {
    return { status: 503, result: { ok: false, detail: prerequisite.detail } };
  }
  const baseUrl = process.env.PLATFORM_API_URL;
  try {
    if (!baseUrl) return { status: 503, result: { ok: false, detail: "平台准入接口尚未配置" } };
    const authority = await productAuthority(baseUrl, session);
    if (!await authority.allowed()) {
      return { status: 403, result: { ok: false, detail: "平台准入未通过" } };
    }
    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    if (probe === "c3-replay") return await checkUsageReplay(session, day, baseUrl);
    const taskId = `${BRAND.productCode}-acceptance-${randomUUID()}`;
    const key = `vx:acceptance:${deployStage()}:${BRAND.productCode}:${session.workspaceId}:${probe}:${day}`;
    if (!await rpRedis().set(key, taskId, "EX", 86_400, "NX")) {
      return { status: 409, result: { ok: false, detail: "该操作在本 UTC 日已发起" } };
    }
    const result = await runMeteredSample(session, probe, taskId);
    return { status: result.ok ? 200 : 502, result };
  } catch {
    return { status: 503, result: { ok: false, detail: "本次核验未收到可确认的结果" } };
  }
}

async function checkUsageReplay(session: SignedWorkspace, day: string, baseUrl: string) {
  const row = {
    workspaceId: session.workspaceId,
    metric: `${BRAND.productCode}.chat.messages`,
    amount: 1,
    idempotencyKey: `probe-replay-${session.workspaceId}-${day}`,
    endUserId: session.sub,
    flushed: false,
  };
  const consume = makePlatformConsume(baseUrl);
  const first = await consume(row);
  const receipt = first.body?.event_id;
  if (first.status !== 200 || typeof receipt !== "string" || !receipt) {
    return { status: 502, result: { ok: false, detail: "首次计量未返回入账回执" } };
  }
  await invalidateWorkspaceEntitlement(row.workspaceId);
  const replay = await consume(row);
  const ok = replay.status === 200 && replay.body?.replayed === true && replay.body.event_id === receipt;
  return { status: ok ? 200 : 502, result: {
    ok, detail: ok ? (first.body?.gated ? "计量已记录，额度未覆盖。回放返回原事件" : "同一计量键回放返回原事件") : "缺少匹配的计量回放回执", receipt,
  } };
}

async function runMeteredSample(session: SignedWorkspace, probe: Exclude<Probe, "c3-replay">, taskId: string): Promise<ProbeReceipt> {
  const identity = { subjectToken: session.accessToken };
  const history = [{ role: "user" as const, content: "Summarize this sample: The workspace publishes a weekly progress report." }];
  if (probe === "atlas-inference") {
    const cfg = getAtlasClientConfig();
    if (!cfg) return { ok: false, detail: "Atlas 尚未配置" };
    const sample = await fetchChatCompletion(cfg, identity, history, { taskId, endpointCode: DEFAULT_ENDPOINT_CODE });
    if (!sample.message?.content?.trim() || !sample.modelCode || !sample.requestId) {
      return { ok: false, detail: "Atlas 未返回完整推理结果" };
    }
    return {
      ok: true, detail: "Atlas 已返回模型推理结果", receipt: sample.requestId,
      evidence: { provider: "atlas", taskId, endpointCode: DEFAULT_ENDPOINT_CODE, modelCode: sample.modelCode },
    };
  }
  return runRunosSample({ identity, taskId, delegate: true });
}
