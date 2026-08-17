"use client";

import { useEffect, useState } from "react";
import { Banner, Card, CardContent, CardHeader, CardTitle, Grid, Section, StatusBadge } from "../../ds";
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

// `.card h3` laid the status pill out beside the heading text; CardTitle is a
// bare heading, so the row those two form has to be stated at each use.
const TITLE_ROW = "flex flex-wrap items-center gap-xs";

function boolBadge(b: boolean | null | undefined) {
  const unknown = b === null || b === undefined;
  return (
    <StatusBadge tone={unknown ? "neutral" : b ? "success" : "danger"} dot>
      {unknown ? "n/a" : b ? "configured" : "not configured"}
    </StatusBadge>
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
      <Section
        level={1}
        title="Integration status"
        description={<span className="block max-w-[62ch]">Non-secret config presence + live channel probes across every platform-integration surface.</span>}
      >
        {gate && <p style={{ color: "var(--vxtpl-slate)" }}>{gate}</p>}

        {status?.mockOnDeployedStage && (
          <Banner
            tone="danger"
            title="Serving mock data on a deployed stage"
            description={
              <span className="block max-w-[62ch]">
                A platform base URL is missing, so entitlement or chat is answering from a mock resolver. Everything
                below about tiers and models is fabricated. This state only persists because{" "}
                <code>ALLOW_MOCK_ON_DEPLOY=on</code> is set - without it the app refuses to start.
              </span>
            }
          />
        )}

        {status && (
          // Grid's `columns` is a fixed count; these cards claim a width and let
          // the viewport decide how many fit, which only the track list says.
          <Grid gap="md" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <Card>
              <CardHeader>
                <CardTitle>Identity</CardTitle>
              </CardHeader>
              <CardContent>
                <Field k="product" v={status.identity.productCode} />
                <Field k="build" v={status.identity.gitSha} />
                <Field k="env" v={status.identity.appEnv} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className={TITLE_ROW}>
                  <StatusBadge tone={status.c1.enabled ? "success" : "warning"} dot>
                    {status.c1.enabled ? "on" : "off"}
                  </StatusBadge>
                  C1 - OIDC RP
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Field k="issuer" v={status.c1.issuer ?? "-"} />
                <Field k="client_id" v={status.c1.clientId ?? "-"} />
                <Field k="redirect_uri" v={status.c1.redirectUri ?? "-"} />
                <Field k="scopes" v={status.c1.scopes ?? "-"} />
                <Field k="cookie" v={status.c1.cookieName ?? "-"} />
                <Field k="client secret" v={boolBadge(status.c1.clientSecretConfigured)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className={TITLE_ROW}>
                  <StatusBadge tone={status.c2.resolver === "platform" ? "success" : "warning"} dot>
                    {status.c2.resolver}
                  </StatusBadge>
                  C2 - entitlement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Field k="platform API" v={boolBadge(status.c2.platformApiConfigured)} />
                <Field k="internal-auth token" v={boolBadge(status.c2.authTokenConfigured)} />
                <Field k="console URL" v={status.c2.consoleUrl ?? "-"} />
                <Field k="cache TTL (ms)" v={status.c2.cacheTtlMs} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>C3 - provisioning + usage</CardTitle>
              </CardHeader>
              <CardContent>
                <Field k="webhook secret" v={boolBadge(status.c3.webhookSecretConfigured)} />
                <Field k="webhook rotation (_NEXT)" v={boolBadge(status.c3.webhookRotationConfigured)} />
                <Field k="internal job token" v={boolBadge(status.c3.internalJobTokenConfigured)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className={TITLE_ROW}>
                  <StatusBadge tone={status.s2s.configured ? "success" : "warning"} dot>
                    {status.s2s.configured ? "ready" : "not configured"}
                  </StatusBadge>
                  S2S token minting
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Field k="issuer" v={status.s2s.issuer ?? "-"} />
                <Field k="credential" v="the C1 OIDC client (no separate S2S secret)" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className={TITLE_ROW}>
                  <StatusBadge tone={status.chat.resolver === "atlas" ? "success" : "warning"} dot>
                    {status.chat.resolver}
                  </StatusBadge>
                  Chat - Atlas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Field k="atlas API" v={boolBadge(status.chat.atlasApiConfigured)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className={TITLE_ROW}>
                  <StatusBadge tone={status.capability.runosApiConfigured ? "success" : "warning"} dot>
                    {status.capability.runosApiConfigured ? "configured" : "off"}
                  </StatusBadge>
                  Capability - Runos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Field k="runos API" v={boolBadge(status.capability.runosApiConfigured)} />
                <Field k="mode" v="on-behalf-of only (its guard requires a user subject)" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data plane</CardTitle>
              </CardHeader>
              <CardContent>
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
                  <Field
                    k="db"
                    v={`${status.data.database.role}@${status.data.database.host}/${status.data.database.db}`}
                  />
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
              </CardContent>
            </Card>
          </Grid>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Live channel probes</CardTitle>
          </CardHeader>
          <CardContent>
            {probes.map((p) => (
              <Field key={p.endpoint} k={`${p.name} (${p.endpoint})`} v={p.status} />
            ))}
          </CardContent>
        </Card>
      </Section>

      <footer className="page-links">
        <a href="/entitlement-matrix">-&gt; tier x status gating matrix</a>
        <a href="/chat">-&gt; chat capability verification</a>
        <a href="/platform-check">-&gt; Atlas/Runos platform check</a>
      </footer>
    </main>
  );
}
