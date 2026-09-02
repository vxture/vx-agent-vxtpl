"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeUrl } from "../entitlement/deeplink";
import { formatScoreMs } from "../game/rules";
import { BRAND } from "@vxtpl/shared/brand";
import { GameView, type GameFinish } from "./deck/game-view";
import { AvatarBadge, BoardModule, RecordsModule } from "./deck/panels";

// THE app: one fullscreen command deck at `/` (owner decision 2026-08-31 -
// single interface). Reference style: the amber-on-charcoal data-viz
// dashboard, and its smart-street sibling for the collapse pattern.
//
// The collapse pattern, per the owner's re-review: the KEY information never
// folds. The topbar always carries the two live numbers on the left and the
// quiet identity strip on the right; only the secondary modules (the record,
// the board) live in the side rails. Each rail is toggled by an ARC ornament
// at the stage edge - the two thin bracket arcs from the reference design,
// embracing the stage when open and MIRRORING outward when folded, so the
// shape itself says which way it will move. The deck still folds itself:
// starting a run collapses both rails, the result unfolds them.

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
  quota: Quota;
  season?: { key: string; label: string };
  best: { scoreMs: number } | null;
  seasonBest?: { scoreMs: number } | null;
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
    <div>
      <div className="deck-panel__value">
        {quota.remaining}
        <span className="deck-panel__dim"> / {quota.cap}</span>
      </div>
      <div className="deck-ticks" title={`${quota.remaining} of ${quota.cap} runs left today (resets 00:00 UTC)`}>
        {Array.from({ length: quota.cap }, (_, i) => (
          <i key={i} className={i < quota.usedToday ? "deck-tick deck-tick--spent" : "deck-tick"} />
        ))}
      </div>
    </div>
  );
}

/** A side rail: nothing but its module. Folding takes it to zero width - the
 * key numbers live in the topbar and never move. */
function Rail({ side, folded, children }: { side: "left" | "right"; folded: boolean; children: React.ReactNode }) {
  return (
    <aside className={`deck-rail deck-rail-${side}${folded ? " deck-rail-folded" : ""}`}>
      <div className="deck-rail__body">{children}</div>
    </aside>
  );
}

/**
 * The arc toggle - the reference design's own bracket frame, made the
 * control. The art is the owner-supplied Figma export (originally cyan),
 * hue-remapped to the deck's amber and shipped as ONE static asset
 * (/deck-frame-arc.png, the left orientation): the source pack's left and
 * right files were pixel-identical, so the right side and both folded
 * states are pure CSS scaleX(-1) - one download, four poses.
 *
 * Open, the pair embraces the stage; folded, each frame mirrors and points
 * outward, toward the panel it would bring back. The slow ember pulse
 * survives (killed under prefers-reduced-motion).
 */
function ArcToggle({ side, folded, onToggle }: { side: "left" | "right"; folded: boolean; onToggle: () => void }) {
  const mirrored = side === "left" ? folded : !folded;
  return (
    <button
      className={`deck-arc deck-arc-${side}`}
      onClick={onToggle}
      aria-expanded={!folded}
      aria-label={`${folded ? "Expand" : "Collapse"} the side panels`}
    >
      <span className={mirrored ? "deck-arc__art deck-arc__art--flip" : "deck-arc__art"} aria-hidden />
    </button>
  );
}

export default function DeckPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [ctx, setCtx] = useState<GameContext | null>(null);
  const [ticket, setTicket] = useState<RunTicket | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folded, setFolded] = useState({ left: false, right: false });
  const [modOpen, setModOpen] = useState({ records: true, board: true });
  const [epoch, setEpoch] = useState(0);
  const deckRef = useRef<HTMLDivElement>(null);

  const loadContext = useCallback(async () => {
    const r = await fetch("/api/game", { cache: "no-store" });
    if (r.status === 401 || r.status === 503) {
      // The sign-in dialog says everything a visitor needs; the raw error
      // (e.g. "OIDC_RP_ENABLED is off") is operator diagnosis and belongs to
      // /api/status, not the landing (live finding 2026-09-01).
      setPhase("signed-out");
      setError(null);
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
      setFolded({ left: true, right: true }); // the arena owns the screen
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
      const body = (await r.json()) as FinishResult & {
        error?: string;
        best?: { scoreMs: number } | null;
        seasonBest?: { scoreMs: number } | null;
      };
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setResult({ outcome: body.outcome, scoreMs: body.scoreMs, isPersonalBest: body.isPersonalBest });
      setCtx((c) =>
        c ? { ...c, best: body.best ?? c.best, seasonBest: body.seasonBest ?? c.seasonBest } : c,
      );
    } catch (err) {
      // The run still happened for the player; show their score with the
      // recording failure attached rather than pretending nothing occurred.
      setResult({ outcome: f.outcome, scoreMs: f.scoreMs, isPersonalBest: false });
      setError(err instanceof Error ? `recording failed: ${err.message}` : "recording failed");
    } finally {
      setTicket(null);
      setPhase("result");
      setEpoch((e) => e + 1); // open modules refetch; closed ones on next open
      setFolded({ left: false, right: false }); // the numbers land where you played
    }
  }

  /** Leave the run: mid-run it abandons it (already spent - quota counts
   * starts); otherwise there is nothing to leave and the deck stays as it is.
   * That second half is why the EXIT button is gone (owner review
   * 2026-09-02) - at idle it was a control with no visible effect. */
  const exitRun = useCallback(() => {
    setTicket(null);
    setResult(null);
    setError(null);
    setPhase((p) => {
      if (p === "playing" || p === "submitting" || p === "result") {
        setFolded({ left: false, right: false });
        return "idle";
      }
      return p;
    });
  }, []);

  // Escape is the mid-run EXIT: during play the rails are folded, so the
  // button form of EXIT is a reach - the key is zero.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitRun();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitRun]);

  /** One click, both rails (owner review 2026-09-01): the arcs are a PAIR -
   * they embrace or release the stage together. If the two ever disagree
   * (auto events always set both, so only a mid-animation click could), any
   * open rail means the pair reads as open, and the click closes both. */
  function toggleRails() {
    setFolded((f) => {
      const anyOpen = !f.left || !f.right;
      return { left: anyOpen, right: anyOpen };
    });
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
  const signedIn = phase !== "signed-out";

  return (
    <div ref={deckRef} className="deck">
      <div className="deck__field" aria-hidden />

      {/* Topbar: the information that NEVER folds. Left, the two live
          numbers; right, the quiet identity strip - chrome, not content. */}
      <header className="deck-topbar">
        {/* Signed out, the topbar carries NO data surfaces (owner review
            2026-09-01, live finding): no placeholder chips, no persona in
            the identity strip - a visitor sees the brand, the stage dialog
            and the fullscreen control, nothing pretending to be state. */}
        <div className="deck-chips">
          {!signedIn ? null : ctx && !noAccess ? (
            <>
              <div className="deck-chip">
                <div className="deck-chip__label">Runs today</div>
                <QuotaTicks quota={ctx.quota} />
              </div>
              {/* TWO numbers, ONE line (owner review): all-time | season.
                  The meaning lives in the tooltip, not in a second row - the
                  topbar keeps its height. */}
              <div
                className="deck-chip deck-chip--wide"
                title={`all-time best ${ctx.best ? formatScoreMs(ctx.best.scoreMs) + "s" : "none"} | ${
                  ctx.season?.label ?? "season"
                } season best ${ctx.seasonBest ? formatScoreMs(ctx.seasonBest.scoreMs) + "s" : "none"}`}
              >
                <div className="deck-chip__label">Personal best</div>
                <div className="deck-panel__value">
                  {ctx.best ? `${formatScoreMs(ctx.best.scoreMs)}s` : "--.--"}
                  <span className="deck-chip__sep">|</span>
                  {ctx.seasonBest ? `${formatScoreMs(ctx.seasonBest.scoreMs)}s` : "--.--"}
                </div>
              </div>
            </>
          ) : (
            <div className="deck-chip">
              <div className="deck-chip__label">{signedIn ? "Syncing" : "Signed out"}</div>
              <div className="deck-panel__value">--.--</div>
            </div>
          )}
        </div>

        <div className="deck-title">
          <div className="deck-title__text">{BRAND.displayName}</div>
          <div className="deck-title__sub">
            THE 20-SECOND CHALLENGE
            {signedIn ? ` / ${ctx ? tierLabel(ctx.tier) : "SYNCING"}` : ""}
          </div>
        </div>

        {/* Fullscreen first, then the person - the strip reads outward from
            the stage it belongs to (owner review 2026-09-02).
            There is no EXIT button. It did nothing on the screen where it was
            usually seen: at idle there is no run to leave, so the click reset
            state that was already reset. Mid-run it did work, but mid-run the
            rails are folded and the pointer is on the arena - Escape is the
            control that hand is already near, and it stays. */}
        <div className="deck-id">
          <button
            className="deck-id__btn"
            onClick={toggleFullscreen}
            title="Toggle fullscreen"
            aria-label="Toggle fullscreen"
          >
            [ ]
          </button>
          {/* The avatar persona (and its PILOT fallback) is for the
              signed-in deck ONLY - a signed-out visitor must never see a
              name that looks like a session (live finding 2026-09-01). */}
          {signedIn && (
            <>
              <span className="deck-id__sep" aria-hidden />
              <AvatarBadge />
            </>
          )}
        </div>
      </header>

      <div className="deck-frame">
        {/* Signed out, the side rails and their arc toggles do not exist at
            all (owner review 2026-09-01): a visitor gets the stage and the
            sign-in dialog, not empty panels advertising their absence. */}
        {signedIn && (
          <Rail side="left" folded={folded.left}>
            {ctx && !noAccess ? (
              <RecordsModule
                open={modOpen.records}
                onToggle={() => setModOpen((m) => ({ ...m, records: !m.records }))}
                epoch={epoch}
              />
            ) : (
              <div className="deck-mod__loading">SYNCING...</div>
            )}
          </Rail>
        )}

        <main className="deck-main">
          {signedIn && (
            <>
              <ArcToggle side="left" folded={folded.left} onToggle={toggleRails} />
              <ArcToggle side="right" folded={folded.right} onToggle={toggleRails} />
            </>
          )}

          <div className="deck-stage">
            {phase === "loading" && !error && <div className="deck-status">SYNCING...</div>}

            {phase === "signed-out" && (
              <div className="deck-dialog">
                <div className="deck-dialog__title">Sign in to play</div>
                <p className="deck-dialog__body">
                  Runs, quota and records belong to your workspace, so the challenge needs you signed in.
                </p>
                <a className="deck-btn deck-btn-solid" href="/auth/login?returnTo=/">
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
                      {ctx.quota.cap} runs a day on the free tier. Resets 00:00 UTC - in{" "}
                      {resetsIn(ctx.quota.resetsAt)}. Starter removes the daily limit.
                    </p>
                    <a
                      className="deck-btn deck-btn-solid"
                      href={subscribeUrl({ intent: "upgrade", targetTier: "starter" })}
                    >
                      MOVE TO STARTER
                    </a>
                  </>
                ) : (
                  <>
                    <button className="deck-orb" onClick={start}>
                      <div className="deck-orb__label">READY</div>
                      <div className="deck-orb__big">START</div>
                      <div className="deck-orb__sub">20.00s qualifies</div>
                    </button>
                    <p className="deck-hintline">
                      Everything is aimed at you and flies straight. 20.00s makes the run count - after the bar,
                      every second is score.
                    </p>
                  </>
                )}
              </div>
            )}

            {phase === "result" && result && (
              <div className="deck-center">
                <div
                  className={result.outcome === "survived" ? "deck-orb deck-orb--win" : "deck-orb deck-orb--score"}
                  aria-hidden
                >
                  <div className="deck-orb__label">{result.outcome === "survived" ? "QUALIFIED" : "HIT AT"}</div>
                  <div className="deck-orb__big">{formatScoreMs(result.scoreMs)}</div>
                  <div className="deck-orb__sub">seconds{result.isPersonalBest ? " - new best" : ""}</div>
                </div>
                <div className="deck-actions">
                  {quotaExhausted ? (
                    <a
                      className="deck-btn deck-btn-solid"
                      href={subscribeUrl({ intent: "upgrade", targetTier: "starter" })}
                    >
                      OUT OF RUNS - MOVE TO STARTER
                    </a>
                  ) : (
                    <button className="deck-btn deck-btn-solid" onClick={start}>
                      RUN IT AGAIN
                    </button>
                  )}
                </div>
              </div>
            )}

            {error && <p className="deck-error">{error}</p>}
          </div>

          <footer className="deck-bottom">
            <div className="deck-bottom__frame" aria-hidden />
            <div className="deck-hint">
              {signedIn
                ? "ARROW KEYS TO MOVE / ESC TO LEAVE / 20S QUALIFIES - NO CEILING"
                : "THE 20-SECOND CHALLENGE - SIGN IN TO RUN"}
            </div>
          </footer>
        </main>

        {signedIn && (
          <Rail side="right" folded={folded.right}>
            <BoardModule
              open={modOpen.board}
              onToggle={() => setModOpen((m) => ({ ...m, board: !m.board }))}
              epoch={epoch}
            />
          </Rail>
        )}
      </div>
    </div>
  );
}
