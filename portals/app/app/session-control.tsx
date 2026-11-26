"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSessionRevocation } from "./auth/session-events-client";
import { gateLoginHref } from "./access/destination";
import { displayNameFor, workspaceLabelFor, type DisplayIdentity } from "./auth/lib/display";
import { Button, Popover, PopoverTrigger, ShellPanelContent, ShellScopeButton, ShellUserMenu } from "./ds";

// The nav's sign-in / sign-out control.
//
// Without it the C1 flow is unreachable: /auth/login is a top-level navigation
// with no entry point, and every session-gated surface (chat, /api/entitlement,
// STATUS_PAGE=authed) just reports "not signed in" with no way to act on it.
//
// Sign-out is a POST form, not a link, so it cannot be triggered by a prefetch
// or a crawler following hrefs.

type ProductSessionState = { authenticated: boolean; user?: DisplayIdentity };
const SessionContext = createContext<ProductSessionState | null>(null);

export function ProductSession({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProductSessionState | null>(null);
  useSessionRevocation(state?.authenticated === true, () => setState({ authenticated: false }));
  useEffect(() => {
    const controller = new AbortController();
    fetch("/auth/session", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<ProductSessionState> : null)
      .then((next) => { if (!controller.signal.aborted) setState(next); })
      .catch(() => {
        if (!controller.signal.aborted) setState(null);
      });
    return () => controller.abort();
  }, []);
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function SessionScope() {
  const state = useContext(SessionContext);
  const organization = state?.user?.activeOrgName?.trim();
  const workspace = workspaceLabelFor(state?.user);
  if (!state?.authenticated || (!organization && !workspace)) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <ShellScopeButton
          label={<span className="product-scope-label"><span>{organization || workspace}</span>{organization && workspace && <small>{workspace}</small>}</span>}
          ariaLabel={[organization, workspace].filter(Boolean).join(" / ")}
          className="product-scope-trigger"
        />
      </PopoverTrigger>
      <ShellPanelContent align="start" aria-label="Current organization and workspace">
        <dl className="product-scope-details">
          {organization && <div><dt>Organization</dt><dd>{organization}</dd></div>}
          {workspace && <div><dt>Workspace</dt><dd>{workspace}</dd></div>}
        </dl>
      </ShellPanelContent>
    </Popover>
  );
}

export function SessionControl() {
  const state = useContext(SessionContext);
  const pathname = usePathname();
  const [returnTo, setReturnTo] = useState("/");
  useEffect(() => {
    setReturnTo(window.location.pathname + window.location.search);
  }, [pathname]);

  if (!state) return null;

  if (!state.authenticated) {
    return (
      <a className="product-account-sign-in" href={gateLoginHref(returnTo)}>
        Sign in
      </a>
    );
  }

  const workspace = workspaceLabelFor(state.user);
  return (
    <ShellUserMenu
      user={{
        displayName: displayNameFor(state.user, "Signed in"),
        avatarSrc: state.user?.picture || undefined,
        meta: workspace || undefined,
      }}
      openLabel="Account menu"
      online={false}
      triggerClassName="product-account-trigger"
      extras={
        <form method="post" action="/auth/logout">
          <Button type="submit" variant="ghost">Sign out</Button>
        </form>
      }
    />
  );
}
