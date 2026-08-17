import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthContext } from "../../auth/lib/session";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { canUseFeature } from "../../entitlement/capability";
import { findModel, findSkill, gatedModels, gatedSkills } from "../../chat/catalog";
import { getChatResolver, validateHistory, type ChatIdentity } from "../../chat/resolver";
import { recordUsage } from "../../usage/lib/buffer";
import { isDeployedStage } from "../../lib/deploy-stage";

// GET/POST /api/chat - the tier-gated chat turn.
//
// Both verbs resolve entitlement for the SIGNED-IN user's active workspace. That
// matters beyond tidiness: the workspace is what entitlement is scoped to, what
// the S2S token is minted against, and what Atlas attributes the call to. A
// fixed demo workspace would make all three fictional, and with real credentials
// configured it would let an anonymous visitor spend model tokens.
export const dynamic = "force-dynamic";

const USAGE_METRIC = "vxtpl.chat.messages";

/**
 * Stand-in workspace for local development with no IdP.
 *
 * This is NOT the old DEMO_WORKSPACE_ID by another name. That one applied on
 * every stack including production, so the deployed app resolved entitlement for
 * a workspace nobody owned. This path is unreachable once DEPLOY_STAGE is
 * production or beta, which the image always sets - so it can only ever engage
 * on a developer's machine, where the entitlement and chat resolvers are mocks
 * anyway.
 */
const DEV_WORKSPACE_ID = "ws_local_dev";

interface Caller {
  workspaceId: string;
  identity: ChatIdentity;
}

/** Resolve the caller, or the response body explaining why there isn't one. */
async function resolveCaller(): Promise<Caller | { error: string; status: number }> {
  const cfg = getOidcConfig();
  if (!cfg.enabled) {
    if (isDeployedStage()) {
      return { error: "sign-in is not configured on this deployment (OIDC_RP_ENABLED is off)", status: 503 };
    }
    return {
      workspaceId: DEV_WORKSPACE_ID,
      identity: { workspaceId: DEV_WORKSPACE_ID, mint: { workspaceId: DEV_WORKSPACE_ID } },
    };
  }
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  const ctx = rpsid ? await getAuthContext(cfg, rpsid).catch(() => null) : null;
  if (!ctx) return { error: "not signed in", status: 401 };
  // A suspended or closed account is treated as no session at all (080-rp
  // section 2.6), the same rule /auth/session applies. Without this a suspended
  // user keeps a valid cookie and would go on spending Atlas tokens and
  // invoking Runos capabilities.
  if (ctx.user.accountStatus && ctx.user.accountStatus !== "active") {
    return { error: "account is not active", status: 403 };
  }
  if (!ctx.user.activeWorkspace) {
    return { error: "this session has no active workspace", status: 403 };
  }
  return {
    workspaceId: ctx.user.activeWorkspace,
    identity: {
      workspaceId: ctx.user.activeWorkspace,
      // On-behalf-of: the platform reads workspace and subject from this token
      // rather than trusting anything vxtpl declares. Runos additionally
      // REQUIRES the `sub` that only an OBO token carries.
      mint: { subjectToken: ctx.accessToken },
      sessionId: rpsid,
    },
  };
}

function isFailure(v: Caller | { error: string; status: number }): v is { error: string; status: number } {
  return "error" in v;
}

export async function GET(): Promise<Response> {
  const caller = await resolveCaller();
  if (isFailure(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const entitlement = await getEntitlementResolver().resolve(caller.workspaceId);
  return NextResponse.json({
    tier: entitlement.tier,
    productAccess: entitlement.tier != null,
    models: gatedModels(entitlement),
    skills: gatedSkills(entitlement),
  });
}

export async function POST(req: Request): Promise<Response> {
  const caller = await resolveCaller();
  if (isFailure(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

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

  const modelCode = typeof raw?.modelCode === "string" ? raw.modelCode : undefined;
  const skillCode = typeof raw?.skillCode === "string" ? raw.skillCode : undefined;

  const entitlement = await getEntitlementResolver().resolve(caller.workspaceId);

  // Gate before anything is spent: no S2S token is minted and no capability is
  // invoked for a selection the tier does not cover.
  if (modelCode !== undefined) {
    const model = findModel(modelCode);
    if (!model) return NextResponse.json({ error: `unknown model '${modelCode}'` }, { status: 400 });
    if (!canUseFeature(entitlement, model.featureKey)) {
      return NextResponse.json(
        { error: `model '${modelCode}' not entitled at tier '${entitlement.tier ?? "none"}'` },
        { status: 403 },
      );
    }
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
    reply = await getChatResolver().reply(messages, caller.identity, { modelCode, skillCode });
  } catch (err) {
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
      idempotencyKey: randomUUID(),
    });
  } catch (err) {
    console.error(`[chat] usage record failed for workspace ${caller.workspaceId}:`, err);
  }

  return NextResponse.json(reply);
}
