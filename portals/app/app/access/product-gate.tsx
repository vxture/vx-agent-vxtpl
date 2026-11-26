/**
 * Access check and navigation for both public entry presentations.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useState } from "react";
import { Icon } from "../ds";
import { subscribeUrl } from "../entitlement/deeplink";
import { productExperience } from "../framework/product-experience";
import { gateLoginHref, type GateFailure } from "./destination";
import { EntryCard, type EntryAction } from "./entry-card";
import type { EntryLocale, EntryStatus } from "./entry-copy";
import { isThrough, type AccessState } from "./types";

const ACCESS_DEADLINE_MS = 8000;
const CONSOLE = (process.env.NEXT_PUBLIC_CONSOLE_URL ?? "https://console.vxture.com").replace(/\/$/, "");

type CheckResult =
  | { kind: "resolved"; state: AccessState }
  | { kind: "failed"; status: "connection" | "offline" | "limited"; retryAt?: number };

let pending: Promise<CheckResult> | undefined;

/* Coalesce concurrent reads and give every explicit retry a fresh check. */
function checkAccess(): Promise<CheckResult> {
  if (!pending) {
    pending = (async (): Promise<CheckResult> => {
      if (!navigator.onLine) return { kind: "failed", status: "offline" };
      try {
        const response = await fetch("/api/access", {
          cache: "no-store",
          signal: AbortSignal.timeout(ACCESS_DEADLINE_MS),
        });
        if (response.status === 429) {
          const retry = response.headers.get("retry-after");
          const seconds = retry !== null && /^\d+$/.test(retry) ? Number(retry) : 5;
          return { kind: "failed", status: "limited", retryAt: Date.now() + Math.max(1, Math.min(seconds, 120)) * 1000 };
        }
        const state = await response.json() as AccessState;
        if (response.ok || (response.status === 503 && state.status === "unavailable")) return { kind: "resolved", state };
      } catch {
        if (!navigator.onLine) return { kind: "failed", status: "offline" };
      }
      return { kind: "failed", status: "connection" };
    })().finally(() => { pending = undefined; });
  }
  return pending;
}

/* Presentation and explicit next actions */
export function ProductGate({ productName, destination, failure, locale, landing }: {
  productName: string;
  destination: string;
  failure?: GateFailure;
  locale: EntryLocale;
  landing: boolean;
}) {
  const [attempt, setAttempt] = useState(landing || failure ? 0 : 1);
  const [result, setResult] = useState<CheckResult>();
  const [rateWait, setRateWait] = useState(false);
  const checking = attempt > 0 && !result;

  useEffect(() => {
    if (!attempt) return;
    let current = true;
    void checkAccess().then((next) => {
      if (!current) return;
      if (next.kind === "resolved" && isThrough(next.state)) {
        window.location.replace(destination);
        return;
      }
      setResult(next);
      setRateWait(next.kind === "failed" && next.retryAt !== undefined);
    });
    return () => { current = false; };
  }, [attempt, destination]);

  useEffect(() => {
    if (result?.kind !== "failed" || !result.retryAt) return;
    const timer = window.setTimeout(() => setRateWait(false), Math.max(0, result.retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [result]);

  function retry() {
    if (checking || rateWait) return;
    setResult(undefined);
    setAttempt((count) => count + 1);
  }

  const login: EntryAction = { labels: ["\u7ee7\u7eed\u767b\u5f55", "Continue to sign in"], href: gateLoginHref(destination) };
  const recheck: EntryAction = { labels: ["\u91cd\u65b0\u68c0\u67e5", "Check again"], onClick: retry, disabled: rateWait };
  let status: EntryStatus = "checking";
  let actions: EntryAction[] = [];

  if (!attempt && failure) {
    status = failure;
    actions = failure === "unavailable" ? [recheck] : [login];
  } else if (result?.kind === "failed") {
    status = result.status;
    actions = [recheck];
  } else if (result?.kind === "resolved") {
    const state = result.state;
    switch (state.status) {
      case "anonymous":
        status = "signin";
        actions = [login];
        break;
      case "no-workspace":
        status = "workspace";
        actions = [{ labels: ["\u524d\u5f80\u63a7\u5236\u53f0", "Open console"], href: CONSOLE }, recheck];
        break;
      case "inactive-account":
        status = "inactive";
        actions = [recheck];
        break;
      case "unconfigured":
        status = "unconfigured";
        actions = [recheck];
        break;
      case "authenticated": {
        if (state.gates.seatRequired) {
          status = "seat-required";
          actions = [recheck];
          break;
        }
        const renew = state.gates.cta === "renew" || state.gates.cta === "pay";
        const owner = state.user.isWorkspaceOwner;
        status = renew ? (owner ? "renew" : "renew-member") : owner ? "subscription" : "subscription-member";
        actions = owner
          ? [{ labels: renew ? ["\u67e5\u770b\u8ba2\u9605", "Review subscription"] : ["\u5f00\u901a\u4ea7\u54c1", "Subscribe"], href: subscribeUrl() }, recheck]
          : [recheck];
        break;
      }
      default:
        status = "unavailable";
        actions = [recheck];
    }
  }

  const zh = locale === "zh-CN";
  return (
    <main className="vx-gate" lang={locale}>
      <div className="vx-entry-shell-content">
        <p className="vx-entry-positioning">{zh ? "\u7edf\u4e00\u5de5\u4f5c\u7a7a\u95f4" : "Unified workspace"}</p>
        {landing && !attempt ? (
          <section className="vx-entry-card vx-entry-landing">
            <div className="vx-entry-card-mark" aria-hidden="true"><Icon name="app-grid" size="lg" /></div>
            <div className="vx-entry-card-heading">
              <h1>{productName}</h1>
              <p>{zh ? "\u4ece\u8fd9\u91cc\u5f00\u59cb\u5de5\u4f5c\uff0c\u7ee7\u7eed\u5bf9\u8bdd" : "Start work or continue a conversation."}{productExperience.example ? zh ? `\uff0c\u6216\u8fdb\u5165 ${productExperience.example.label}` : ` Open ${productExperience.example.label} to try the example.` : null}</p>
            </div>
            <div className="vx-entry-card-actions">
              <button type="button" className="vx-entry-action vx-entry-action-primary" onClick={retry}>
                {zh ? "\u8fdb\u5165\u5de5\u4f5c\u7a7a\u95f4" : "Open workspace"}
              </button>
            </div>
            <p className="vx-entry-card-footnote">{zh ? "\u4f7f\u7528 Vxture \u5e73\u53f0\u8d26\u53f7\u8fdb\u5165" : "Enter with your Vxture account"}</p>
          </section>
        ) : <EntryCard productName={productName} status={status} locale={locale} actions={actions} />}
        <div className="vx-entry-description">
          <p>{zh ? "\u5728\u540c\u4e00\u5904\u7ee7\u7eed\u624b\u4e0a\u7684\u5de5\u4f5c" : "Bring your work together in one place"}</p>
          <p>{zh ? "Your work, connected" : "A Vxture product"}</p>
        </div>
      </div>
    </main>
  );
}
