"use client";

import { useEffect, useState } from "react";
import { contactLineFor, displayNameFor, workspaceLabelFor } from "./auth/lib/display";

// The nav's sign-in / sign-out control.
//
// Without it the C1 flow is unreachable: /auth/login is a top-level navigation
// with no entry point, and every session-gated surface (chat, /api/entitlement,
// STATUS_PAGE=authed) just reports "not signed in" with no way to act on it.
//
// Sign-out is a POST form, not a link, so it cannot be triggered by a prefetch
// or a crawler following hrefs.

interface SessionUser {
  sub?: string;
  email?: string | null;
  displayName?: string | null;
  activeWorkspace?: string;
  activeWorkspaceName?: string | null;
}

export function SessionControl() {
  const [state, setState] = useState<{ authenticated: boolean; user?: SessionUser } | null>(null);
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    setReturnTo(window.location.pathname + window.location.search);
    fetch("/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState({ authenticated: false }));
  }, []);

  if (!state) return <span className="nav-session" aria-hidden="true" />;

  if (!state.authenticated) {
    return (
      <a className="nav-session" href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>
        Sign in
      </a>
    );
  }

  // Name, else email local part, else a neutral word - never the sub, and the
  // workspace shows only if the token named it (owner rule 2026-09-02: ids are
  // internal keys, so an unnamed workspace gets no tooltip rather than a uuid).
  const who = displayNameFor(state.user, "Signed in");
  const workspace = workspaceLabelFor(state.user);
  const title = [contactLineFor(state.user), workspace && `workspace ${workspace}`]
    .filter(Boolean)
    .join(" - ");
  return (
    <form method="post" action="/auth/logout" className="nav-session">
      <span title={title || undefined}>{who}</span>
      <button type="submit">Sign out</button>
    </form>
  );
}
