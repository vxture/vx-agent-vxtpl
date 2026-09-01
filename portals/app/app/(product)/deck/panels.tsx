"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeUrl } from "../../entitlement/deeplink";
import { formatScoreMs, type TrendPoint } from "../../game/rules";
import type { Tier } from "../../entitlement/types";
import { TrendChart } from "./trend-chart";

// The deck's side modules: records and the global board, folded into the one
// screen the app has (owner decision 2026-08-31 - single interface; the old
// /records and /leaderboard pages are gone). Each module is self-contained:
// it fetches its own API on first open and again when `epoch` bumps (a
// finished run), and renders its own locked state - the tier ladder is sold
// where the data would be, not on a separate page.

interface RunJson {
  scoreMs: number | null;
  outcome: "survived" | "hit" | null;
  playedAt: string;
}

interface RecordsData {
  allowed: boolean;
  requiredTier?: Tier | null;
  requiredTierForTrend?: Tier | null;
  window?: { kind: "last10"; limit: number } | { kind: "season" };
  season?: { key: string; label: string; startsAt: string; endsAt: string };
  top?: RunJson[];
  recent?: RunJson[];
  trend?: TrendPoint[] | null;
  trendAllowed?: boolean;
}

interface BoardEntry {
  rank: number;
  callSign: string;
  scoreMs: number;
  qualified: boolean;
  achievedAt: string;
  you: boolean;
}

interface BoardData {
  allowed: boolean;
  requiredTier?: Tier | null;
  season?: { key: string; label: string; endsAt: string };
  seasonEntries?: BoardEntry[];
  allTimeEntries?: BoardEntry[];
  me?: { callSign: string; bestMs: number | null };
}

const RANKS = ["1st", "2nd", "3rd"];

/** Module shell: glowing-dot header bar with a fold toggle, deck-styled. */
export function DeckModule({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="deck-mod">
      <button className="deck-mod__head" onClick={onToggle} aria-expanded={open}>
        <i className="deck-mod__dot" aria-hidden />
        <span className="deck-mod__title">{title}</span>
        <span className="deck-mod__toggle" aria-hidden>
          {open ? "-" : "+"}
        </span>
      </button>
      {open && <div className="deck-mod__body">{children}</div>}
    </section>
  );
}

function LockNote({ note, tier, cta }: { note: string; tier: Tier | null | undefined; cta: string }) {
  return (
    <div className="deck-lock">
      <p className="deck-lock__note">{note}</p>
      <a className="deck-btn deck-btn-solid" href={subscribeUrl({ intent: "upgrade", targetTier: tier ?? undefined })}>
        {cta}
      </a>
    </div>
  );
}

function playedAtLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/** Fetch-on-open with an epoch: a finished run bumps it and an OPEN module
 * refetches; a closed one just forgets its cache and refetches on next open. */
function useModuleData<T>(url: string, open: boolean, epoch: number): T | null {
  const [data, setData] = useState<T | null>(null);
  const fetchedEpoch = useRef(-1);
  useEffect(() => {
    if (!open || fetchedEpoch.current === epoch) return;
    fetchedEpoch.current = epoch;
    fetch(url, { cache: "no-store" })
      .then(async (r) => (r.ok || r.status === 200 ? ((await r.json()) as T) : null))
      .then((d) => d && setData(d))
      .catch(() => undefined);
  }, [url, open, epoch]);
  return data;
}

export function RecordsModule({ open, onToggle, epoch }: { open: boolean; onToggle: () => void; epoch: number }) {
  const data = useModuleData<RecordsData>("/api/game/records", open, epoch);

  return (
    <DeckModule title="Your record" open={open} onToggle={onToggle}>
      {!data && <div className="deck-mod__loading">SYNCING...</div>}

      {data && !data.allowed && (
        <LockNote
          note="Free plays every day, but nothing is kept. Starter records your last 10 runs with the best three pinned."
          tier={data.requiredTier}
          cta="MOVE TO STARTER"
        />
      )}

      {data?.allowed && (
        <>
          {/* Everything in this module is CURRENT-SEASON only (owner decision
              2026-09-01); the all-time trophy lives in the topbar chip. */}
          <div className="deck-mod__sub">{data.season?.label ?? "this season"} podium</div>
          <div className="deck-rows">
            {[0, 1, 2].map((i) => {
              const run = data.top?.[i];
              return (
                <div key={i} className="deck-row">
                  <span className="deck-row__rank">{RANKS[i]}</span>
                  {run ? (
                    <>
                      <span className="deck-row__value">{formatScoreMs(run.scoreMs ?? 0)}s</span>
                      <span className="deck-row__meta">{playedAtLabel(run.playedAt)}</span>
                    </>
                  ) : (
                    <span className="deck-row__meta">unclaimed</span>
                  )}
                </div>
              );
            })}
          </div>

          {data.trendAllowed ? (
            <div className="deck-trend">
              <div className="deck-mod__sub">Daily best - {data.season?.label ?? "this season"}</div>
              <TrendChart
                points={data.trend ?? []}
                startsAt={data.season?.startsAt ?? new Date().toISOString()}
                label={data.season?.label}
              />
            </div>
          ) : (
            <LockNote
              note="Pro widens the window to the whole season and draws the daily-best curve - plus the global board."
              tier={data.requiredTierForTrend}
              cta="MOVE TO PRO"
            />
          )}

          <div className="deck-mod__sub">
            Recent - {data.season?.label ?? "this season"}
            {data.window?.kind === "last10" ? " (last 10)" : ""}
          </div>
          {/* No display cap: the API already bounds the list (last-10 for
            * starter, RECENT_MAX for pro) and the rail body scrolls - a UI
            * slice here silently hid the season window (owner 2026-09-01). */}
          <div className="deck-rows">
            {(data.recent ?? []).map((r, i) => (
              <div key={i} className="deck-row">
                <span className={r.outcome === "survived" ? "deck-row__value deck-row__value--win" : "deck-row__value"}>
                  {formatScoreMs(r.scoreMs ?? 0)}s
                </span>
                <span className="deck-row__meta">{playedAtLabel(r.playedAt)}</span>
              </div>
            ))}
            {data.recent?.length === 0 && <div className="deck-row__meta">no finished runs yet</div>}
          </div>
        </>
      )}
    </DeckModule>
  );
}

export function BoardModule({ open, onToggle, epoch }: { open: boolean; onToggle: () => void; epoch: number }) {
  const data = useModuleData<BoardData>('/api/game/leaderboard', open, epoch);
  const [tab, setTab] = useState<'season' | 'alltime'>('season');

  const rows = (tab === 'season' ? data?.seasonEntries : data?.allTimeEntries) ?? [];

  return (
    <DeckModule title='Global board' open={open} onToggle={onToggle}>
      {!data && <div className='deck-mod__loading'>SYNCING...</div>}

      {data && !data.allowed && (
        <LockNote
          note="Pro puts your best run up against everyone's. Players appear as call signs - the board is global, identities are not."
          tier={data.requiredTier}
          cta='MOVE TO PRO'
        />
      )}

      {data?.allowed && (
        <>
          {/* Two boards, and only two (owner decision 2026-09-01): the
              CURRENT season (natural quarter) and all-time, top 100 each.
              Expired seasons are not archived - there is no third tab. */}
          <div className='deck-tabs' role='tablist'>
            <button
              className={tab === 'season' ? 'deck-tab deck-tab--active' : 'deck-tab'}
              role='tab'
              aria-selected={tab === 'season'}
              onClick={() => setTab('season')}
            >
              {data.season ? data.season.label.toUpperCase() : 'SEASON'}
            </button>
            <button
              className={tab === 'alltime' ? 'deck-tab deck-tab--active' : 'deck-tab'}
              role='tab'
              aria-selected={tab === 'alltime'}
              onClick={() => setTab('alltime')}
            >
              ALL-TIME
            </button>
          </div>
          <div className='deck-mod__sub'>
            {tab === 'season' && data.season
              ? `season ends ${new Date(data.season.endsAt).toLocaleDateString()} / top 100`
              : 'since day one / top 100'}
          </div>

          <div className='deck-rows'>
            {rows.map((e) => (
              <div key={e.rank} className={e.you ? 'deck-row deck-row-you' : 'deck-row'}>
                <span className={e.rank <= 3 ? 'deck-row__rank' : 'deck-row__rank deck-row__rank--plain'}>
                  {e.rank}
                </span>
                <span className='deck-row__sign'>{e.callSign}</span>
                <span className={e.qualified ? 'deck-row__value deck-row__value--win' : 'deck-row__value'}>
                  {formatScoreMs(e.scoreMs)}s
                </span>
              </div>
            ))}
            {rows.length === 0 && (
              <div className='deck-row__meta'>
                {tab === 'season'
                  ? 'no finished runs this season yet - the board is one run away'
                  : 'nobody has finished a run yet'}
              </div>
            )}
          </div>
          {data.me && (
            <div className='deck-mod__sub'>
              you are <span className='deck-row__sign'>{data.me.callSign}</span>
              {data.me.bestMs != null ? ` - best ${formatScoreMs(data.me.bestMs)}s` : ''}
            </div>
          )}
        </>
      )}
    </DeckModule>
  );
}

// --- identity corner: avatar with the utility menu -------------------------

interface SessionUser {
  sub?: string;
  email?: string;
  activeWorkspace?: string;
}

/** Debug/reference surfaces stay routable but live behind the avatar - the
 * app is one screen, and these are the template's service hatches, not
 * player destinations. */
const SERVICE_LINKS = [
  { href: "/chat", label: "CHAT" },
  { href: "/status", label: "STATUS" },
  { href: "/platform-check", label: "PLATFORM CHECK" },
  { href: "/entitlement-matrix", label: "ENTITLEMENT MATRIX" },
];

/** Avatar + name in a quiet frame slot (owner review: the identity strip is
 * chrome, not content - it must not compete with the arena). Clicking opens
 * the service menu. */
export function AvatarBadge() {
  const [state, setState] = useState<{ authenticated: boolean; user?: SessionUser } | null>(null);
  const [openMenu, setOpenMenu] = useState(false);

  useEffect(() => {
    fetch("/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState({ authenticated: false }));
  }, []);

  // ALWAYS the avatar (owner review 2026-09-01): reaching the deck means the
  // gate already let you through, so a SIGN IN button in the identity strip
  // is a contradiction. Without a platform session (local dev, or an expired
  // session mid-visit - where the stage shows its own sign-in dialog) the
  // badge shows the local PILOT persona and the menu carries the sign-in.
  const authed = state?.authenticated === true;
  const who = state?.user?.email ?? state?.user?.sub ?? "";
  const name = who.includes("@") ? who.split("@")[0] : who ? who.slice(0, 12) : "pilot";
  const initial = (name || "P").charAt(0).toUpperCase();

  return (
    <div className="deck-avatar-wrap">
      <button
        className="deck-id__ava"
        onClick={() => setOpenMenu((v) => !v)}
        aria-expanded={openMenu}
        aria-label="Account and service menu"
        title={who || undefined}
      >
        <span className="deck-id__circle" aria-hidden>
          {initial}
        </span>
        <span className="deck-id__name">{name.toUpperCase()}</span>
      </button>
      {openMenu && (
        <div className="deck-menu">
          {who && <div className="deck-menu__who">{who}</div>}
          {/* DEBUG, and labeled so (owner review 2026-09-01): these are the
              template's service hatches for verifying the platform channels,
              not product features - a player never needs them. */}
          <div className="deck-menu__group">DEBUG TOOLS</div>
          {SERVICE_LINKS.map((l) => (
            <a key={l.href} className="deck-menu__item" href={l.href}>
              {l.label}
            </a>
          ))}
          {authed ? (
            // POST, not a link, so a prefetch cannot sign the player out.
            <form method="post" action="/auth/logout">
              <button type="submit" className="deck-menu__item deck-menu__item--danger">
                SIGN OUT
              </button>
            </form>
          ) : (
            <a className="deck-menu__item" href="/auth/login?returnTo=/">
              SIGN IN
            </a>
          )}
        </div>
      )}
    </div>
  );
}
