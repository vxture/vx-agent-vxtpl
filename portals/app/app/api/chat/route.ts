import { NextResponse } from "next/server";
import { getChatResolver, validateHistory } from "../../chat/resolver";

// POST /api/chat - capability-verification chat endpoint. Resolves through
// the Atlas resolver when ATLAS_API_URL + ATLAS_S2S_TOKEN are configured,
// otherwise the offline Mock (see chat/resolver.ts). No auth gate: this is a
// demo surface, not a data-plane feature - do not add real user data here
// before it goes through the same session/entitlement gates as the rest of
// the app.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const history = (body as Record<string, unknown> | null)?.history;
  let messages;
  try {
    messages = validateHistory(history);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid history" }, { status: 400 });
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "history must end with a user message" }, { status: 400 });
  }

  try {
    const reply = await getChatResolver().reply(messages);
    return NextResponse.json(reply);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "chat resolver failed" },
      { status: 502 },
    );
  }
}
