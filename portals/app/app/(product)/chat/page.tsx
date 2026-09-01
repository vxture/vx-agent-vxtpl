"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Stack,
  StatusBadge,
} from "../../ds";
import type { ChatMessage, ChatReply, SkillOutcome } from "../../chat/types";
import type { GatedOption } from "../../chat/catalog";

// Chat surface. Talks to /api/chat, which requires a signed-in session: the
// workspace it resolves entitlement for is also what the S2S token is minted
// against and what Atlas attributes the call to. Model and skill selection are
// entitlement-gated (tier -> CAPABILITY_MATRIX, entitlement/capability.ts), and
// a selected skill is executed as a real Runos capability.

const NO_SKILL = "";

interface ChatContext {
  tier: string | null;
  productAccess: boolean;
  models: GatedOption[];
  skills: GatedOption[];
}

interface TurnMeta {
  mode: "atlas" | "mock";
  modelCode: string;
  skill?: SkillOutcome;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs?: number;
}

function tierLabel(tier: string | null): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "No subscription";
}

function tierTone(tier: string | null): "neutral" | "warning" | "brand" {
  if (!tier) return "neutral";
  if (tier === "free" || tier === "starter") return "warning";
  return "brand";
}

/**
 * Model and skill, as toolbar pills rather than sidebar cards.
 *
 * A picker parked in a sidebar reads as configuration you set once. These are a
 * per-turn choice, so they sit next to the thing they change. The `label` is
 * part of the control rather than a heading above it, which is what lets two of
 * them share one row without either looking like a section.
 *
 * An option the tier does not cover stays VISIBLE and disabled, carrying the
 * tier it needs. Hiding it would answer "why can I not pick that" with silence.
 */
function PillSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: GatedOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <span className="pill-select">
      <span className="pill-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.code} value={o.code} disabled={!o.allowed}>
            {o.label}
            {!o.allowed ? ` \u{1F512} ${o.requiredTier ?? "?"}` : ""}
          </option>
        ))}
      </select>
    </span>
  );
}

/** What the selected skill actually did. Silence here would read as "it worked". */
function SkillReport({ skill }: { skill: SkillOutcome }) {
  const tone = skill.status === "ran" ? "success" : skill.status === "failed" ? "warning" : "neutral";
  return (
    <div style={{ marginTop: "0.6rem", fontSize: "0.8rem", color: "var(--vxtpl-slate)" }}>
      <StatusBadge tone={tone} dot>
        {skill.code}: {skill.status}
      </StatusBadge>
      {skill.capabilityId && (
        <div style={{ marginTop: 4 }}>
          via <code>{skill.capabilityId}</code>
        </div>
      )}
      {skill.detail && (
        <div style={{ marginTop: 4, wordBreak: "break-word" }}>{skill.detail.slice(0, 240)}</div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  const [modelCode, setModelCode] = useState("");
  const [skillCode, setSkillCode] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [turn, setTurn] = useState<TurnMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 503) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          setSignedOut(true);
          setError(body.error ?? "sign in to use chat");
          return;
        }
        const data = (await r.json()) as ChatContext;
        setCtx(data);
        setModelCode(data.models.find((m) => m.allowed)?.code ?? data.models[0]?.code ?? "");
        // Default to no skill: skills invoke a real, billed capability, so
        // opting in should be the user's choice rather than a preselected value.
        setSkillCode(NO_SKILL);
      })
      .catch(() => setError("failed to load model/skill catalog"));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: next, modelCode: modelCode || undefined, skillCode: skillCode || undefined }),
      });
      const body = (await res.json()) as ChatReply & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMessages([...next, body.message]);
      setTurn({
        mode: body.mode,
        modelCode: body.modelCode,
        skill: body.skill,
        usage: body.usage,
        latencyMs: body.latencyMs,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "chat request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.7rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.7rem" }}>Chat</h1>
        <StatusBadge tone="warning" dot>
          debug surface
        </StatusBadge>
        <StatusBadge tone={tierTone(ctx?.tier ?? null)} dot>
          {ctx ? tierLabel(ctx.tier) : "..."}
        </StatusBadge>
      </div>
      <p className="lede">
        A tier-gated turn against the platform&apos;s model gateway; a selected skill runs as a real Runos
        capability. This is a DEBUG surface for verifying the S2S chain, not a product feature - turns are
        capped at 500 characters and 6 per minute.
      </p>

      {signedOut && (
        <Card style={{ marginTop: "1rem" }}>
          <CardHeader>
            <CardTitle>Sign in to continue</CardTitle>
            <CardDescription>
              Chat resolves entitlement for your active workspace and mints its platform token on your session, so it
              needs you signed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/auth/login?returnTo=/chat">Sign in</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* One conversation column; model and skill sit UNDER the composer, which
          is where every major assistant put them and not by coincidence. They
          are the last thing you touch before sending, so they belong at the end
          of the reading path, next to Send - not above the transcript, where
          they read as settings you configured before the conversation started.
          Keeping them adjacent to the input also means the choice and its effect
          are in one glance when a locked option explains itself.

          The transcript scrolls to the card's own edges and the composer block
          sits flush against its bottom rule, so the card contributes the frame
          only - its padding and inter-child gap are zeroed rather than worked
          around. */}
      <div style={{ marginTop: "1.4rem" }}>
        <Card style={{ padding: 0, gap: 0, height: 560, overflow: "hidden" }}>
          <div
            ref={logRef}
            style={{ flex: 1, overflowY: "auto", padding: "1.2rem 1.4rem", display: "flex", flexDirection: "column", gap: 10 }}
          >
            {messages.length === 0 && (
              <span style={{ color: "var(--vxtpl-slate-faint)", fontSize: "0.88rem" }}>Say something to verify the round trip.</span>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? "var(--vxtpl-accent-soft)" : "var(--vxtpl-paper)",
                  color: m.role === "user" ? "var(--vxtpl-accent-ink)" : "var(--vxtpl-ink-soft)",
                  border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                  borderRadius: 12,
                  padding: "0.55rem 0.85rem",
                  maxWidth: "min(78%, 640px)",
                  whiteSpace: "pre-wrap",
                  fontSize: "0.92rem",
                  lineHeight: 1.5,
                }}
              >
                {m.content}
              </div>
            ))}
            {busy && <span style={{ color: "var(--vxtpl-slate-faint)", fontSize: "0.82rem" }}>thinking...</span>}
          </div>
          <div className="chat-composer">
            <div className="chat-composer__row">
              <Input
                style={{ flex: 1 }}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Type a short verification message (max 500 chars)"
                maxLength={500}
                disabled={busy}
              />
              <Button onClick={send} disabled={busy || !input.trim()}>
                {busy ? "..." : "Send"}
              </Button>
            </div>

            <div className="chat-toolbar">
              {ctx ? (
                <>
                  <PillSelect label="Model" options={ctx.models} value={modelCode} onChange={setModelCode} />
                  <PillSelect
                    label="Skill"
                    options={[{ code: NO_SKILL, label: "None", allowed: true, requiredTier: null }, ...ctx.skills]}
                    value={skillCode}
                    onChange={setSkillCode}
                  />
                </>
              ) : (
                <span style={{ color: "var(--vxtpl-slate-faint)", fontSize: "0.82rem" }}>loading catalog...</span>
              )}
              {turn && (
                <span style={{ marginLeft: "auto" }}>
                  <StatusBadge tone={turn.mode === "atlas" ? "success" : "neutral"} dot>
                    {turn.mode === "atlas" ? "Atlas" : "Mock"}
                  </StatusBadge>
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* What the last turn actually did, under the conversation rather than
            beside it: it is a result, so it belongs downstream of the thing that
            produced it and it should not occupy width while there is nothing to
            report. */}
        {(turn?.skill || turn?.usage) && (
          <Stack gap="md" style={{ marginTop: "1rem" }}>
            {turn.skill && (
              <Card>
                <CardHeader>
                  <CardTitle>Skill</CardTitle>
                </CardHeader>
                <CardContent>
                  <SkillReport skill={turn.skill} />
                </CardContent>
              </Card>
            )}
            {turn.usage && (
              <Card>
                <CardHeader>
                  <CardTitle>Last turn</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ fontSize: "0.8rem", color: "var(--vxtpl-slate)", lineHeight: 1.7 }}>
                    <div>
                      served by <code>{turn.modelCode}</code>
                    </div>
                    <div>
                      {turn.usage.promptTokens} prompt + {turn.usage.completionTokens} completion ={" "}
                      {turn.usage.totalTokens} tokens
                    </div>
                    {turn.latencyMs != null && <div>{turn.latencyMs} ms</div>}
                  </div>
                </CardContent>
              </Card>
            )}
          </Stack>
        )}
      </div>

      {error && <p style={{ color: "var(--vxtpl-danger)", fontSize: "0.86rem", marginTop: "0.7rem" }}>{error}</p>}

      <footer className="page-links">
        <a href="/status">-&gt; integration status</a>
        <a href="/platform-check">-&gt; Atlas/Runos platform check</a>
      </footer>
    </main>
  );
}
