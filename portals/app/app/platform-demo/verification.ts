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
import { hasProductAccess, type Entitlement } from "../entitlement/types";
import { getProvisioningStore } from "../provisioning/lib/store";
import { webhookSecrets } from "../provisioning/lib/verify";
import { makePlatformConsume } from "../usage/lib/flush";
import { invalidateWorkspaceEntitlement } from "../entitlement/platform-resolver";
import {
  AtlasError, fetchChatCompletion, getAtlasClientConfig,
  type AtlasChatTarget, type AtlasClientConfig,
} from "../chat/atlas-client";
import { chooseChatModel, readAtlasChatModels, readGrantedAtlasChatModels } from "../chat/catalog";
import type { MintOptions } from "../lib/s2s-token";
import { getRunosClientConfig } from "../runos/client";
import { checkRunosSample, runRunosSample } from "./runos-sample";
import {
  DAILY_PROBES, PROBES, type AtlasModelChoice, type Check, type DailyProbe, type PlatformReport,
  type Probe, type ProbeCommand, type ProbeReceipt,
} from "./types";

const verified = (detail: string): Check => ({ state: "verified", detail });
const waiting = (detail: string): Check => ({ state: "waiting", detail });
const unavailable = (detail = "当前无法完成核验"): Check => ({ state: "unavailable", detail });
const workspaceRequired = () => waiting("登录后选择工作空间");
const DAILY_ATTEMPT_USED = "该操作在本 UTC 日已发起";
const DAILY_TTL_SECONDS = 86_400;

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
  const atlas = !getAtlasClientConfig() ? waiting("等待配置 ATLAS_API_URL") : operator ? ready : designated;
  return {
    "c3-replay": !process.env.PLATFORM_API_URL ? waiting("等待平台内网接口配置") : operator ? ready : designated,
    "atlas-inference": atlas,
    "atlas-model-inference": atlas,
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

async function readEntitlements(authority: ProductAuthority, session: SignedWorkspace): Promise<Entitlement> {
  const data = await authority.entitlements();
  return parseEntitlementEnvelope(session.workspaceId, BRAND.productCode, data);
}

async function checkProvisioning(session: SignedWorkspace): Promise<Check> {
  if (!prismaEnabled() || !webhookSecrets().length) return waiting("等待开通接收端与持久存储");
  const status = await getProvisioningStore().instanceStatus(session.workspaceId, BRAND.productCode);
  if (status === "provisioned") return verified("当前工作空间的开通状态已落库");
  if (status === "deprovisioned") return verified("当前工作空间的停用状态已落库");
  return waiting("等待当前工作空间的开通投递");
}

async function checkAtlas(session: SignedWorkspace, entitlement: Entitlement | null): Promise<Check> {
  const cfg = getAtlasClientConfig();
  if (!cfg) return waiting("等待配置 ATLAS_API_URL");
  if (!entitlement) return unavailable("无法核验当前工作空间的产品权益");
  const models = await readAtlasChatModels(cfg, { subjectToken: session.accessToken }, entitlement);
  const endpointCode = chooseChatModel(models);
  return endpointCode
    ? verified(`${endpointCode} 可用`)
    : { state: "blocked", detail: "当前工作空间没有可用的 Atlas 对话路由" };
}

async function checkAtlasModels(
  session: SignedWorkspace,
  entitlement: Entitlement | null,
  prerequisite: Check,
): Promise<{ check: Check; choices: AtlasModelChoice[] }> {
  const cfg = getAtlasClientConfig();
  if (prerequisite.state !== "verified" || !cfg) return { check: prerequisite, choices: [] };
  if (!entitlement) return { check: unavailable("无法核验当前工作空间的产品权益"), choices: [] };
  if (!hasProductAccess(entitlement)) {
    return { check: { state: "blocked", detail: "当前工作空间没有产品套餐权益" }, choices: [] };
  }
  const choices = await readGrantedAtlasChatModels(cfg, { subjectToken: session.accessToken }, entitlement);
  if (!choices) return { check: unavailable("Atlas 目录尚未提供模型类型"), choices: [] };
  const check = choices.length
    ? verified(`当前调用方有 ${choices.length} 个已授权的对话模型`)
    : { state: "blocked" as const, detail: "当前调用方没有已授权的对话模型" };
  return { check, choices };
}

// Daily attempts and scoped receipts

function utcDay(): string {
  return new Date().toISOString().slice(0, 10).replaceAll("-", "");
}

function dailyProbeKeys(session: SignedWorkspace, probe: DailyProbe, day: string) {
  const attempt = `vx:acceptance:${deployStage()}:${BRAND.productCode}:${session.workspaceId}:${probe}:${day}`;
  return { attempt, receipt: `${attempt}:receipt:${session.scopeKey}` };
}

function parseReceipt(raw: string | null): ProbeReceipt | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as ProbeReceipt | null;
    return value?.ok === true && typeof value.detail === "string" && typeof value.receipt === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

async function applyDailyProbeState(
  session: SignedWorkspace,
  actions: PlatformReport["actions"],
  details: PlatformReport["actionDetails"],
): Promise<PlatformReport["receipts"]> {
  const day = utcDay();
  const keys = DAILY_PROBES.map((probe) => dailyProbeKeys(session, probe, day));
  const receipts: PlatformReport["receipts"] = {};
  try {
    const values = await rpRedis().mget(...keys.flatMap(({ attempt, receipt }) => [attempt, receipt]));
    DAILY_PROBES.forEach((probe, index) => {
      const receipt = parseReceipt(values[2 * index + 1]);
      if (receipt) receipts[probe] = receipt;
      if (values[2 * index] !== null || receipt) {
        actions[probe] = false;
        details[probe] = receipt ? "已恢复本 UTC 日的验收回执" : DAILY_ATTEMPT_USED;
      }
    });
  } catch {
    for (const probe of DAILY_PROBES) {
      if (!actions[probe]) continue;
      actions[probe] = false;
      details[probe] = "暂时无法读取验收日限";
    }
  }
  return receipts;
}

// Platform report

export async function readPlatformReport(session: SignedWorkspace | null): Promise<PlatformReport> {
  const missing = workspaceRequired();
  const issuerRequest = checkIssuer().catch(() => unavailable("Accounts 发现或公钥读取失败"));
  const prerequisites = probePrerequisites(session);
  let atlasModelChoices: AtlasModelChoice[] = [];
  const checks: PlatformReport["checks"] = {
    issuer: missing, session: missing, exchange: missing, access: missing, roster: missing,
    entitlements: missing, provisioning: missing,
    atlas: getAtlasClientConfig() ? missing : waiting("等待配置 ATLAS_API_URL"),
    atlasModels: prerequisites["atlas-model-inference"],
    runos: getRunosClientConfig() ? missing : waiting("等待配置 RUNOS_API_URL"),
  };
  if (session) {
    checks.session = session.user.activeOrg ? verified("已校验当前 Accounts 会话和组织／工作空间") : unavailable("会话缺少活动组织");
    const baseUrl = process.env.PLATFORM_API_URL;
    const authority = baseUrl ? await productAuthority(baseUrl, session).catch(() => null) : null;
    checks.exchange = authority ? verified("OBO 票绑定当前主体、组织、工作空间和产品")
      : baseUrl ? unavailable("当前会话未取得范围匹配的 OBO 票") : waiting("等待平台内网接口配置");
    checks.access = checks.exchange;
    checks.roster = waiting("等待当前主体准入");
    if (getAtlasClientConfig()) checks.atlas = checks.roster;
    if (checks.atlasModels.state === "verified") checks.atlasModels = checks.roster;
    if (getRunosClientConfig()) checks.runos = checks.roster;
    const allowedRequest = authority ? authority.allowed().catch(() => null) : Promise.resolve(null);
    const [allowed, entitlement, provisioning] = await Promise.all([
      allowedRequest,
      authority ? readEntitlements(authority, session).catch(() => null) : null,
      checkProvisioning(session).catch(() => unavailable()),
    ]);
    checks.entitlements = entitlement
      ? verified(`订阅状态 ${entitlement.status ?? "无订阅"}，档位 ${entitlement.tier ?? "未分配"}`)
      : authority ? unavailable("工作空间权益读取失败") : checks.exchange;
    checks.provisioning = provisioning;
    if (authority && allowed === null) checks.access = unavailable("平台准入决定暂不可用");
    if (allowed === false) checks.access = { state: "blocked", detail: "当前主体没有该产品使用权" };
    if (authority && allowed === true) {
      checks.access = verified("平台实时准入通过");
      const [roster, atlas, runos, modelCatalog] = await Promise.all([
        authority.rosterSummary()
          .then(({ count, hasMore }) => verified(`首屏 ${count} 位已授权成员${hasMore ? "，还有后续分页" : ""}`))
          .catch(() => unavailable("授权名单读取失败")),
        checkAtlas(session, entitlement).catch(() => unavailable("Atlas 授权路由读取失败")),
        checkRunosSample({ identity: { subjectToken: session.accessToken }, taskId: randomUUID() })
          .catch(() => unavailable("Runos 能力目录读取失败")),
        checkAtlasModels(session, entitlement, prerequisites["atlas-model-inference"])
          .catch(() => ({ check: unavailable("Atlas 模型目录读取失败"), choices: [] })),
      ]);
      checks.roster = roster;
      checks.atlas = atlas;
      checks.runos = runos;
      checks.atlasModels = modelCatalog.check;
      atlasModelChoices = modelCatalog.choices;
    }
  }
  const probeChecks = {
    "c3-replay": checks.access, "atlas-inference": checks.atlas,
    "atlas-model-inference": checks.atlasModels, "runos-invoke": checks.runos,
  };
  const actions: PlatformReport["actions"] = {
    "c3-replay": false, "atlas-inference": false, "atlas-model-inference": false, "runos-invoke": false,
  };
  const actionDetails: PlatformReport["actionDetails"] = {
    "c3-replay": "", "atlas-inference": "", "atlas-model-inference": "", "runos-invoke": "",
  };
  for (const probe of PROBES) {
    const required = prerequisites[probe];
    const check = checks.access.state === "verified" ? probeChecks[probe] : checks.access;
    actions[probe] = required.state === "verified" && check.state === "verified";
    actionDetails[probe] = required.state !== "verified" || actions[probe] ? required.detail : check.detail;
  }
  const receipts = session && designatedOperator(session) && checks.access.state === "verified"
    ? await applyDailyProbeState(session, actions, actionDetails)
    : {};
  checks.issuer = await issuerRequest;
  return {
    stage: deployStage(), checkedAt: new Date().toISOString(),
    scopeKey: session?.scopeKey ?? null, actions, actionDetails, atlasModelChoices, receipts, checks,
  };
}

// Explicit metered probes

export async function runPlatformProbe(session: SignedWorkspace, command: ProbeCommand): Promise<{ status: number; result: ProbeReceipt }> {
  const { probe } = command;
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
    const day = utcDay();
    if (probe === "c3-replay") return await checkUsageReplay(session, day, baseUrl);
    const identity = { subjectToken: session.accessToken };
    const taskId = `${BRAND.productCode}-acceptance-${randomUUID()}`;
    let invoke = () => runRunosSample({ identity, taskId, delegate: true });
    if (probe !== "runos-invoke") {
      const atlas = getAtlasClientConfig();
      if (!atlas) return { status: 503, result: { ok: false, detail: "Atlas 尚未配置" } };
      const entitlement = await readEntitlements(authority, session);
      if (!hasProductAccess(entitlement)) {
        return { status: 403, result: { ok: false, detail: "当前工作空间没有产品套餐权益" } };
      }
      let target: AtlasChatTarget;
      if (command.probe === "atlas-model-inference") {
        const choices = await readGrantedAtlasChatModels(atlas, identity, entitlement);
        if (!choices) {
          return { status: 503, result: { ok: false, detail: "Atlas 目录尚未提供模型类型" } };
        }
        if (!choices.some(({ code }) => code === command.modelCode)) {
          return { status: 409, result: {
            ok: false, code: "ATLAS_MODEL_UNAVAILABLE", detail: "所选模型已不可用，请重新核验以刷新模型目录",
          } };
        }
        target = { modelCode: command.modelCode };
      } else {
        const endpointCode = chooseChatModel(await readAtlasChatModels(atlas, identity, entitlement));
        if (!endpointCode) {
          return { status: 403, result: { ok: false, detail: "当前工作空间没有可用的 Atlas 对话路由" } };
        }
        target = { endpointCode };
      }
      invoke = () => runAtlasSample(atlas, identity, target, taskId);
    }
    const keys = dailyProbeKeys(session, probe, day);
    const redis = rpRedis();
    if (!await redis.set(keys.attempt, taskId, "EX", DAILY_TTL_SECONDS, "NX")) {
      return { status: 409, result: { ok: false, detail: DAILY_ATTEMPT_USED } };
    }
    const result = await invoke();
    if (result.ok) {
      try {
        await redis.set(keys.receipt, JSON.stringify(result), "EX", DAILY_TTL_SECONDS);
      } catch (error) {
        console.error("[platform-check] unable to store acceptance receipt", { taskId, probe, error });
        result.detail = `${result.detail}，当前回执暂时无法从新会话恢复`;
      }
    }
    return { status: result.ok ? 200 : 502, result };
  } catch (error) {
    if (error instanceof AtlasError && error.envelope.code === "NOT_ENTITLED") {
      return { status: 403, result: { ok: false, detail: "Atlas 拒绝了本次调用，当前授权未覆盖所选模型或路由" } };
    }
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

async function runAtlasSample(
  config: AtlasClientConfig, identity: MintOptions, target: AtlasChatTarget, taskId: string,
): Promise<ProbeReceipt> {
  const history = [{ role: "user" as const, content: "Summarize this sample: The workspace publishes a weekly progress report." }];
  const sample = await fetchChatCompletion(config, identity, history, { taskId, ...target });
  if (!sample.modelCode || !sample.requestId) {
    return { ok: false, detail: "Atlas 未返回完整推理结果" };
  }
  return {
    ok: true, detail: "Atlas 已返回模型推理结果", receipt: sample.requestId,
    responseText: sample.message.content.slice(0, 500),
    evidence: {
      provider: "atlas", taskId, modelCode: sample.modelCode,
      ...(target.modelCode === undefined ? { endpointCode: target.endpointCode } : { requestedModelCode: target.modelCode }),
    },
  };
}
