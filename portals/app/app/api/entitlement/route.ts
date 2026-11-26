import { NextResponse } from "next/server";
import { readWorkspaceSession } from "../../auth/lib/workspace-session";
import { readWorkspaceGates } from "../../entitlement/workspace-authority";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };

export async function GET(): Promise<Response> {
  const session = await readWorkspaceSession();
  if (session.status === "unavailable" || session.status === "unconfigured") {
    return NextResponse.json({ error: "workspace session is unavailable" }, { status: 503, headers });
  }
  if (session.status !== "ready") {
    return NextResponse.json({ authenticated: false }, { status: session.status === "anonymous" || session.status === "development" ? 401 : 403, headers });
  }
  try {
    return NextResponse.json(await readWorkspaceGates(session), { headers });
  } catch {
    return NextResponse.json({ error: "workspace authorization is unavailable" }, { status: 503, headers });
  }
}
