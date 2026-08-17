# ADR-005: a product verifies access at its front door

- **Status:** accepted
- **Date:** 2026-08-17

## Context

A Vxture product is reached by its own domain. Someone arriving at
`vxtpl.vxture.com` has not asked for a login page - they asked for the product -
but the product cannot serve them until it knows two things that live in
different places: who they are (the RP session) and what their workspace is
entitled to (C2, deliberately never in the token).

Before this, vxtpl answered that badly. The home page rendered for anyone,
`/api/entitlement` answered 401 to the browser, and each surface discovered
independently that the visitor could not be served. A signed-in customer and an
anonymous visitor saw the same shell, and the difference only appeared after a
click.

## Decision

A product has a front door: `/gate`. Middleware sends an unverified visitor
there from any product surface, the gate verifies once, and either lets them
through or shows them the one action that can actually help.

### One call, not two

`GET /api/access` returns identity, entitlement and the gate outcomes together.
This is not a convenience wrapper. Fetching `/auth/session` and
`/api/entitlement` in parallel reads the same session twice, and those reads
race: both resolve the session, and a session inside 60 seconds of expiry is
silently refreshed with a **rotating** refresh token. One rotation wins, the
other gets `invalid_grant`. A perfectly signed-in customer can be told
"authenticated" by one call and 401 by the other, intermittently, in a way that
reproduces on nobody's machine.

Resolving once server-side removes the race, halves the Redis and JWKS work, and
means "come back carrying auth AND subscription" is one round trip rather than a
reconciliation.

### Verify first, offer a door second

The button starts disabled and reads "verifying". An already-signed-in visitor
never sees the door: the check resolves into a redirect. Only a failed check
turns the button into "sign in".

This is the opposite of the usual splash page, and deliberately so. A product's
front door that shows a login button before it has checked is telling most of
its visitors - the returning, paying ones - to prove something they have already
proven.

### The states are a union, not a boolean

Six states, each with a different next action, because collapsing them into
"authenticated / not" loses exactly the distinctions that decide what the button
should say:

| state | why it is not "sign in" |
|---|---|
| `anonymous` | it is |
| `authenticated` | signed in; the CTA belongs to the subscription state - pay, renew, or subscribe |
| `inactive-account` | a suspended account signs in fine and comes back just as suspended |
| `no-workspace` | re-authenticating cannot create a workspace; the console can |
| `unconfigured` | the deployment is missing config - the visitor cannot fix it and should not be asked to |
| `open` | local development with no IdP; the gate stands aside |

A gate whose button is wrong is worse than no gate, because it sends people
somewhere that cannot help them and looks authoritative doing it.

### The middleware is not a security boundary

It checks only for the presence of the session cookie, because it runs on the
edge runtime where the session store and JWKS verification are unavailable - and
because putting a Redis read and a signature check in front of every navigation
would be a real cost for a check that decides nothing.

A forged cookie buys a trip to the gate, which verifies properly. Every route
that matters still enforces its own access: `/api/chat` resolves the session,
`/api/entitlement` 401s, the database has its own least-privilege role. The
middleware exists so a visitor meets a door instead of an empty shell.

## Consequences

- Local development is unaffected: with no IdP configured the gate reports
  `open` and stands aside. Without that branch the front door would be a wall no
  developer could open, which is how gates get disabled and never re-enabled.
- The gate is one component and one route. A product copied from vxtpl changes
  the product name and the destination; the states, their copy, the redirect and
  the return-to round trip are the same for every product, which is why they
  live in `app/access/` rather than in a page.
- `/gate`, `/auth/*` and `/api/*` are excluded from the matcher. Gating `/gate`
  is an infinite redirect; gating `/auth/callback` breaks the very request that
  sets the cookie; redirecting an API route to an HTML page surfaces as a JSON
  parse error rather than as a 302.
- vxtpl now has a second reason to keep `/auth/session` - the nav's session
  control still uses it. `/api/access` did not replace it, and should not: one
  is a cheap "is anyone there", the other is the full verdict.
