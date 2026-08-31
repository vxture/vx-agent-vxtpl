"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StatusBadge } from "../../ds";
import { subscribeUrl } from "../../entitlement/deeplink";
import { formatScoreMs } from "../../game/rules";
import { GameView, type GameFinish } from "./game-view";

// The challenge surface: the whole subscription design, playable. One GET
// paints the tier, the quota and the personal best; starting a run spends
// quota on the server; finishing records the score. Every gate the page shows
// is the server's answer rendered, never re-derived locally.

const UNLIMITED = -1;

interface Quota {
  cap: number;
  usedToday: number;
  remaining: number;
  resetsAt: string;
}

interface GameContext {
  tier: string | null;
  cta: "subscribe" | "pay" | "renew" | "none";
  gates: { play: boolean; history: boolean; leaderboard: boolean; trend: boolean };
  requiredTiers: { unlimitedRuns: string | null; history: string | null; leaderboard: string | null };
  quota: Quota;
  best: { scoreMs: number } | null;
}

interface RunTicket {
  runId: string;
  seed: string;
}

interface FinishResult {
  outcome: "survived" | "hit";
  scoreMs: number;
  isPersonalBest: boolean;
}

type Phase = "loading" | "signed-out" | "idle" | "playing" | "submitting" | "result";

function tierLabel(tier: string | null): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "No subscription";
}

function resetsIn(resetsAt: string): string {
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** The daily allowance, drawn as pips: spent ones dim, the remainder glows.
 * Ten dots say "10 a day" faster than any sentence - and starter's badge says
 * the other thing just as fast. */
function QuotaPips({ quota }: { quota: Quota }) {
  if (quota.cap === UNLIMITED) {
    return (
      <StatusBadge tone="brand" dot>
        Unlimited runs
      </StatusBadge>
    );
  }
  if (quota.cap > 20) {
    return (
      <span className="quota-text">
        {quota.remaining} of {quota.cap} runs left today
      </span>
    );
  }
  return (
    <span className="quota-pips" title={`${quota.remaining} of ${quota.cap} runs left today (resets 00:00 UTC)`}>
      {Array.from({ length: quota.cap }, (_, i) => (
        <i key={i} className={i < quota.usedToday ? "pip pip--spent" : "pip"} />
      ))}
      <span className="quota-text">
        {quota.remaining} left today
      </span>
    </span>
  );
}

export default function ChallengePage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [ctx, setCtx] = useState<GameContext | null>(null);
  const [ticket, setTicket] = useState<RunTicket | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    const r = await fetch("/api/game", { cache: "no-store" });
    if (r.status === 401 || r.status === 503) {
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      setPhase("signed-out");
      setError(body.error ?? "sign in to play");
      return null;
    }
    const data = (await r.json()) as GameContext;
    setCtx(data);
    return data;
  }, []);

  useEffect(() => {
    loadContext()
      .then((data) => {
        if (data) setPhase("idle");
      })
      .catch(() => setError("failed to load the challenge context"));
  }, [loadContext]);

  async function start() {
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/game/run", { method: "POST" });
      const body = (await r.json()) as RunTicket & { error?: string; quota?: Quota };
      if (r.status === 429) {
        setCtx((c) => (c && body.quota ? { ...c, quota: body.quota } : c));
        setPhase("idle");
        return;
      }
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setCtx((c) => (c && body.quota ? { ...c, quota: body.quota } : c));
      setTicket({ runId: body.runId, seed: body.seed });
      setPhase("playing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start the run");
    }
  }

  async function finish(f: GameFinish) {
    if (!ticket) return;
    setPhase("submitting");
    try {
      const r = await fetch("/api/game/run/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: ticket.runId, scoreMs: f.scoreMs }),
      });
      const body = (await r.json()) as FinishResult & { error?: string; best?: { scoreMs: number } | null };
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setResult({ outcome: body.outcome, scoreMs: body.scoreMs, isPersonalBest: body.isPersonalBest });
      setCtx((c) => (c ? { ...c, best: body.best ?? c.best } : c));
    } catch (err) {
      // The run still happened for the player; show their score with the
      // recording failure attached rather than pretending nothing occurred.
      setResult({ outcome: f.outcome, scoreMs: f.scoreMs, isPersonalBest: false });
      setError(err instanceof Error ? `recording failed: ${err.message}` : "recording failed");
    } finally {
      setTicket(null);
      setPhase("result");
    }
  }

  const quotaExhausted = ctx != null && ctx.quota.cap !== UNLIMITED && ctx.quota.remaining === 0;
  const noAccess = ctx != null && !ctx.gates.play;

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.7rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.7rem" }}>The 20-Second Challenge</h1>
        <StatusBadge tone={ctx?.tier ? "brand" : "neutral"} dot>
          {ctx ? tierLabel(ctx.tier) : "..."}
        </StatusBadge>
      </div>
      <p className="lede">
        Dodge everything, from every direction, for twenty seconds. Mouse, touch, or arrow keys - the run
        ends on the first hit.
      </p>

      {phase === "signed-out" && (
        <Card style={{ marginTop: "1.4rem" }}>
          <CardHeader>
            <CardTitle>Sign in to play</CardTitle>
            <CardDescription>
              Runs, quota and records belong to your workspace, so the challenge needs you signed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/auth/login?returnTo=/challenge">Sign in</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {noAccess && ctx && (
        <Card style={{ marginTop: "1.4rem" }}>
          <CardHeader>
            <CardTitle>No subscription covers the challenge</CardTitle>
            <CardDescription>
              The free tier already includes daily runs - it just has to be active for this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href={subscribeUrl({ intent: ctx.cta === "renew" || ctx.cta === "pay" ? "renew" : "upgrade" })}>
                {ctx.cta === "pay" ? "Fix payment" : ctx.cta === "renew" ? "Renew" : "Subscribe"}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {ctx && !noAccess && phase !== "signed-out" && (
        <div style={{ marginTop: "1.4rem" }}>
          {/* Status strip: quota on the left, personal best on the right. Always
              visible - during play it is the one non-arena thing worth a glance. */}
          <div className="arena-strip">
            <QuotaPips quota={ctx.quota} />
            <span className="quota-text" style={{ marginLeft: "auto" }}>
              {ctx.best ? `personal best ${formatScoreMs(ctx.best.scoreMs)}s` : "no runs yet"}
            </span>
          </div>

          {(phase === "playing" || phase === "submitting") && ticket ? (
            <GameView seed={ticket.seed} onFinish={finish} />
          ) : phase === "submitting" || (phase === "result" && result) ? null : (
            <div className="arena-idle">
              {quotaExhausted ? (
                <>
                  <div className="arena-idle__title">Out of runs for today</div>
                  <p className="arena-idle__body">
                    The free tier includes {ctx.quota.cap} runs a day. Quota resets at 00:00 UTC - in{" "}
                    {resetsIn(ctx.quota.resetsAt)}. Starter removes the daily limit.
                  </p>
                  <Button asChild>
                    <a href={subscribeUrl({ intent: "upgrade", targetTier: "starter" })}>Move to Starter</a>
                  </Button>
                </>
              ) : (
                <>
                  <div className="arena-idle__title">Ready?</div>
                  <p className="arena-idle__body">
                    Twenty seconds on the clock. The field thickens as it counts - the last five are the run.
                  </p>
                  <Button onClick={start}>Start the challenge</Button>
                </>
              )}
            </div>
          )}

          {phase === "result" && result && (
            <div className="arena-result">
              <div className={result.outcome === "survived" ? "arena-result__score arena-result__score--win" : "arena-result__score"}>
                {formatScoreMs(result.scoreMs)}
                <span className="arena-result__unit">s</span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                <StatusBadge tone={result.outcome === "survived" ? "success" : "neutral"} dot>
                  {result.outcome === "survived" ? "Survived" : `Hit at ${formatScoreMs(result.scoreMs)}s`}
                </StatusBadge>
                {result.isPersonalBest && (
                  <StatusBadge tone="brand" dot>
                    New personal best
                  </StatusBadge>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", justifyContent: "center" }}>
                {quotaExhausted ? (
                  <Button asChild>
                    <a href={subscribeUrl({ intent: "upgrade", targetTier: "starter" })}>
                      Out of runs - move to Starter
                    </a>
                  </Button>
                ) : (
                  <Button onClick={start}>Run it again</Button>
                )}
                {ctx.gates.history ? (
                  <Button variant="outline" asChild>
                    <a href="/records">View your record</a>
                  </Button>
                ) : (
                  <Button variant="outline" asChild>
                    <a href={subscribeUrl({ intent: "upgrade", targetTier: "starter" })}>
                      Keep a record (Starter)
                    </a>
                  </Button>
                )}
                {ctx.gates.leaderboard && (
                  <Button variant="outline" asChild>
                    <a href="/leaderboard">Global board</a>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p style={{ color: "var(--vxtpl-danger)", fontSize: "0.86rem", marginTop: "0.7rem" }}>{error}</p>}

      <footer className="page-links">
        <a href="/records">-&gt; your record</a>
        <a href="/leaderboard">-&gt; global board</a>
        <a href="/entitlement-matrix">-&gt; how the tiers gate</a>
      </footer>
    </main>
  );
}
