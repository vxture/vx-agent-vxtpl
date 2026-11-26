import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { getAuthContext } from "../lib/session";

// GET /auth/session (080-rp section 2.2): read the cookie, resolve the RP session
// (silent-refreshing a near-expiry access token), return the bootstrap claims.
// Never returns tokens to the browser. Anonymous is a 200 with authenticated:false.
// Display fields come from the verified access token.
export const dynamic = "force-dynamic";
const noStore = { headers: { "cache-control": "no-store" } };

export async function GET(): Promise<Response> {
  const cfg = getOidcConfig();
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  if (!rpsid) return NextResponse.json({ authenticated: false }, noStore);

  let ctx;
  try {
    ctx = await getAuthContext(cfg, rpsid);
  } catch {
    return NextResponse.json({ reason: "session_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!ctx) return NextResponse.json({ authenticated: false }, noStore);

  // account_status gate (080-rp section 2.6): non-active is treated as no session.
  if (ctx.user.accountStatus && ctx.user.accountStatus !== "active") {
    return NextResponse.json({ authenticated: false, reason: "account_inactive" }, noStore);
  }
  return NextResponse.json({ authenticated: true, user: { ...ctx.user, ...ctx.profile } }, noStore);
}
