"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Section, Stack, StatusBadge } from "../../ds";

// Full-channel verification surface, per the integration general rules'
// go-live checklist: C1 (identity), C2 (entitlement), C3 up (usage consume)
// and down (webhook), plus the two L1 planes (Atlas, Runos). Every check on
// load is read-only; the one spending probe - the C3 replay check, checklist
// item 5 - runs only on an explicit click and consumes at most one unit per
// workspace per day (its idempotency key is date-stable).

interface ProbeResult {
  configured: boolean;
  ok: boolean;
  detail: string;
}

interface CheckResponse {
  c1: ProbeResult;
  c2: ProbeResult;
  c3Up: ProbeResult;
  c3Down: ProbeResult;
  tokenMint: ProbeResult;
  atlas: ProbeResult;
  catalog: ProbeResult;
  runos: ProbeResult;
}

interface ReplayResult {
  ok: boolean;
  detail: string;
  first?: Record<string, unknown>;
  second?: Record<string, unknown>;
  error?: string;
}

const CHANNELS: { key: keyof CheckResponse; title: string; body: string }[] = [
  { key: "c1", title: "C1 - identity (OIDC)", body: "Discovery + JWKS against the accounts issuer; issuer match, key count, client and scopes." },
  { key: "c2", title: "C2 - entitlement", body: "Live envelope resolve for your workspace: status / tier / limits / pools, and the Cache-Control the client honors." },
  { key: "c3Up", title: "C3 up - usage consume", body: "Consume target state and the local buffer depth. The replay probe below is the live idempotency check." },
  { key: "c3Down", title: "C3 down - provisioning webhook", body: "Signature verifier self-test (sign + verify + tamper rejection) and the last recorded deliveries." },
  { key: "tokenMint", title: "S2S token mint", body: "Per-call on-behalf-of minting on your session (ADR-003) - the identity every Atlas/Runos call carries." },
  { key: "atlas", title: "Atlas - model plane", body: "GET /v1/models from a consumer's perspective." },
  { key: "catalog", title: "Atlas - catalog reconciliation", body: "Shipped model catalog vs actually granted endpoints; names anything that would 404." },
  { key: "runos", title: "Runos - capability plane", body: "GET /.well-known/vxture-tools discovery." },
];

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
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayBusy, setReplayBusy] = useState(false);

  useEffect(() => {
    fetch("/api/platform-check", { cache: "no-store" })
      .then(async (r) => setData((await r.json()) as CheckResponse))
      .catch(() => setError("platform-check unavailable"));
  }, []);

  async function runReplayProbe() {
    setReplayBusy(true);
    setReplay(null);
    try {
      const r = await fetch("/api/platform-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ probe: "c3-replay" }),
      });
      const body = (await r.json()) as ReplayResult;
      setReplay(r.ok ? body : { ok: false, detail: body.error ?? `HTTP ${r.status}` });
    } catch {
      setReplay({ ok: false, detail: "probe request failed" });
    } finally {
      setReplayBusy(false);
    }
  }

  return (
    <main className="page">
      <Stack gap="xs">
        <div className="eyebrow">Verification surface</div>
        <Section
          level={1}
          title="Platform capability check"
          description={
            <span className="block max-w-[62ch]">
              Every channel vxtpl consumes, verified from the consumer&apos;s side per the integration
              general rules&apos; go-live checklist. Checks on load are read-only; only the explicit replay
              probe spends (at most one unit per day).
            </span>
          }
        >
          {error && <p style={{ color: "var(--vxtpl-danger)" }}>{error}</p>}
          {data && (
            <Stack gap="md">
              {CHANNELS.map((c) => (
                <Card key={c.key}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-sm">
                      {badgeFor(data[c.key])}
                      {c.title}
                    </CardTitle>
                    <CardDescription>
                      {c.body}
                      <span className="mono block" style={{ marginTop: 6 }}>
                        {data[c.key].detail}
                      </span>
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}

              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-sm">
                    {replay ? (
                      <StatusBadge tone={replay.ok ? "success" : "danger"} dot>
                        {replay.ok ? "verified" : "failed"}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral" dot>
                        not run
                      </StatusBadge>
                    )}
                    C3 replay probe (checklist #5)
                  </CardTitle>
                  <CardDescription>
                    Sends the same consume twice with one idempotency key. The second answer must say{" "}
                    <code>replayed: true</code> and carry the first event&apos;s id. Spends at most one unit of{" "}
                    <code>vxtpl.chat.messages</code> per workspace per day.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Stack gap="sm">
                    <div>
                      <Button onClick={runReplayProbe} disabled={replayBusy}>
                        {replayBusy ? "running..." : "Run the replay probe"}
                      </Button>
                    </div>
                    {replay && (
                      <div className="mono" style={{ fontSize: "0.8rem", color: "var(--vxtpl-slate)" }}>
                        <div>{replay.detail}</div>
                        {replay.first && <div>first: {JSON.stringify(replay.first)}</div>}
                        {replay.second && <div>second: {JSON.stringify(replay.second)}</div>}
                      </div>
                    )}
                  </Stack>
                </CardContent>
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
