"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../chat/types";
import type { GatedOption } from "../../chat/catalog";

// Chat capability-verification demo. Talks to /api/chat, which resolves
// through Atlas when ATLAS_API_URL + ATLAS_S2S_TOKEN are configured, else the
// offline Mock. Model/skill selection is entitlement-gated (tier ->
// CAPABILITY_MATRIX, entitlement/capability.ts) against a fixed demo
// workspace (no real login yet) - see docs/80-liaison for Atlas/Runos.
//
// Layout follows the common chat-product pattern (ChatGPT/Claude): a single
// centered conversation column, not stretched full-width, with model/skill
// as compact pill dropdowns in a toolbar above the log - not sidebar cards.

interface ChatContext {
  tier: string | null;
  productAccess: boolean;
  models: GatedOption[];
  skills: GatedOption[];
}

function tierLabel(tier: string | null): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "No subscription";
}

function tierBadgeClass(tier: string | null): string {
  if (!tier) return "badge badge-neutral";
  if (tier === "free" || tier === "starter") return "badge badge-warn";
  return "badge badge-accent";
}

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

export default function ChatPage() {
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  const [modelCode, setModelCode] = useState("");
  const [skillCode, setSkillCode] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"atlas" | "mock" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat", { cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json()) as ChatContext;
        setCtx(data);
        setModelCode(data.models.find((m) => m.allowed)?.code ?? data.models[0]?.code ?? "");
        setSkillCode(data.skills.find((s) => s.allowed)?.code ?? data.skills[0]?.code ?? "");
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
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMessages([...next, body.message]);
      setMode(body.mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "chat request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.7rem", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "1.6rem" }}>Chat</h1>
          <span className={tierBadgeClass(ctx?.tier ?? null)}>
            <span className="dot" />
            {ctx ? tierLabel(ctx.tier) : "..."}
          </span>
        </div>
        <p className="lede">Capability verification for the platform's model gateway - selection below is entitlement-gated.</p>

        <div
          className="card"
          style={{
            marginTop: "1.2rem",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            height: 560,
            overflow: "hidden",
          }}
        >
          <div className="chat-toolbar">
            {ctx ? (
              <>
                <PillSelect label="Model" options={ctx.models} value={modelCode} onChange={setModelCode} />
                <PillSelect label="Skill" options={ctx.skills} value={skillCode} onChange={setSkillCode} />
              </>
            ) : (
              <span style={{ color: "var(--slate-faint)", fontSize: "0.82rem" }}>loading catalog...</span>
            )}
            {mode && (
              <span
                className={mode === "atlas" ? "badge badge-ok" : "badge badge-neutral"}
                style={{ marginLeft: "auto" }}
              >
                <span className="dot" />
                {mode === "atlas" ? "Atlas" : "Mock"}
              </span>
            )}
          </div>

          <div
            ref={logRef}
            style={{ flex: 1, overflowY: "auto", padding: "1.2rem 1.4rem", display: "flex", flexDirection: "column", gap: 10 }}
          >
            {messages.length === 0 && (
              <span style={{ color: "var(--slate-faint)", fontSize: "0.88rem" }}>Say something to verify the round trip.</span>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? "var(--accent-soft)" : "var(--paper)",
                  color: m.role === "user" ? "var(--accent-ink)" : "var(--ink-soft)",
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
            {busy && <span style={{ color: "var(--slate-faint)", fontSize: "0.82rem" }}>thinking...</span>}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem", display: "flex", gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message"
              disabled={busy}
            />
            <button className="btn btn-primary" onClick={send} disabled={busy || !input.trim()}>
              {busy ? "..." : "Send"}
            </button>
          </div>
        </div>

        {error && <p style={{ color: "var(--danger)", fontSize: "0.86rem", marginTop: "0.7rem" }}>{error}</p>}

        <footer className="page-links">
          <a href="/status">-&gt; integration status</a>
          <a href="/platform-check">-&gt; Atlas/Runos platform check</a>
        </footer>
      </div>
    </main>
  );
}
