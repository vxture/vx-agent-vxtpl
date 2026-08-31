"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Section, Stack, StatusBadge } from "../../ds";
import { subscribeUrl } from "../../entitlement/deeplink";
import { formatScoreMs } from "../../game/rules";
import type { Tier } from "../../entitlement/types";

// The global board (pro). Anonymous by construction: the API sends call signs
// derived from subs, never the subs themselves - the one cross-workspace
// surface carries nothing that maps back to an account. Your own row is the
// server's word too (`you`), not a client-side identifier comparison.

interface BoardEntry {
  rank: number;
  callSign: string;
  scoreMs: number;
  survived: boolean;
  achievedAt: string;
  you: boolean;
}

interface BoardData {
  allowed: boolean;
  requiredTier?: Tier | null;
  entries?: BoardEntry[];
  me?: { callSign: string; bestMs: number | null };
}

type Phase = "loading" | "signed-out" | "ready";

const GHOST_ROWS = [
  { rank: 1, callSign: "????-????", scoreMs: 20000 },
  { rank: 2, callSign: "????-????", scoreMs: 20000 },
  { rank: 3, callSign: "????-????", scoreMs: 19240 },
  { rank: 4, callSign: "????-????", scoreMs: 18510 },
];

export default function LeaderboardPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/game/leaderboard", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 503) {
          setPhase("signed-out");
          return;
        }
        setData((await r.json()) as BoardData);
        setPhase("ready");
      })
      .catch(() => setError("failed to load the board"));
  }, []);

  return (
    <main className="page">
      <Stack gap="xs">
        <div className="eyebrow">Global board</div>
        <Section
          level={1}
          title="Leaderboard"
          description={
            <span className="block max-w-[62ch]">
              Every player&apos;s single best run, ranked. Ties go to whoever set the time first. Players appear
              as call signs - the board is global, identities are not.
            </span>
          }
        >
          {phase === "signed-out" && (
            <Card>
              <CardHeader>
                <CardTitle>Sign in to see the board</CardTitle>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <a href="/auth/login?returnTo=/leaderboard">Sign in</a>
                </Button>
              </CardContent>
            </Card>
          )}

          {phase === "ready" && data && !data.allowed && (
            <Stack gap="md">
              <div className="board board--ghost" aria-hidden>
                {GHOST_ROWS.map((r) => (
                  <div key={r.rank} className="board-row">
                    <span className="board-row__rank">{r.rank}</span>
                    <span className="board-row__sign mono">{r.callSign}</span>
                    <span className="board-row__score mono">{formatScoreMs(r.scoreMs)}s</span>
                  </div>
                ))}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>The global board opens at Pro</CardTitle>
                  <CardDescription>
                    Free and Starter play the same arena; Pro puts your best run up against everyone&apos;s,
                    and adds the 30-day trend over your own record.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <a href={subscribeUrl({ intent: "upgrade", targetTier: data.requiredTier ?? "pro" })}>
                      Move to Pro
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </Stack>
          )}

          {phase === "ready" && data?.allowed && (
            <Stack gap="md">
              {data.entries && data.entries.length > 0 ? (
                <div className="board">
                  {data.entries.map((e) => (
                    <div key={e.rank} className={e.you ? "board-row board-row--you" : "board-row"}>
                      <span className={e.rank <= 3 ? "board-row__rank board-row__rank--medal" : "board-row__rank"}>
                        {e.rank}
                      </span>
                      <span className="board-row__sign mono">{e.callSign}</span>
                      {e.you && (
                        <StatusBadge tone="brand" dot>
                          you
                        </StatusBadge>
                      )}
                      {e.survived && (
                        <StatusBadge tone="success" dot>
                          Survived
                        </StatusBadge>
                      )}
                      <span className="board-row__date">{new Date(e.achievedAt).toLocaleDateString()}</span>
                      <span className="board-row__score mono">{formatScoreMs(e.scoreMs)}s</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="trend-empty">Nobody has finished a run yet. The board is one survivor away.</p>
              )}
              {data.me && (
                <p className="board-me">
                  You are <span className="mono">{data.me.callSign}</span>
                  {data.me.bestMs != null
                    ? ` - best ${formatScoreMs(data.me.bestMs)}s`
                    : " - no finished runs yet"}
                </p>
              )}
            </Stack>
          )}

          {error && <p style={{ color: "var(--vxtpl-danger)", fontSize: "0.86rem" }}>{error}</p>}
        </Section>
      </Stack>

      <footer className="page-links">
        <a href="/challenge">-&gt; back to the arena</a>
        <a href="/records">-&gt; your record</a>
      </footer>
    </main>
  );
}
