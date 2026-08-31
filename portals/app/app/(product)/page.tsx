import { BRAND } from "@vxtpl/shared/brand";
import { Card, CardDescription, CardHeader, CardTitle, Grid, Section, Stack } from "../ds";
import { serviceIdentity } from "@vxture/shared";

// The entry page leads with the product - the challenge - and keeps the
// platform-reference surfaces underneath it. That order IS the product
// definition (ADR-006): vxtpl earns its keep as a game people play, and the
// reference material stays honest because it sits inside a product that has
// real users to break it.

const LADDER = [
  {
    tier: "Free",
    unlock: "Play every day",
    body: "The full arena, ten runs a day. Quota resets at 00:00 UTC.",
  },
  {
    tier: "Starter",
    unlock: "No limits, plus your record",
    body: "Unlimited runs, your last 10 kept with the best three pinned - time and date included.",
  },
  {
    tier: "Pro",
    unlock: "The board and the trend",
    body: "The global leaderboard, and 30 days of your record drawn as a daily-best curve.",
  },
];

const REFERENCE_CARDS = [
  {
    href: "/chat",
    title: "Chat",
    body: "Talk to the platform's model gateway (Atlas). Model + skill selection, gated by your subscription tier.",
  },
  {
    href: "/status",
    title: "Integration status",
    body: "Live view of every platform-integration channel (C1/C2/C3, chat/Atlas) and their configuration state.",
  },
  {
    href: "/platform-check",
    title: "Platform check",
    body: "Read-only connectivity probes against Atlas and Runos, from an agent-usage perspective.",
  },
  {
    href: "/entitlement-matrix",
    title: "Entitlement matrix",
    body: "Every tier x status combination and the gate/CTA outcome it produces - fully offline.",
  },
];

/**
 * The reference cards keep the auto-fit track list for the same reason the old
 * home page had it: `Grid`'s `columns` compiles to a fixed column count at
 * every width, and four 66px columns is what a phone would get. The cards are
 * links, so the anchor stays the grid item and the card fills it
 * (`height: 100%`), exactly as before.
 */
export default function HomePage() {
  const { gitSha } = serviceIdentity({ service: `${BRAND.productCode}-app`, product: BRAND.productCode });
  return (
    <main className="page">
      <Stack gap="xs">
        <div className="eyebrow">{BRAND.displayName} - Vxture product</div>
        <Section
          level={1}
          title="The 20-Second Challenge"
          description={
            <span className="block max-w-[62ch]">
              Dodge everything, from every direction, for twenty seconds. One hit ends the run; the clock is
              the score. Built on the Vxture platform - sign-in, tiers, quota and records are the real,
              production subscription machinery. Build <code>{gitSha}</code>.
            </span>
          }
        >
          <Stack gap="lg">
            <div className="hero-actions">
              <a className="hero-play" href="/challenge">
                Play now
              </a>
              <a className="hero-secondary" href="/leaderboard">
                Global board
              </a>
              <a className="hero-secondary" href="/records">
                Your record
              </a>
            </div>

            {/* The ladder: one card per tier, ONE unlock per step - the shape
                of the subscription design, not a price sheet. Pricing lives in
                the console; this page only says what each step opens. */}
            <Grid columns={3} gap="md" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {LADDER.map((l) => (
                <Card key={l.tier} surface="strong" style={{ height: "100%" }}>
                  <CardHeader>
                    <div className="eyebrow">{l.tier}</div>
                    <CardTitle>{l.unlock}</CardTitle>
                    <CardDescription>{l.body}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </Grid>

            <Section
              level={2}
              title="Platform reference"
              description={
                <span className="block max-w-[62ch]">
                  vxtpl is also the reference build new Vxture products are copied from. These surfaces show the
                  integration machinery the game runs on.
                </span>
              }
            >
              <Grid columns={4} gap="md" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                {REFERENCE_CARDS.map((c) => (
                  <a key={c.href} href={c.href} style={{ color: "inherit" }}>
                    <Card surface="strong" style={{ height: "100%" }}>
                      <CardHeader>
                        <CardTitle style={{ color: "var(--vxtpl-accent-ink)" }}>{c.title}</CardTitle>
                        <CardDescription>{c.body}</CardDescription>
                      </CardHeader>
                    </Card>
                  </a>
                ))}
              </Grid>
            </Section>
          </Stack>
        </Section>
      </Stack>
    </main>
  );
}
