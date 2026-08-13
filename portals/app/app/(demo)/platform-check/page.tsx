"use client";

import { useEffect, useState } from "react";

// Basic capability verification for the two L1 platforms vxtpl can consume,
// from an agent-usage perspective: Atlas (model gateway) and Runos
// (commercial capability plane). Calls /api/platform-check, which runs a
// read-only probe against each platform's real interface contract.

interface ProbeResult {
  configured: boolean;
  ok: boolean;
  detail: string;
}
interface CheckResponse {
  atlas: ProbeResult;
  runos: ProbeResult;
}

const card: React.CSSProperties = {
  border: "1px solid #d0d0d0",
  borderRadius: 8,
  padding: "12px 16px",
  margin: "0 0 12px",
  maxWidth: 720,
};

function Badge({ p }: { p: ProbeResult }) {
  const label = !p.configured ? "not configured" : p.ok ? "ok" : "failed";
  const emoji = !p.configured ? "➖" : p.ok ? "\u{1F7E2}" : "\u{1F534}";
  return (
    <span>
      {emoji} {label}
    </span>
  );
}

export default function PlatformCheckPage() {
  const [data, setData] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform-check", { cache: "no-store" })
      .then(async (r) => setData((await r.json()) as CheckResponse))
      .catch(() => setError("platform-check unavailable"));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", lineHeight: 1.5 }}>
      <h1>Platform capability verification</h1>
      <p>
        Read-only, agent-usage-perspective checks against Atlas (model gateway) and Runos (commercial capability
        plane). Neither probe spends model tokens or capability quota.
      </p>
      {error && <p style={{ color: "#b00" }}>{error}</p>}
      {data && (
        <>
          <section style={card}>
            <h3 style={{ margin: "0 0 8px" }}>
              Atlas - <Badge p={data.atlas} />
            </h3>
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}>{data.atlas.detail}</p>
          </section>
          <section style={card}>
            <h3 style={{ margin: "0 0 8px" }}>
              Runos - <Badge p={data.runos} />
            </h3>
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}>{data.runos.detail}</p>
          </section>
        </>
      )}
      <p>
        <a href="/chat">-&gt; chat capability verification</a>
        {" | "}
        <a href="/status">-&gt; integration status</a>
      </p>
    </main>
  );
}
