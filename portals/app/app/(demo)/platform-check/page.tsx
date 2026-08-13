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

function badgeFor(p: ProbeResult) {
  const cls = !p.configured ? "badge badge-neutral" : p.ok ? "badge badge-ok" : "badge badge-bad";
  const label = !p.configured ? "not configured" : p.ok ? "ok" : "failed";
  return (
    <span className={cls}>
      <span className="dot" />
      {label}
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
    <main className="page narrow">
      <div className="eyebrow">Verification surface</div>
      <h1 style={{ fontSize: "1.8rem", marginTop: "0.4rem" }}>Platform capability check</h1>
      <p className="lede">
        Read-only, agent-usage-perspective checks against Atlas (model gateway) and Runos (commercial capability
        plane). Neither probe spends model tokens or capability quota.
      </p>
      {error && <p style={{ color: "var(--danger)", marginTop: "1rem" }}>{error}</p>}
      {data && (
        <div style={{ marginTop: "1.6rem" }}>
          <div className="card">
            <h3>
              {badgeFor(data.atlas)}
              Atlas
            </h3>
            <p className="mono" style={{ fontSize: "0.83rem", color: "var(--ink-soft)" }}>
              {data.atlas.detail}
            </p>
          </div>
          <div className="card">
            <h3>
              {badgeFor(data.runos)}
              Runos
            </h3>
            <p className="mono" style={{ fontSize: "0.83rem", color: "var(--ink-soft)" }}>
              {data.runos.detail}
            </p>
          </div>
        </div>
      )}

      <footer className="page-links">
        <a href="/chat">-&gt; chat capability verification</a>
        <a href="/status">-&gt; integration status</a>
      </footer>
    </main>
  );
}
