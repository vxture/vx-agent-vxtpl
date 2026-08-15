"use client";

import { useEffect, useState } from "react";

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
  email?: string;
  activeWorkspace?: string;
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

  const who = state.user?.email ?? state.user?.sub ?? "signed in";
  return (
    <form method="post" action="/auth/logout" className="nav-session">
      <span title={state.user?.activeWorkspace ? `workspace ${state.user.activeWorkspace}` : undefined}>{who}</span>
      <button type="submit">Sign out</button>
    </form>
  );
}
