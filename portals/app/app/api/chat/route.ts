import { NextResponse } from "next/server";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { canUseFeature } from "../../entitlement/capability";
import { findModel, findSkill, gatedModels, gatedSkills } from "../../chat/catalog";
import { getChatResolver, validateHistory } from "../../chat/resolver";

// GET/POST /api/chat - capability-verification chat endpoint, now with
// entitlement-gated model + skill selection (chat/catalog.ts,
// entitlement/capability.ts). No real login (C1) is live yet, so - exactly
// like the /entitlement-matrix and /platform-check demo surfaces - both
// verbs resolve entitlement for a fixed demo workspace rather than a real
// session. Once C1 is live, swap DEMO_WORKSPACE_ID for the authenticated
// user's workspace (see api/entitlement/route.ts for that pattern).
export const dynamic = "force-dynamic";

const DEMO_WORKSPACE_ID = "ws_demo";

export async function GET(): Promise<Response> {
  const entitlement = await getEntitlementResolver().resolve(DEMO_WORKSPACE_ID);
  return NextResponse.json({
    tier: entitlement.tier,
    productAccess: entitlement.tier != null,
    models: gatedModels(entitlement),
    skills: gatedSkills(entitlement),
  });
}

export async function POST(req: Request): Promise<Response> {
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

  const entitlement = await getEntitlementResolver().resolve(DEMO_WORKSPACE_ID);

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

  try {
    const reply = await getChatResolver().reply(messages, { modelCode, skillCode });
    return NextResponse.json(reply);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "chat resolver failed" },
      { status: 502 },
    );
  }
}
