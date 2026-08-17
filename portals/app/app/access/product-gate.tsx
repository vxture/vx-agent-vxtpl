"use client";

import { useEffect, useRef, useState } from "react";
import { ShellBootScreen, ShellBrand } from "../ds";
import "./gate.css";
import { subscribeUrl, type Intent } from "../entitlement/deeplink";
import type { Cta } from "../entitlement/types";
import { isThrough, type AccessState } from "./types";

/**
 * The product front door.
 *
 * A visitor arriving at the domain has not asked for a login page - they asked
 * for the product. So the gate VERIFIES FIRST and only shows a door if that
 * fails. While the check runs it shows the design system's boot screen, which
 * waits 250ms before drawing anything: a visitor who is already signed in
 * resolves faster than that, so they never see a verifying screen at all - the
 * gate is invisible to everyone it lets through.
 *
 * Everything the gate needs arrives in ONE call (`/api/access`). That is not
 * only about latency - see the route for why two calls race - but it is also
 * what makes "come back carrying auth AND subscription" true rather than
 * aspirational: after login returns, the same single call re-resolves both.
 *
 * Reuse: a product copied from vxtpl changes `productName` and `destination`.
 * Everything else - the states, their copy, the redirect, the return-to
 * round trip - is the same for every product, which is exactly why it lives
 * here and not in a page.
 */

export interface ProductGateProps {
  /** Shown under the brand mark. Defaults to BRAND.displayName via the page. */
  productName: string;
  /** Where a verified visitor lands. Must be a same-origin path. */
  destination: string;
  /** Optional one-line description of the product, shown while verifying. */
  tagline?: string;
}

type Phase = { kind: "verifying" } | { kind: "resolved"; state: AccessState } | { kind: "error"; message: string };

export function ProductGate({ productName, destination, tagline }: ProductGateProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "verifying" });
  // The redirect must fire exactly once. Without this a re-render during the
  // navigation can issue a second one, which shows up as a back button that
  // cannot escape the gate.
  const redirected = useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/access", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`access check failed (HTTP ${res.status})`);
        return (await res.json()) as AccessState;
      })
      .then((state) => {
        if (cancelled) return;
        if (isThrough(state) && !redirected.current) {
          redirected.current = true;
          // replace, not assign: the gate is a checkpoint, not a destination.
          // Leaving it in history means Back lands here and bounces forward
          // again, which reads as a trapped browser.
          window.location.replace(destination);
          return;
        }
        setPhase({ kind: "resolved", state });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPhase({ kind: "error", message: err instanceof Error ? err.message : "access check failed" });
      });

    return () => {
      cancelled = true;
    };
  }, [destination]);

  // Two states mean "no answer yet": the check is in flight, or it came back
  // `open` and the redirect has already been issued. Both get the DS's boot
  // screen, whose 250ms delay is the point - a visitor who is already signed in
  // resolves faster than that and never sees a verifying screen flash past on
  // the way to the product.
  const settling = phase.kind === "verifying" || (phase.kind === "resolved" && phase.state.status === "open");

  return (
    <main className="vx-gate">
      <div className="vx-gate__flow" aria-hidden="true">
        <svg viewBox="0 0 1600 1000" preserveAspectRatio="none">
          <path d="M-80 690 C220 430,360 790,650 570 S1080 300,1680 480" />
          <path d="M-100 760 C220 500,390 850,690 620 S1130 360,1700 540" />
          <path d="M-120 830 C230 570,420 900,720 675 S1180 420,1710 600" />
          <path d="M-60 600 C240 360,390 680,610 500 S1070 240,1640 410" />
        </svg>
      </div>
      <div className="vx-gate__wash" aria-hidden="true" />

      {settling ? (
        // `bg-transparent` so the boot screen sits on the gate's own backdrop
        // instead of painting over it - the panel that follows must not look
        // like a different page.
        <ShellBootScreen label={productName} description="正在验证您的访问权限" className="bg-transparent" />
      ) : (
        <Resolved phase={phase} destination={destination} productName={productName} tagline={tagline} />
      )}
    </main>
  );
}

function Resolved({
  phase,
  destination,
  productName,
  tagline,
}: {
  phase: Phase;
  destination: string;
  productName: string;
  tagline?: string;
}) {
  const view = describe(phase, destination);

  return (
    <section className="vx-gate__panel">
      {/* The DS's brand lockup. `href` points at the product rather than the
          site root: clicking the mark is an attempt to enter, and if the
          visitor still cannot, the gate answers again - which is the truth. */}
      <ShellBrand href={destination} label={productName} className="vx-gate__brand" />

      <p className="vx-gate__message">{view.message}</p>

      {view.action ? (
        <a className="vx-gate__action" href={view.action.href}>
          {view.action.label}
        </a>
      ) : (
        // No action means there is nothing this visitor can do from here - the
        // answer is one only an operator or an admin can change. A disabled
        // button says so without offering a door that leads nowhere.
        <button className="vx-gate__action" type="button" disabled>
          {view.idleLabel}
        </button>
      )}

      <p className="vx-gate__hint">{view.hint ?? tagline ?? ""}</p>
    </section>
  );
}

interface View {
  message: string;
  hint?: string;
  idleLabel: string;
  action?: { label: string; href: string };
}

/**
 * State -> what the visitor sees.
 *
 * Split out because it is the part worth reading: every branch answers "what
 * can this person actually do next", and several of them are deliberately NOT
 * "sign in". Offering sign-in to someone whose account is suspended, or whose
 * session has no workspace, sends them through an IdP that hands back the same
 * dead end.
 */
function describe(phase: Phase, destination: string): View {
  if (phase.kind === "verifying") {
    // Unreachable - the caller renders the DS boot screen instead. Kept so this
    // function stays total over Phase rather than relying on that promise.
    return { message: "正在验证您的访问权限", idleLabel: "验证中" };
  }

  if (phase.kind === "error") {
    // The check itself failed - a network blip or a route error, not a verdict
    // about this visitor. Retry is the honest offer; signing in would not help,
    // and it would be a guess about a cause we have no evidence for.
    const retry = destination === "/" ? "/gate" : `/gate?from=${encodeURIComponent(destination)}`;
    return {
      message: "无法完成验证",
      hint: phase.message,
      idleLabel: "重试",
      action: { label: "重试", href: retry },
    };
  }

  const { state } = phase;
  const returnTo = encodeURIComponent(destination);

  switch (state.status) {
    case "anonymous":
      return {
        message: "请登录以验证您的订阅并访问产品",
        hint: "登录后将自动返回当前产品",
        idleLabel: "登录",
        action: { label: "登录", href: `/auth/login?returnTo=${returnTo}` },
      };

    case "authenticated": {
      // Signed in but not entitled. The CTA belongs to the subscription state,
      // not to us - an overdue account needs a different door from one that
      // never had a plan. The deep link is attached to a LINK the visitor
      // clicks, never auto-followed (product_200 3.2 is explicit about that).
      const cta = state.gates.cta;
      return {
        message: ctaMessage(cta),
        hint: state.entitlement.tier ? `当前订阅：${state.entitlement.tier}` : "当前工作空间尚未开通本产品",
        idleLabel: ctaLabel(cta),
        action: { label: ctaLabel(cta), href: subscribeUrl({ intent: ctaIntent(cta) }) },
      };
    }

    case "inactive-account":
      return {
        message: "该账号当前不可用",
        hint: "请联系管理员恢复账号后再试",
        idleLabel: "账号不可用",
      };

    case "no-workspace":
      return {
        message: "您的账号尚未加入任何工作空间",
        hint: "请在控制台创建或加入一个工作空间",
        idleLabel: "前往控制台",
        action: { label: "前往控制台", href: consoleUrl() },
      };

    case "unconfigured":
      return {
        message: "本产品的登录尚未配置",
        hint: "这是部署侧的配置缺失，不是您的账号问题",
        idleLabel: "暂不可用",
      };

    case "open":
      // Local development only, and the caller shows the boot screen for it -
      // the redirect has already been issued by the time this could matter.
      return { message: "本地开发模式", idleLabel: "验证中" };
  }
}

function ctaMessage(cta: Cta): string {
  if (cta === "pay") return "您的订阅有待支付的账单";
  if (cta === "renew") return "您的订阅已到期";
  return "该工作空间尚未订阅本产品";
}

function ctaLabel(cta: Cta): string {
  if (cta === "pay") return "去支付";
  if (cta === "renew") return "去续订";
  return "去订阅";
}

/**
 * The console's own intent vocabulary is narrower than the gate's CTA set:
 * there is no "pay" intent, and an overdue account is renewing the same plan.
 */
function ctaIntent(cta: Cta): Intent {
  return cta === "pay" || cta === "renew" ? "renew" : "upgrade";
}

function consoleUrl(): string {
  return (process.env.NEXT_PUBLIC_CONSOLE_URL ?? "https://console.vxture.com").replace(/\/$/, "");
}
