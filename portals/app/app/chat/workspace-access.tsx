/**
 * Checks chat access and keeps mounted work bound to its verified scope.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Session
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { gateLoginHref } from "../access/destination";
import type { EntryAction } from "../access/entry-card";
import type { EntryStatus } from "../access/entry-copy";
import { RecoveryDialog } from "../access/recovery-dialog";
import { productGateHref, productRoutes } from "../framework/product-experience";
import { useSessionRevocation } from "../auth/session-events-client";
import { ChatRequestError, readChatContext, type ChatContext } from "./client";

interface WorkspaceAccess {
  context: ChatContext | null;
  blocked: boolean;
  revision: number;
  scopeVersion: number;
  onAccessFailure: (error: unknown, scopeKey: string) => boolean;
}

function accessStatus(error: unknown): EntryStatus | null {
  if (!(error instanceof ChatRequestError)) return null;
  if (error.status === 401) return "recover";
  switch (error.code) {
    case "WORKSPACE_CHANGED":
    case "SESSION_UNAVAILABLE":
    case "WORKSPACE_ACCESS_UNAVAILABLE": return "unavailable";
    case "SESSION_UNCONFIGURED": return "unconfigured";
    case "ACCOUNT_INACTIVE": return "inactive";
    case "WORKSPACE_REQUIRED": return "workspace";
    case "WORKSPACE_ACCESS_REQUIRED": return "subscription";
    case "PRODUCT_SEAT_REQUIRED": return "seat-required";
    default: return null;
  }
}

export function ChatWorkspaceAccess({ children }: { children: (access: WorkspaceAccess) => ReactNode }) {
  const [context, setContext] = useState<ChatContext | null>(null);
  const [status, setStatus] = useState<EntryStatus | null>(null);
  const [revision, setRevision] = useState(0);
  const [scopeVersion, setScopeVersion] = useState(0);
  const lastScope = useRef<string | null>(null);
  const active = useRef(false);
  const pending = useRef<Promise<void> | null>(null);
  const eventVersion = useRef(0);
  useSessionRevocation(Boolean(context && context.scopeKey !== "development" && !status), () => {
    eventVersion.current++;
    setStatus("recover");
  });

  const check = useCallback((recovery: boolean) => {
    if (pending.current) return;
    const version = eventVersion.current;
    if (recovery) setStatus("checking");
    pending.current = readChatContext().then((next) => {
      if (!active.current || version !== eventVersion.current) return;
      const changed = lastScope.current !== null && lastScope.current !== next.scopeKey;
      lastScope.current = next.scopeKey;
      setContext(next);
      if (changed) setScopeVersion((value) => value + 1);
      if (recovery) setRevision((value) => value + 1);
      setStatus(!next.productAccess ? "subscription" : changed ? "changed" : null);
    }).catch((error: unknown) => {
      if (!active.current || version !== eventVersion.current) return;
      setStatus(accessStatus(error) ?? (navigator.onLine ? "connection" : "offline"));
    }).finally(() => { pending.current = null; });
  }, []);

  useEffect(() => {
    active.current = true;
    check(false);
    return () => { active.current = false; };
  }, [check]);

  function onAccessFailure(error: unknown, scopeKey: string) {
    if (scopeKey !== lastScope.current) return true;
    if (error instanceof ChatRequestError && error.code === "MODEL_NOT_GRANTED") {
      check(false);
      return false;
    }
    const next = accessStatus(error);
    if (!next) return false;
    setStatus(next);
    return true;
  }

  const recheck: EntryAction = { labels: ["Check again", "Check again"], onClick: () => check(true) };
  const actions: EntryAction[] = [];
  if (status === "changed") {
    actions.push({ labels: ["Start in this workspace", "Start in this workspace"], onClick: () => setStatus(null) });
  } else if (status === "recover") {
    actions.push({ labels: ["Sign in in a new tab", "Sign in in a new tab"], href: gateLoginHref(productRoutes.home), newTab: true }, recheck);
  } else if (status === "subscription" || status === "workspace") {
    actions.push(recheck, { labels: ["Check product access", "Check product access"], href: productGateHref(productRoutes.home), newTab: true });
  } else if (status && status !== "checking") {
    actions.push(recheck);
  }
  if (status && status !== "checking") actions.push({ labels: ["Back to product", "Back to product"], href: productRoutes.landing });

  return (
    <>
      {children({ context, blocked: !context || status !== null, onAccessFailure, revision, scopeVersion })}
      {status && <RecoveryDialog status={status} actions={actions} />}
    </>
  );
}
