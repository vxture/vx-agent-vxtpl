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

const card: React.CSSProperties = {
  border: "1px solid #d0d0d0",
  borderRadius: 8,
  padding: "12px 16px",
  margin: "0 0 12px",
  maxWidth: 760,
};
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "2px 0", gap: 16 };
const key: React.CSSProperties = { color: "#555" };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, monospace", wordBreak: "break-all", textAlign: "right" };

function badge(state: "ok" | "warn" | "bad" | "na"): string {
  return { ok: "\u{1F7E2}", warn: "\u{1F7E1}", bad: "\u{1F534}", na: "➖" }[state];
}
function boolBadge(b: boolean | null | undefined): string {
  if (b === null || b === undefined) return badge("na");
  return b ? badge("ok") : badge("bad");
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={row}>
      <span style={key}>{k}</span>
      <span style={mono}>{v}</span>
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
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", lineHeight: 1.5 }}>
      <h1>Integration status</h1>
      {gate && <p>{gate}</p>}

      {status && (
        <>
          <section style={card}>
            <h3 style={{ margin: "0 0 8px" }}>Identity</h3>
            <Field k="product" v={status.identity.productCode} />
            <Field k="build" v={status.identity.gitSha} />
            <Field k="env" v={status.identity.appEnv} />
          </section>

          <section style={card}>
            <h3 style={{ margin: "0 0 8px" }}>
              {status.c1.enabled ? badge("ok") : badge("warn")} C1 - OIDC RP
            </h3>
            <Field k="RP enabled" v={status.c1.enabled ? "on" : "off"} />
            <Field k="issuer" v={status.c1.issuer ?? "-"} />
            <Field k="client_id" v={status.c1.clientId ?? "-"} />
            <Field k="redirect_uri" v={status.c1.redirectUri ?? "-"} />
            <Field k="scopes" v={status.c1.scopes ?? "-"} />
            <Field k="cookie" v={status.c1.cookieName ?? "-"} />
            <Field k="client secret" v={`${boolBadge(status.c1.clientSecretConfigured)} configured`} />
          </section>

          <section style={card}>
            <h3 style={{ margin: "0 0 8px" }}>
              {status.c2.resolver === "platform" ? badge("ok") : badge("warn")} C2 - entitlement
            </h3>
            <Field k="resolver" v={status.c2.resolver} />
            <Field k="platform API" v={`${boolBadge(status.c2.platformApiConfigured)} configured`} />
            <Field k="internal-auth token" v={`${boolBadge(status.c2.authTokenConfigured)} configured`} />
            <Field k="console URL" v={status.c2.consoleUrl ?? "-"} />
            <Field k="cache TTL (ms)" v={status.c2.cacheTtlMs} />
          </section>

          <section style={card}>
            <h3 style={{ margin: "0 0 8px" }}>C3 - provisioning + usage</h3>
            <Field k="webhook secret" v={`${boolBadge(status.c3.webhookSecretConfigured)} configured`} />
            <Field k="webhook rotation (_NEXT)" v={`${boolBadge(status.c3.webhookRotationConfigured)} configured`} />
            <Field k="internal job token" v={`${boolBadge(status.c3.internalJobTokenConfigured)} configured`} />
          </section>

          <section style={card}>
            <h3 style={{ margin: "0 0 8px" }}>
              {status.chat.resolver === "atlas" ? badge("ok") : badge("warn")} Chat - Atlas
            </h3>
            <Field k="resolver" v={status.chat.resolver} />
            <Field k="atlas API" v={`${boolBadge(status.chat.atlasApiConfigured)} configured`} />
            <Field k="S2S token" v={`${boolBadge(status.chat.atlasTokenConfigured)} configured`} />
          </section>

          <section style={card}>
            <h3 style={{ margin: "0 0 8px" }}>Data plane</h3>
            <Field
              k="database"
              v={`${boolBadge(status.data.database.reachable)} ${status.data.database.configured ? "configured" : "not configured"}${status.data.database.reachable === null ? " (not probed)" : status.data.database.reachable ? ", reachable" : ", unreachable"}`}
            />
            {status.showInfra && status.data.database.host && (
              <Field k="  db" v={`${status.data.database.role}@${status.data.database.host}/${status.data.database.db}`} />
            )}
            <Field
              k="redis"
              v={`${boolBadge(status.data.redis.reachable)} ${status.data.redis.configured ? "configured" : "not configured"}${status.data.redis.reachable === null ? " (not probed)" : status.data.redis.reachable ? ", reachable" : ", unreachable"}`}
            />
            {status.showInfra && status.data.redis.host && <Field k="  host" v={status.data.redis.host} />}
          </section>
        </>
      )}

      <section style={card}>
        <h3 style={{ margin: "0 0 8px" }}>Live channel probes</h3>
        {probes.map((p) => (
          <Field key={p.endpoint} k={`${p.name} (${p.endpoint})`} v={p.status} />
        ))}
      </section>

      <p>
        <a href="/entitlement-matrix">-&gt; tier x status gating matrix</a>
        {" | "}
        <a href="/chat">-&gt; chat capability verification</a>
      </p>
    </main>
  );
}
