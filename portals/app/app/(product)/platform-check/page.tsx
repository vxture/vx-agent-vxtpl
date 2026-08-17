"use client";

import { useEffect, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle, Section, Stack, StatusBadge } from "../../ds";

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
  const tone = !p.configured ? "neutral" : p.ok ? "success" : "danger";
  const label = !p.configured ? "not configured" : p.ok ? "ok" : "failed";
  return (
    <StatusBadge tone={tone} dot>
      {label}
    </StatusBadge>
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
    <main className="page">
      <Stack gap="xs">
        <div className="eyebrow">Verification surface</div>
        <Section
          level={1}
          title="Platform capability check"
          description={<span className="block max-w-[62ch]">Read-only, agent-usage-perspective checks against Atlas (model gateway) and Runos (commercial capability plane). Neither probe spends model tokens or capability quota.</span>}
        >
          {error && <p style={{ color: "var(--vxtpl-danger)" }}>{error}</p>}
          {data && (
            <Stack gap="md">
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-sm">
                    {badgeFor(data.atlas)}
                    Atlas
                  </CardTitle>
                  <CardDescription className="mono">{data.atlas.detail}</CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-sm">
                    {badgeFor(data.runos)}
                    Runos
                  </CardTitle>
                  <CardDescription className="mono">{data.runos.detail}</CardDescription>
                </CardHeader>
              </Card>
            </Stack>
          )}
        </Section>
      </Stack>

      <footer className="page-links">
        <a href="/chat">-&gt; chat capability verification</a>
        <a href="/status">-&gt; integration status</a>
      </footer>
    </main>
  );
}
