import { BRAND } from "@product-code/shared/brand";
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

export default function HomePage() {
  const { gitSha } = serviceIdentity({ service: `${BRAND.productCode}-app`, product: BRAND.productCode });
  return (
    <main className="page">
      <div className="eyebrow">Vxture product template</div>
      <h1 style={{ fontSize: "2.2rem", marginTop: "0.5rem" }}>{BRAND.displayName}</h1>
      <p className="lede">
        A live, self-deployed capability-verification instance of the vxture-vxtpl governance template. Build{" "}
        <code>{gitSha}</code>.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginTop: "2rem",
        }}
      >
        {CARDS.map((c) => (
          <a
            key={c.href}
            href={c.href}
            className="card"
            style={{ display: "block", color: "inherit" }}
          >
            <h3 style={{ color: "var(--accent-ink)" }}>{c.title}</h3>
            <p style={{ fontSize: "0.86rem", color: "var(--slate)", lineHeight: 1.55 }}>{c.body}</p>
          </a>
        ))}
      </div>
    </main>
  );
}
