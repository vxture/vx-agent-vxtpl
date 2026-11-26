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
import type { Probe } from "../../platform-demo/types";

export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

export async function GET(): Promise<Response> {
  const session = await readWorkspaceSession();
  if (session.status === "unavailable") return reply({ detail: "会话暂不可核验" }, 503);
  return reply(await readPlatformReport(session.status === "ready" ? session : null));
}

function isProbe(value: unknown): value is Probe {
  return value === "c3-replay" || value === "atlas-inference" || value === "runos-invoke";
}

export async function POST(request: Request): Promise<Response> {
  if (!acceptsBrowserOrigin(request, getOidcConfig().appOrigin)) return reply({ detail: "请求来源不可用" }, 403);
  const body = await request.json().catch(() => null);
  if (!isProbe(body?.probe)) return reply({ detail: "请选择已支持的验收操作" }, 400);
  const session = await readWorkspaceSession();
  if (session.status === "unavailable") return reply({ detail: "会话暂不可核验" }, 503);
  if (session.status !== "ready") return reply({ detail: "请使用验收账号登录" }, 401);
  if (typeof body.scopeKey !== "string" || body.scopeKey !== session.scopeKey) {
    return reply({ detail: "当前组织、工作空间或账号已变化，请重新核验" }, 409);
  }
  const { status, result } = await runPlatformProbe(session, body.probe);
  return reply(result, status);
}
