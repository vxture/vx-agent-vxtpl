"use client";

import { useEffect, useState } from "react";
import type { ChatMessage } from "../../chat/types";
import type { GatedOption } from "../../chat/catalog";

// Chat capability-verification demo. Talks to /api/chat, which resolves
// through Atlas when ATLAS_API_URL + ATLAS_S2S_TOKEN are configured, else the
// offline Mock. Model/skill selection is entitlement-gated (tier ->
// CAPABILITY_MATRIX, entitlement/capability.ts) against a fixed demo
// workspace (no real login yet) - see docs/80-liaison for Atlas/Runos.

interface ChatContext {
  tier: string | null;
  productAccess: boolean;
  models: GatedOption[];
  skills: GatedOption[];
}

const main: React.CSSProperties = { fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 };
const log: React.CSSProperties = {
  border: "1px solid #d0d0d0",
  borderRadius: 8,
  padding: "12px 16px",
  minHeight: 200,
  marginBottom: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const bubble = (role: ChatMessage["role"]): React.CSSProperties => ({
  alignSelf: role === "user" ? "flex-end" : "flex-start",
  background: role === "user" ? "#e6f0ff" : "#f0f0f0",
  borderRadius: 8,
  padding: "6px 10px",
  maxWidth: "85%",
  whiteSpace: "pre-wrap",
});
const selectRow: React.CSSProperties = { display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" };
const selectLabel: React.CSSProperties = { display: "flex", flexDirection: "column", fontSize: "0.85rem", gap: 4 };

function tierLabel(tier: string | null): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "No subscription";
}

function OptionSelect({
  options,
  value,
  onChange,
}: {
  options: GatedOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "4px 6px" }}>
      {options.map((o) => (
        <option key={o.code} value={o.code} disabled={!o.allowed}>
          {o.label}
          {!o.allowed ? ` (requires ${o.requiredTier ?? "?"})` : ""}
        </option>
      ))}
    </select>
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

  useEffect(() => {
    fetch("/api/chat", { cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json()) as ChatContext;
        setCtx(data);
        setModelCode(data.models.find((m) => m.allowed)?.code ?? data.models[0]?.code ?? "");
        setSkillCode(data.skills.find((s) => s.allowed)?.code ?? "");
      })
      .catch(() => setError("failed to load model/skill catalog"));
  }, []);

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
    <main style={main}>
      <h1>
        Chat capability verification - <span style={{ color: "#0b6e76" }}>{tierLabel(ctx?.tier ?? null)}</span>
      </h1>
      <p>
        Mode: <code>{mode ?? "unknown until first reply"}</code>
        {mode === "mock" && " (Atlas not connected - see docs/80-liaison)"}
      </p>

      {ctx && (
        <div style={selectRow}>
          <label style={selectLabel}>
            Model
            <OptionSelect options={ctx.models} value={modelCode} onChange={setModelCode} />
          </label>
          <label style={selectLabel}>
            Skill
            <OptionSelect options={ctx.skills} value={skillCode} onChange={setSkillCode} />
          </label>
        </div>
      )}

      <div style={log}>
        {messages.length === 0 && <span style={{ color: "#888" }}>Say something to verify the round trip.</span>}
        {messages.map((m, i) => (
          <div key={i} style={bubble(m.role)}>
            {m.content}
          </div>
        ))}
      </div>
      {error && <p style={{ color: "#b00" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ flex: 1, padding: "8px 10px" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message"
          disabled={busy}
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          {busy ? "..." : "Send"}
        </button>
      </div>
    </main>
  );
}
