"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Section, Stack, StatusBadge } from "../../ds";
import { subscribeUrl } from "../../entitlement/deeplink";
import { formatScoreMs, type TrendPoint } from "../../game/rules";
import type { Tier } from "../../entitlement/types";
import { TrendChart } from "./trend-chart";

// The personal record: best three pinned for life, recent runs in the window
// the tier pays for, and - on pro - the 30-day trend. The locked states render
// the SHAPE of what is missing (a ghost podium, a ghost curve), because "here
// is the thing you would have" sells the step better than a paragraph.

interface RunJson {
  scoreMs: number | null;
  outcome: "survived" | "hit" | null;
  playedAt: string;
}

interface RecordsData {
  allowed: boolean;
  requiredTier?: Tier | null;
  requiredTierForTrend?: Tier | null;
  window?: { kind: "last10"; limit: number } | { kind: "days30"; days: number };
  top?: RunJson[];
  recent?: RunJson[];
  trend?: TrendPoint[] | null;
  trendAllowed?: boolean;
}

type Phase = "loading" | "signed-out" | "ready";

const MEDALS = ["1st", "2nd", "3rd"];

function RunScore({ run }: { run: RunJson }) {
  return (
    <span className="mono">
      {run.scoreMs != null ? `${formatScoreMs(run.scoreMs)}s` : "-"}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: RunJson["outcome"] }) {
  if (outcome === "survived") {
    return (
      <StatusBadge tone="success" dot>
        Survived
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone="neutral" dot>
      Hit
    </StatusBadge>
  );
}

/** The all-time podium. Three slots always render - an empty slot is an
 * invitation, not an error. */
function Podium({ top }: { top: RunJson[] }) {
  return (
    <div className="podium">
      {[0, 1, 2].map((i) => {
        const run = top[i];
        return (
          <div key={i} className={i === 0 ? "podium__card podium__card--first" : "podium__card"}>
            <div className="podium__rank">{MEDALS[i]}</div>
            {run ? (
              <>
                <div className="podium__score mono">
                  {formatScoreMs(run.scoreMs ?? 0)}
                  <span className="podium__unit">s</span>
                </div>
                <div className="podium__meta">
                  {new Date(run.playedAt).toLocaleDateString()}{" "}
                  {new Date(run.playedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                {run.outcome === "survived" && <OutcomeBadge outcome="survived" />}
              </>
            ) : (
              <div className="podium__empty">unclaimed</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RecordsPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<RecordsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/game/records", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 503) {
          setPhase("signed-out");
          return;
        }
        setData((await r.json()) as RecordsData);
        setPhase("ready");
      })
      .catch(() => setError("failed to load your record"));
  }, []);

  const windowLabel =
    data?.window?.kind === "days30" ? `last ${data.window.days} days` : data?.window?.kind === "last10" ? `last ${data.window.limit} runs` : "";

  return (
    <main className="page">
      <Stack gap="xs">
        <div className="eyebrow">Your record</div>
        <Section
          level={1}
          title="Runs and records"
          description={
            <span className="block max-w-[62ch]">
              Best three pinned for life; the recent window is what your tier keeps
              {windowLabel ? ` (${windowLabel})` : ""}. Times are shown in your local time.
            </span>
          }
        >
          {phase === "signed-out" && (
            <Card>
              <CardHeader>
                <CardTitle>Sign in to see your record</CardTitle>
                <CardDescription>Records belong to your workspace, so this page needs a session.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <a href="/auth/login?returnTo=/records">Sign in</a>
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === "ready" && data && !data.allowed && (
            <Stack gap="md">
              <div className="podium podium--ghost" aria-hidden>
                {MEDALS.map((m) => (
                  <div key={m} className="podium__card">
                    <div className="podium__rank">{m}</div>
                    <div className="podium__score mono">--.--</div>
                    <div className="podium__meta">kept from Starter up</div>
                  </div>
                ))}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Your record starts at Starter</CardTitle>
                  <CardDescription>
                    Free plays every day, but nothing is kept. Starter records your last 10 runs with the best
                    three pinned - time and date included. Pro widens the window to 30 days with a trend view.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <a href={subscribeUrl({ intent: "upgrade", targetTier: data.requiredTier ?? "starter" })}>
                      Move to Starter
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </Stack>
          )}

          {phase === "ready" && data?.allowed && (
            <Stack gap="lg">
              <Podium top={data.top ?? []} />

              {data.trendAllowed ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Daily best - {windowLabel}</CardTitle>
                    <CardDescription>Hover a day for the mean and the run count.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TrendChart points={data.trend ?? []} windowDays={30} />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>The trend view opens at Pro</CardTitle>
                    <CardDescription>
                      Pro extends your record from the last 10 runs to the last 30 days and draws the daily-best
                      curve over it - plus the global leaderboard.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild>
                      <a href={subscribeUrl({ intent: "upgrade", targetTier: data.requiredTierForTrend ?? "pro" })}>
                        Move to Pro
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div>
                <h2 style={{ fontSize: "1.05rem", marginBottom: "0.6rem" }}>Recent runs ({windowLabel})</h2>
                {data.recent && data.recent.length > 0 ? (
                  <div className="table-wrap">
                    <table className="ref">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Score</th>
                          <th>Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent.map((r, i) => (
                          <tr key={i}>
                            <td>{new Date(r.playedAt).toLocaleDateString()}</td>
                            <td>{new Date(r.playedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                            <td>
                              <RunScore run={r} />
                            </td>
                            <td>
                              <OutcomeBadge outcome={r.outcome} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="trend-empty">No finished runs in the window yet.</p>
                )}
              </div>
            </Stack>
          )}

          {error && <p style={{ color: "var(--vxtpl-danger)", fontSize: "0.86rem" }}>{error}</p>}
        </Section>
      </Stack>

      <footer className="page-links">
        <a href="/challenge">-&gt; back to the arena</a>
        <a href="/leaderboard">-&gt; global board</a>
      </footer>
    </main>
  );
}
