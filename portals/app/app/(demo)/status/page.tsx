"use client";

import { useEffect, useState } from "react";
import type { IntegrationStatus } from "../../lib/status";

// Integration-status dashboard (product_240 verification surface): at-a-glance
// view of all platform-integration config + live channel probes. Data comes from
// /api/status (non-secret only); channel probes are client-side. Gating (off/
// authed/public) is enforced by /api/status.

interface Probe {
  name: string;
  endpoint: string;
  status: string;
}
const CHANNELS: Omit<Probe, "status">[] = [
  { name: "health", endpoint: "/api/health" },
  { name: "C1 auth (session)", endpoint: "/auth/session" },
  { name: "C2 entitlement", endpoint: "/api/entitlement" },
];

function badgeClass(state: "ok" | "warn" | "bad" | "na"): string {
  return { ok: "badge badge-ok", warn: "badge badge-warn", bad: "badge badge-bad", na: "badge badge-neutral" }[state];
}
function boolBadge(b: boolean | null | undefined) {
  const state = b === null || b === undefined ? "na" : b ? "ok" : "bad";
  return (
    <span className={badgeClass(state)}>
      <span className="dot" />
      {b === null || b === undefined ? "n/a" : b ? "configured" : "not configured"}
    </span>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="field-row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export default function StatusPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [gate, setGate] = useState<string | null>(null);
  const [probes, setProbes] = useState<Probe[]>(CHANNELS.map((c) => ({ ...c, status: "..." })));

  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) return setGate("Status page is disabled (STATUS_PAGE=off).");
        if (r.status === 401) return setGate("Sign in to view the status page (STATUS_PAGE=authed).");
        setStatus((await r.json()) as IntegrationStatus);
      })
      .catch(() => setGate("status unavailable"));

    let cancelled = false;
    Promise.all(
      CHANNELS.map(async (c) => {
        try {
          const r = await fetch(c.endpoint, { cache: "no-store" });
          return { ...c, status: `HTTP ${r.status}` };
        } catch {
          return { ...c, status: "unreachable" };
        }
      }),
    ).then((res) => !cancelled && setProbes(res));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <div className="eyebrow">Verification surface</div>
      <h1 style={{ fontSize: "1.8rem", marginTop: "0.4rem" }}>Integration status</h1>
      <p className="lede">Non-secret config presence + live channel probes across every platform-integration surface.</p>
      {gate && <p style={{ color: "var(--slate)", marginTop: "1rem" }}>{gate}</p>}

      {status?.mockOnDeployedStage && (
        <div
          className="card"
          style={{ marginTop: "1.2rem", borderColor: "var(--danger)", borderWidth: 1, borderStyle: "solid" }}
        >
          <h3 style={{ color: "var(--danger)" }}>Serving mock data on a deployed stage</h3>
          <p style={{ fontSize: "0.88rem", color: "var(--slate)", lineHeight: 1.55 }}>
            A platform base URL is missing, so entitlement or chat is answering from a mock resolver. Everything below
            about tiers and models is fabricated. This state only persists because{" "}
            <code>ALLOW_MOCK_ON_DEPLOY=on</code> is set - without it the app refuses to start.
          </p>
        </div>
      )}

      {status && (
        <div style={{ marginTop: "1.6rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "0.9rem" }}>
          <div className="card">
            <h3>Identity</h3>
            <Field k="product" v={status.identity.productCode} />
            <Field k="build" v={status.identity.gitSha} />
            <Field k="env" v={status.identity.appEnv} />
          </div>

          <div className="card">
            <h3>
              <span className={badgeClass(status.c1.enabled ? "ok" : "warn")}>
                <span className="dot" />
                {status.c1.enabled ? "on" : "off"}
              </span>
              C1 - OIDC RP
            </h3>
            <Field k="issuer" v={status.c1.issuer ?? "-"} />
            <Field k="client_id" v={status.c1.clientId ?? "-"} />
            <Field k="redirect_uri" v={status.c1.redirectUri ?? "-"} />
            <Field k="scopes" v={status.c1.scopes ?? "-"} />
            <Field k="cookie" v={status.c1.cookieName ?? "-"} />
            <Field k="client secret" v={boolBadge(status.c1.clientSecretConfigured)} />
          </div>

          <div className="card">
            <h3>
              <span className={badgeClass(status.c2.resolver === "platform" ? "ok" : "warn")}>
                <span className="dot" />
                {status.c2.resolver}
              </span>
              C2 - entitlement
            </h3>
            <Field k="platform API" v={boolBadge(status.c2.platformApiConfigured)} />
            <Field k="internal-auth token" v={boolBadge(status.c2.authTokenConfigured)} />
            <Field k="console URL" v={status.c2.consoleUrl ?? "-"} />
            <Field k="cache TTL (ms)" v={status.c2.cacheTtlMs} />
          </div>

          <div className="card">
            <h3>C3 - provisioning + usage</h3>
            <Field k="webhook secret" v={boolBadge(status.c3.webhookSecretConfigured)} />
            <Field k="webhook rotation (_NEXT)" v={boolBadge(status.c3.webhookRotationConfigured)} />
            <Field k="internal job token" v={boolBadge(status.c3.internalJobTokenConfigured)} />
          </div>

          <div className="card">
            <h3>
              <span className={badgeClass(status.s2s.configured ? "ok" : "warn")}>
                <span className="dot" />
                {status.s2s.configured ? "ready" : "not configured"}
              </span>
              S2S token minting
            </h3>
            <Field k="issuer" v={status.s2s.issuer ?? "-"} />
            <Field k="credential" v="the C1 OIDC client (no separate S2S secret)" />
          </div>

          <div className="card">
            <h3>
              <span className={badgeClass(status.chat.resolver === "atlas" ? "ok" : "warn")}>
                <span className="dot" />
                {status.chat.resolver}
              </span>
              Chat - Atlas
            </h3>
            <Field k="atlas API" v={boolBadge(status.chat.atlasApiConfigured)} />
          </div>

          <div className="card">
            <h3>
              <span className={badgeClass(status.capability.runosApiConfigured ? "ok" : "warn")}>
                <span className="dot" />
                {status.capability.runosApiConfigured ? "configured" : "off"}
              </span>
              Capability - Runos
            </h3>
            <Field k="runos API" v={boolBadge(status.capability.runosApiConfigured)} />
            <Field k="mode" v="on-behalf-of only (its guard requires a user subject)" />
          </div>

          <div className="card">
            <h3>Data plane</h3>
            <Field
              k="database"
              v={
                <>
                  {boolBadge(status.data.database.reachable)}{" "}
                  {status.data.database.configured ? "configured" : "not configured"}
                </>
              }
            />
            {status.showInfra && status.data.database.host && (
              <Field k="db" v={`${status.data.database.role}@${status.data.database.host}/${status.data.database.db}`} />
            )}
            <Field
              k="redis"
              v={
                <>
                  {boolBadge(status.data.redis.reachable)}{" "}
                  {status.data.redis.configured ? "configured" : "not configured"}
                </>
              }
            />
            {status.showInfra && status.data.redis.host && <Field k="host" v={status.data.redis.host} />}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: "1.6rem" }}>
        <h3>Live channel probes</h3>
        {probes.map((p) => (
          <Field key={p.endpoint} k={`${p.name} (${p.endpoint})`} v={p.status} />
        ))}
      </div>

      <footer className="page-links">
        <a href="/entitlement-matrix">-&gt; tier x status gating matrix</a>
        <a href="/chat">-&gt; chat capability verification</a>
        <a href="/platform-check">-&gt; Atlas/Runos platform check</a>
      </footer>
    </main>
  );
}
