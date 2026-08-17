import { BRAND } from "@vxtpl/shared/brand";
import { Card, CardDescription, CardHeader, CardTitle, Grid, Section, Stack } from "../ds";
import { serviceIdentity } from "@vxture/shared";

const CARDS = [
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
 * The entry page: the product's own introduction, and one card per surface it
 * exposes.
 *
 * THE CARDS ARE LINKS, and the design system's `Card` is a div that takes no
 * `as` / `asChild` - so the anchor stays the grid item and the card fills it
 * rather than replacing it. `height: 100%` is what that costs: the grid used to
 * stretch `.card` itself, and a card nested one level inside the link no longer
 * inherits that, so a row would come out ragged. The accent title stays for the
 * same reason the anchor does - it is the only mark on a card that says it goes
 * somewhere.
 *
 * The track list is deliberately NOT `Grid`'s. `columns` compiles to a fixed
 * `grid-cols-N` at every width, which for four cards on a phone is four 66px
 * columns; auto-fit is what lets the row reflow, and the DS has no prop that
 * says it. So `Grid` supplies the display and the spacing token, and the one
 * thing it cannot express stays inline.
 */
export default function HomePage() {
  const { gitSha } = serviceIdentity({ service: `${BRAND.productCode}-app`, product: BRAND.productCode });
  return (
    <main className="page">
      <Stack gap="xs">
        <div className="eyebrow">Vxture product</div>
        <Section
          level={1}
          title={BRAND.displayName}
          description={
            <span className="block max-w-[62ch]">
              A deployed Vxture product that signs users in against the central accounts service, gates them by
              subscription tier, and calls Atlas and Runos for real work - and the reference build every new Vxture
              product is copied from. Build <code>{gitSha}</code>.
            </span>
          }
        >
          <Grid columns={4} gap="md" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {CARDS.map((c) => (
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
    </main>
  );
}
