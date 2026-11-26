/**
 * Same-origin entry point for platform integration validation.
 * @package @vxtpl/app
 * @layer Application
 * @category Route
 * @author AI-Generated
 * @date 2026-11-26
 */

import { NextResponse } from "next/server";
import { getOidcConfig } from "../../auth/lib/config";
import { acceptsBrowserOrigin } from "../../auth/lib/request-origin";
import { readWorkspaceSession } from "../../auth/lib/workspace-session";
import { readPlatformReport, runPlatformProbe } from "../../platform-demo/verification";
import type { ProbeCommand } from "../../platform-demo/types";

export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

export async function GET(): Promise<Response> {
  const session = await readWorkspaceSession();
  if (session.status === "unavailable") return reply({ detail: "会话暂不可核验" }, 503);
  return reply(await readPlatformReport(session.status === "ready" ? session : null));
}

function readCommand(value: unknown): ProbeCommand | null {
  if (!value || typeof value !== "object") return null;
  const { probe, modelCode } = value as Record<string, unknown>;
  switch (probe) {
    case "c3-replay":
    case "atlas-inference":
    case "runos-invoke": return { probe };
    case "atlas-model-inference":
      return typeof modelCode === "string" && modelCode.trim()
        ? { probe, modelCode: modelCode.trim() }
        : null;
    default: return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!acceptsBrowserOrigin(request, getOidcConfig().appOrigin)) return reply({ detail: "请求来源不可用" }, 403);
  const body = await request.json().catch(() => null);
  const command = readCommand(body);
  if (!command) return reply({ detail: "请选择验收操作，并为模型直调选择一个模型" }, 400);
  const session = await readWorkspaceSession();
  if (session.status === "unavailable") return reply({ detail: "会话暂不可核验" }, 503);
  if (session.status !== "ready") return reply({ detail: "请使用验收账号登录" }, 401);
  if (typeof body.scopeKey !== "string" || body.scopeKey !== session.scopeKey) {
    return reply({ code: "WORKSPACE_CHANGED", detail: "当前组织、工作空间或账号已变化，请重新核验" }, 409);
  }
  const { status, result } = await runPlatformProbe(session, command);
  return reply(result, status);
}
