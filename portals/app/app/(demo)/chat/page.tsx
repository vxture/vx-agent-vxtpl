"use client";

import { useState } from "react";
import type { ChatMessage } from "../../chat/types";

// Chat capability-verification demo. Talks to /api/chat, which resolves
// through Atlas when ATLAS_API_URL + ATLAS_S2S_TOKEN are configured, else the
// offline Mock. See docs/80-liaison for the pending Atlas credential request.

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

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"atlas" | "mock" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ history: next }),
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
      <h1>Chat capability verification</h1>
      <p>
        Mode: <code>{mode ?? "unknown until first reply"}</code>
        {mode === "mock" && " (Atlas not connected - see docs/80-liaison)"}
      </p>
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
