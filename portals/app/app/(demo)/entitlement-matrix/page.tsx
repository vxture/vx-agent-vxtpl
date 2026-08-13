import { TIERS, SUBSCRIPTION_STATUSES, hasProductAccess, hasDataAccess, ctaFor } from "../../entitlement/types";
import type { Tier, SubscriptionStatus } from "../../entitlement/types";
import { makeEntitlement } from "../../entitlement/resolver";

// Subscription-tier verification (product_240 section 7): the five tiers x six
// statuses (plus the null / bundled-only edge cases) with their gate + CTA
// outcomes. Pure functions, fully offline - no platform, no session.
export const dynamic = "force-static";

interface Row {
  label: string;
  tier: Tier | null;
  status: SubscriptionStatus | null;
  bundled: boolean;
}

function rows(): Row[] {
  const out: Row[] = [];
  for (const tier of TIERS) {
    for (const status of SUBSCRIPTION_STATUSES) {
      out.push({ label: `${tier} / ${status}`, tier, status, bundled: false });
    }
  }
  out.push({ label: "null / null (never subscribed)", tier: null, status: null, bundled: false });
  out.push({ label: "bundled only (no direct purchase)", tier: null, status: null, bundled: true });
  return out;
}

function yesNo(b: boolean) {
  return (
    <span className={b ? "badge badge-ok" : "badge badge-neutral"}>
      <span className="dot" />
      {b ? "yes" : "no"}
    </span>
  );
}

export default function EntitlementMatrixPage() {
  const data = rows().map((r) => {
    const e = makeEntitlement("ws_demo", "__PRODUCT_CODE__", { tier: r.tier, status: r.status, bundled: r.bundled });
    return { ...r, productAccess: hasProductAccess(e), dataAccess: hasDataAccess(e), cta: ctaFor(e) };
  });
  return (
    <main className="page">
      <div className="eyebrow">Verification surface</div>
      <h1 style={{ fontSize: "1.8rem", marginTop: "0.4rem" }}>Entitlement gating matrix</h1>
      <p className="lede">
        Offline demonstration of the C2 gating and CTA rules (product_220 section 3). UI gate ={" "}
        <code>tier != null</code>; data gate = <code>tier != null || bundled</code>.
      </p>
      <div className="table-wrap" style={{ marginTop: "1.4rem" }}>
        <table className="ref">
          <thead>
            <tr>
              <th>tier / status (bundled)</th>
              <th>UI access</th>
              <th>data access</th>
              <th>CTA</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.label}>
                <td>
                  {r.label}
                  {r.bundled ? " [bundled]" : ""}
                </td>
                <td>{yesNo(r.productAccess)}</td>
                <td>{yesNo(r.dataAccess)}</td>
                <td>
                  <span className="mono">{r.cta}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="page-links">
        <a href="/status">-&gt; integration status</a>
        <a href="/chat">-&gt; chat capability verification</a>
      </footer>
    </main>
  );
}
