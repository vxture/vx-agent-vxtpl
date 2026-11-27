import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readWorkspaceSession } from "../../auth/lib/workspace-session";
import { hasWorkspaceSeat } from "../../entitlement/workspace-authority";
import { readWorkspaceEntitlement } from "../../entitlement/resolver";
import { canUseFeature, minTierFor } from "../../entitlement/capability";
import { AtlasError, getAtlasClientConfig } from "../../chat/atlas-client";
import { ATLAS_GRANTED_FEATURE, chooseChatModel, findSkill, gatedMockModels, gatedSkills, readAtlasChatModels, readGrantedAtlasChatModels, type GatedOption } from "../../chat/catalog";
import { ChatConversionError, ChatInferenceError, getChatResolver, validateHistory, type ChatIdentity } from "../../chat/resolver";
import { recordUsage } from "../../usage/lib/buffer";
import { CHAT_SCOPE_HEADER, type ChatFailureEvidence, type ChatTarget } from "../../chat/types";
import { hasProductAccess, type Entitlement } from "../../entitlement/types";
import { isDeployedStage } from "../../lib/deploy-stage";
import { CHAT_TURNS_PER_MINUTE, allowChatTurn } from "../../chat/rate-limit";

// GET/POST /api/chat - the tier-gated chat turn.
//
// Both verbs resolve entitlement for the SIGNED-IN user's active workspace. That
// matters beyond tidiness: the workspace is what entitlement is scoped to, what
// the S2S token is minted against, and what Atlas attributes the call to. A
// fixed demo workspace would make all three fictional, and with real credentials
// configured it would let an anonymous visitor spend model tokens.
export const dynamic = "force-dynamic";

const USAGE_METRIC = "vxtpl.chat.messages";
const MODEL_NOT_GRANTED = "\u5f53\u524d\u6240\u9009\u6a21\u578b\u5df2\u4e0d\u53ef\u7528\uff0c\u5df2\u4fdd\u7559\u4f60\u7684\u6d88\u606f\u3002";
const MODEL_CATALOG_UNAVAILABLE = "\u6682\u65f6\u65e0\u6cd5\u8bfb\u53d6\u53ef\u7528\u6a21\u578b\u3002";

interface Caller {
  session: Extract<Awaited<ReturnType<typeof readWorkspaceSession>>, { status: "ready" | "development" }>;
  workspaceId: string;
  scopeKey: string;
  sub?: string;
  identity: ChatIdentity;
}

function accessError(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ code, error }, { status, headers: { "cache-control": "no-store" } });
}

function atlasChatError(failure: AtlasError, evidence: ChatFailureEvidence): NextResponse {
  const { code, requestId } = failure.envelope;
  const receipt: ChatFailureEvidence = { ...evidence, atlasRequestId: requestId, atlasErrorCode: code };
  const retryable = failure.retryable;
  const headers = new Headers({ "cache-control": "no-store" });
  if (code === "ENDPOINT_NOT_ROUTABLE" || code === "MODEL_NOT_ROUTABLE" || code === "NOT_ENTITLED") {
    return NextResponse.json({ code: "MODEL_NOT_GRANTED", error: MODEL_NOT_GRANTED, evidence: receipt }, { status: 403, headers });
  }
  if (code === "RATE_LIMITED") {
    const retryAfterMs = retryable ? failure.retryAfterMs : undefined;
    let error = retryable ? "The model is busy. Try again shortly." : "The model is currently rate limited.";
    if (retryAfterMs !== undefined) {
      const seconds = Math.ceil(retryAfterMs / 1000);
      headers.set("retry-after", String(seconds));
      error = `The model is busy. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
    }
    return NextResponse.json({ code, error, retryable, retryAfterMs, evidence: receipt }, { status: 429, headers });
  }
  const accountRefused = code === "UPSTREAM_ACCOUNT_REFUSED";
  const error = accountRefused ? "The model is temporarily unavailable." : failure.message;
  return NextResponse.json({ code, error, retryable, evidence: receipt }, { status: accountRefused ? 503 : 502, headers });
}

/* Keep transport failures distinct from a confirmed session decision. */
async function resolveCaller(): Promise<Caller | NextResponse> {
  const session = await readWorkspaceSession();
  if (session.status === "development") {
    return {
      session,
      workspaceId: session.workspaceId,
      scopeKey: session.scopeKey,
      identity: { workspaceId: session.workspaceId, mint: { workspaceId: session.workspaceId } },
    };
  }
  switch (session.status) {
    case "anonymous": return accessError(401, "SESSION_REQUIRED", "Sign in to access chat.");
    case "unavailable": return accessError(503, "SESSION_UNAVAILABLE", "The session could not be checked.");
    case "unconfigured": return accessError(503, "SESSION_UNCONFIGURED", "Sign-in is unavailable in this environment.");
    case "inactive-account": return accessError(403, "ACCOUNT_INACTIVE", "The account is unavailable.");
    case "no-workspace": return accessError(403, "WORKSPACE_REQUIRED", "Select a workspace before using chat.");
  }
  return {
    session,
    workspaceId: session.workspaceId,
    scopeKey: session.scopeKey,
    sub: session.sub,
    identity: {
      workspaceId: session.workspaceId,
      mint: { subjectToken: session.accessToken },
      sessionId: session.sessionId,
    },
  };
}

async function readModelChoices(caller: Caller, entitlement: Entitlement): Promise<GatedOption[]> {
  const config = getAtlasClientConfig();
  if (config) return readAtlasChatModels(config, caller.identity.mint, entitlement);
  if (isDeployedStage()) throw new Error("Atlas is not configured.");
  return gatedMockModels(entitlement);
}

export async function GET(): Promise<Response> {
  const caller = await resolveCaller();
  if (caller instanceof NextResponse) return caller;

  let entitlement: Entitlement;
  try {
    entitlement = await readWorkspaceEntitlement(caller.session);
    if (hasProductAccess(entitlement) && !await hasWorkspaceSeat(caller.session)) {
      return accessError(403, "PRODUCT_SEAT_REQUIRED", "Product access is not assigned.");
    }
  } catch {
    return accessError(503, "WORKSPACE_ACCESS_UNAVAILABLE", "Workspace access could not be checked.");
  }
  const productAccess = hasProductAccess(entitlement);
  const atlas = getAtlasClientConfig();
  const [routes, atlasDirectModels] = await Promise.all([
    productAccess ? readModelChoices(caller, entitlement).catch(() => null) : [],
    productAccess && atlas ? readGrantedAtlasChatModels(atlas, caller.identity.mint, entitlement).catch(() => null) : null,
  ]);
  if (routes === null && atlasDirectModels === null) {
    return accessError(503, "MODEL_CATALOG_UNAVAILABLE", MODEL_CATALOG_UNAVAILABLE);
  }
  return NextResponse.json({
    scopeKey: caller.scopeKey,
    tier: entitlement.tier,
    productAccess,
    models: routes ?? [],
    defaultModelCode: routes ? chooseChatModel(routes) ?? null : null,
    atlasSource: atlas ? "live" : "mock",
    atlasRouteCatalogAvailable: routes !== null,
    atlasDirectModels,
    atlasDirectRequiredTier: productAccess && !canUseFeature(entitlement, ATLAS_GRANTED_FEATURE)
      ? minTierFor(ATLAS_GRANTED_FEATURE) : null,
    skills: gatedSkills(entitlement),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  const caller = await resolveCaller();
  if (caller instanceof NextResponse) return caller;
  const expectedScope = req.headers.get(CHAT_SCOPE_HEADER);
  if (expectedScope !== null && expectedScope !== caller.scopeKey) {
    return accessError(409, "WORKSPACE_CHANGED", "Account or workspace changed.");
  }

  // Debug-surface throttle (owner decision 2026-09-01): chat verifies the
  // S2S chain, it is not a product feature - and every turn spends Atlas
  // tokens. Refused BEFORE any parsing so a rejected turn costs nothing.
  const rate = allowChatTurn(`${caller.workspaceId}:${caller.sub ?? "anon"}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `debug surface rate limit: ${CHAT_TURNS_PER_MINUTE} turns/minute - retry in ${rate.retryAfterSeconds}s` },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds ?? 60) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown> | null;
  let messages;
  try {
    messages = validateHistory(raw?.history);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid history" }, { status: 400 });
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "history must end with a user message" }, { status: 400 });
  }

  const legacyRouteCode = raw?.modelCode;
  if (legacyRouteCode !== undefined && typeof legacyRouteCode !== "string") {
    return accessError(400, "INVALID_MODEL_CODE", "Model code must be a string.");
  }
  let requestedTarget: ChatTarget | undefined;
  if (raw?.target !== undefined) {
    const candidate = raw.target;
    if (!candidate || typeof candidate !== "object" || legacyRouteCode !== undefined) {
      return accessError(400, "INVALID_CHAT_TARGET", "Provide one route or model target.");
    }
    const { endpointCode, modelCode } = candidate as Record<string, unknown>;
    if (typeof endpointCode === "string" && endpointCode.trim() && modelCode === undefined) {
      requestedTarget = { endpointCode: endpointCode.trim() };
    } else if (typeof modelCode === "string" && modelCode.trim() && endpointCode === undefined) {
      requestedTarget = { modelCode: modelCode.trim() };
    } else {
      return accessError(400, "INVALID_CHAT_TARGET", "Provide one route or model target.");
    }
  }
  const skillCode = typeof raw?.skillCode === "string" ? raw.skillCode : undefined;

  let entitlement;
  try {
    entitlement = await readWorkspaceEntitlement(caller.session);
    if (hasProductAccess(entitlement) && !await hasWorkspaceSeat(caller.session)) {
      return accessError(403, "PRODUCT_SEAT_REQUIRED", "Product access is not assigned.");
    }
  } catch {
    return accessError(503, "WORKSPACE_ACCESS_UNAVAILABLE", "Workspace access could not be checked.");
  }
  if (!hasProductAccess(entitlement)) {
    return accessError(403, "WORKSPACE_ACCESS_REQUIRED", "This workspace cannot use chat.");
  }

  // Check feature entitlement before calling any metered service.
  let target: ChatTarget;
  try {
    if (requestedTarget?.modelCode !== undefined) {
      const config = getAtlasClientConfig();
      const choices = config ? await readGrantedAtlasChatModels(config, caller.identity.mint, entitlement) : null;
      if (choices === null) return accessError(503, "MODEL_CATALOG_UNAVAILABLE", MODEL_CATALOG_UNAVAILABLE);
      if (!choices.some(({ code }) => code === requestedTarget.modelCode)) {
        return accessError(403, "MODEL_NOT_GRANTED", MODEL_NOT_GRANTED);
      }
      target = requestedTarget;
    } else {
      const routes = await readModelChoices(caller, entitlement);
      const endpointCode = chooseChatModel(routes, requestedTarget?.endpointCode ?? legacyRouteCode);
      if (!endpointCode) return accessError(403, "MODEL_NOT_GRANTED", MODEL_NOT_GRANTED);
      target = { endpointCode };
    }
  } catch {
    return accessError(503, "MODEL_CATALOG_UNAVAILABLE", MODEL_CATALOG_UNAVAILABLE);
  }
  if (skillCode !== undefined) {
    const skill = findSkill(skillCode);
    if (!skill) return NextResponse.json({ error: `unknown skill '${skillCode}'` }, { status: 400 });
    if (!canUseFeature(entitlement, skill.featureKey)) {
      return NextResponse.json(
        { error: `skill '${skillCode}' not entitled at tier '${entitlement.tier ?? "none"}'` },
        { status: 403 },
      );
    }
  }

  let reply;
  try {
    reply = await getChatResolver().reply(messages, caller.identity, { target, skillCode });
  } catch (err) {
    if (err instanceof ChatConversionError) {
      return NextResponse.json({
        code: "DOCUMENT_CONVERSION_UNAVAILABLE",
        error: err.message,
        callId: err.skill.callId,
        evidence: { taskId: err.taskId, skill: { ...err.skill, detail: "" } } satisfies ChatFailureEvidence,
      }, { status: 502, headers: { "cache-control": "no-store" } });
    }
    if (err instanceof ChatInferenceError) {
      const evidence = { taskId: err.taskId, skill: err.skill } satisfies ChatFailureEvidence;
      if (err.cause instanceof AtlasError) return atlasChatError(err.cause, evidence);
      return NextResponse.json({ code: "ATLAS_REQUEST_FAILED", error: err.message, evidence }, {
        status: 502, headers: { "cache-control": "no-store" },
      });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "chat resolver failed" }, { status: 502 });
  }

  // Meter vxtpl's own unit of work, and only that. Atlas meters model token
  // consumption on its side, so reporting `reply.usage` here would double-count
  // it; what vxtpl owns is "a chat message was served". Buffered locally and
  // reported by the flush job - a metering failure must never fail the turn the
  // user already paid for in latency.
  try {
    await recordUsage({
      workspaceId: caller.workspaceId,
      metric: USAGE_METRIC,
      amount: 1,
      idempotencyKey: reply.taskId ?? randomUUID(),
      endUserId: caller.sub,
    });
  } catch (err) {
    console.error(`[chat] usage record failed for workspace ${caller.workspaceId}:`, err);
  }

  return NextResponse.json(reply);
}
