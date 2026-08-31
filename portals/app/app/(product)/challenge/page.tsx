"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeUrl } from "../../entitlement/deeplink";
import { formatScoreMs } from "../../game/rules";
import { GameView, type GameFinish } from "./game-view";

// The challenge surface as a fullscreen command deck (owner's reference: the
// amber-on-charcoal data-viz dashboard). The page is a fixed overlay - the
// product chrome stays behind it, EXIT is the way back - and every state
// (idle, countdown, run, result) lives on the same deck so play never changes
// rooms. The centerpiece is the glowing orb: the start control when idle, the
// score when done - exactly the role the big center orb plays in the
// reference design.
//
// Every gate the page shows is the server's answer rendered, never re-derived
// locally. Pricing never appears; conversion exits deep-link to the console.

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
  return tier ? tier.toUpperCase() : "NO SUBSCRIPTION";
}

function resetsIn(resetsAt: string): string {
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** The daily allowance as deck tick-bars: spent ones dim, the rest glow. */
function QuotaTicks({ quota }: { quota: Quota }) {
  if (quota.cap === UNLIMITED) {
    return <div className="deck-panel__value">UNLIMITED</div>;
  }
  if (quota.cap > 20) {
    return (
      <div className="deck-panel__value">
        {quota.remaining}
        <span className="deck-panel__dim"> / {quota.cap}</span>
      </div>
    );
  }
  return (
    <div className="deck-ticks" title={`${quota.remaining} of ${quota.cap} runs left today (resets 00:00 UTC)`}>
      {Array.from({ length: quota.cap }, (_, i) => (
        <i key={i} className={i < quota.usedToday ? "deck-tick deck-tick--spent" : "deck-tick"} />
      ))}
    </div>
  );
}

export default function ChallengePage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [ctx, setCtx] = useState<GameContext | null>(null);
  const [ticket, setTicket] = useState<RunTicket | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);

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

  function toggleFullscreen() {
    const el = deckRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => undefined);
    }
  }

  const quotaExhausted = ctx != null && ctx.quota.cap !== UNLIMITED && ctx.quota.remaining === 0;
  const noAccess = ctx != null && !ctx.gates.play;
  const playing = (phase === "playing" || phase === "submitting") && ticket != null;

  return (
    <div ref={deckRef} className="deck">
      <div className="deck__field" aria-hidden />

      <header className="deck-top">
        <div className="deck-top__side">
          <a className="deck-exit" href="/">
            &lt; EXIT
          </a>
          {ctx && !noAccess && (
            <div className="deck-panel">
              <div className="deck-panel__title">Runs today</div>
              <QuotaTicks quota={ctx.quota} />
            </div>
          )}
        </div>

        <div className="deck-title">
          <div className="deck-title__text">The 20-Second Challenge</div>
          <div className="deck-title__sub">{ctx ? tierLabel(ctx.tier) : "SYNCING"}</div>
        </div>

        <div className="deck-top__side deck-top__side--right">
          {ctx && (
            <div className="deck-panel deck-panel-right">
              <div className="deck-panel__title">Personal best</div>
              <div className="deck-panel__value">
                {ctx.best ? `${formatScoreMs(ctx.best.scoreMs)}s` : "--.--"}
              </div>
            </div>
          )}
          <button className="deck-iconbtn" onClick={toggleFullscreen} title="Toggle fullscreen" aria-label="Toggle fullscreen">
            [ ]
          </button>
        </div>
      </header>

      <div className="deck-stage">
        {phase === "loading" && !error && <div className="deck-status">SYNCING...</div>}

        {phase === "signed-out" && (
          <div className="deck-dialog">
            <div className="deck-dialog__title">Sign in to play</div>
            <p className="deck-dialog__body">
              Runs, quota and records belong to your workspace, so the challenge needs you signed in.
            </p>
            <a className="deck-btn deck-btn-solid" href="/auth/login?returnTo=/challenge">
              SIGN IN
            </a>
          </div>
        )}

        {noAccess && ctx && (
          <div className="deck-dialog">
            <div className="deck-dialog__title">No subscription covers the challenge</div>
            <p className="deck-dialog__body">
              The free tier already includes daily runs - it just has to be active for this workspace.
            </p>
            <a
              className="deck-btn deck-btn-solid"
              href={subscribeUrl({ intent: ctx.cta === "renew" || ctx.cta === "pay" ? "renew" : "upgrade" })}
            >
              {ctx.cta === "pay" ? "FIX PAYMENT" : ctx.cta === "renew" ? "RENEW" : "SUBSCRIBE"}
            </a>
          </div>
        )}

        {playing && ticket && <GameView seed={ticket.seed} onFinish={finish} />}

        {phase === "idle" && ctx && !noAccess && (
          <div className="deck-center">
            {quotaExhausted ? (
              <>
                <div className="deck-orb deck-orb--spent" aria-hidden>
                  <div className="deck-orb__label">OUT OF</div>
                  <div className="deck-orb__big">RUNS</div>
                  <div className="deck-orb__sub">for today</div>
                </div>
                <p className="deck-dialog__body">
                  {ctx.quota.cap} runs a day on the free tier. Resets 00:00 UTC - in {resetsIn(ctx.quota.resetsAt)}.
                  Starter removes the daily limit.
                </p>
                <a className="deck-btn deck-btn-solid" href={subscribeUrl({ intent: "upgrade", targetTier: "starter" })}>
                  MOVE TO STARTER
                </a>
              </>
            ) : (
              <>
                <button className="deck-orb" onClick={start}>
                  <div className="deck-orb__label">READY</div>
                  <div className="deck-orb__big">START</div>
                  <div className="deck-orb__sub">survive 20.00s</div>
                </button>
                <p className="deck-hintline">
                  Everything is aimed at you and flies straight. Keep moving - a shot can never turn.
                </p>
              </>
            )}
          </div>
        )}

        {phase === "result" && result && (
          <div className="deck-center">
            <div className={result.outcome === "survived" ? "deck-orb deck-orb--win" : "deck-orb deck-orb--score"} aria-hidden>
              <div className="deck-orb__label">{result.outcome === "survived" ? "SURVIVED" : "HIT AT"}</div>
              <div className="deck-orb__big">{formatScoreMs(result.scoreMs)}</div>
              <div className="deck-orb__sub">seconds{result.isPersonalBest ? " - new best" : ""}</div>
            </div>
            <div className="deck-actions">
              {quotaExhausted ? (
                <a className="deck-btn deck-btn-solid" href={subscribeUrl({ intent: "upgrade", targetTier: "starter" })}>
                  OUT OF RUNS - MOVE TO STARTER
                </a>
              ) : (
                <button className="deck-btn deck-btn-solid" onClick={start}>
                  RUN IT AGAIN
                </button>
              )}
              {ctx?.gates.history ? (
                <a className="deck-btn" href="/records">
                  YOUR RECORD
                </a>
              ) : (
                <a className="deck-btn" href={subscribeUrl({ intent: "upgrade", targetTier: "starter" })}>
                  KEEP A RECORD (STARTER)
                </a>
              )}
              {ctx?.gates.leaderboard && (
                <a className="deck-btn" href="/leaderboard">
                  GLOBAL BOARD
                </a>
              )}
            </div>
          </div>
        )}

        {error && <p className="deck-error">{error}</p>}
      </div>

      <footer className="deck-bottom">
        <div className="deck-bottom__frame" aria-hidden />
        <div className="deck-hint">ARROW KEYS TO MOVE / ONE HIT ENDS THE RUN</div>
      </footer>
    </div>
  );
}
