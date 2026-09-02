# The product front door

Every Vxture product reached by its own domain needs the same thing: verify the
visitor, let them in, or show them the one action that helps. vxtpl ships it as
four files a copied product changes almost nothing in.

## What a copy has to change

```tsx
// app/gate/page.tsx - the only file with product-specific content
<ProductGate
  productName={BRAND.displayName}   // already correct after rename-product.mjs
  destination={destination}          // where a verified visitor lands
  tagline="验证通过后将自动进入产品"
/>
```

That is the whole customisation surface. The states, their copy, the redirect,
and the login round trip are identical for every product, which is why they are
in `app/access/` and not in the page.

## The pieces

| file | role |
|---|---|
| `middleware.ts` | sends an unverified visitor to `/gate`, preserving where they were going |
| `app/api/access/route.ts` | the authority: resolves session + entitlement in ONE pass |
| `app/access/types.ts` | the six states and `isThrough()` |
| `app/access/product-gate.tsx` | the UI: verify -> redirect, or a door |
| `app/access/gate.css` | layout only; every colour is a DS token |
| `app/gate/page.tsx` | the route, and the only product-specific file |

## How a visit flows

1. Visitor hits any product surface. Middleware sees no session cookie and
   redirects to `/gate?from=/whatever-they-wanted`.
2. The gate mounts with its button **disabled, reading "验证中"**, and calls
   `/api/access` once.
3. **Signed in and entitled** -> `window.location.replace(destination)`. The
   visitor never sees the door. `replace`, not `assign`, so Back does not land
   on the gate and bounce forward again.
4. **Not signed in** -> the button becomes **"登录"**, linking to
   `/auth/login?returnTo=<destination>`. After the IdP round trip the callback
   sets the cookie and returns here; the gate re-runs and step 3 fires - so the
   visitor arrives with identity AND entitlement already resolved.
5. **Signed in but not entitled** -> the button becomes the subscription state's
   own CTA (去订阅 / 去续订 / 去支付), deep-linking to the console. Never
   auto-followed; product_200 3.2 requires an explicit click.

## Why one endpoint instead of two

`/auth/session` has identity. `/api/entitlement` has the tier. Fetching both in
parallel looks obvious and is subtly wrong: each independently resolves the
session, and a session within 60 seconds of expiry is refreshed with a
**rotating** refresh token. Two concurrent refreshes mean one wins and one gets
`invalid_grant`, so a signed-in customer can be told "authenticated" by one call
and 401 by the other. Intermittently. On nobody's machine but theirs.

`/api/access` resolves once. That is also what makes the return trip carry
everything: one call after login gives the gate identity, tier, status and gates
together.

## Why the middleware is deliberately dumb

It checks for the presence of the session cookie and nothing else, because it
runs on the edge runtime where the session store and JWKS verification do not
exist - and because a Redis read plus a signature check in front of every
navigation is a real cost for a check that decides nothing.

It is not a security boundary and must not be treated as one. A forged cookie
buys a trip to the gate, which verifies properly. Every route that matters
enforces its own access independently.

## The local-development branch

With no IdP configured, `/api/access` returns `{status:"open"}` and the
middleware does not gate at all. Without this the front door is a wall no
developer can open - and a gate that blocks local work is a gate someone
disables and forgets to re-enable.

It is keyed on `DEPLOY_STAGE`, which the image always sets from the git ref, so
it cannot engage on a deployed stack. On production with sign-in unconfigured
the gate reports `unconfigured` instead: a dead end that is the operator's to
fix, stated rather than papered over with a login button that lands on a 503.

## Things worth not changing

- **Verify before offering a door.** Showing "sign in" before the check has run
  tells returning customers - most of your traffic - to prove what they already
  proved.
- **Six states, not a boolean.** Each has a different next action. A gate whose
  button is wrong is worse than no gate: it sends people somewhere that cannot
  help them, authoritatively.
- **`/gate`, `/auth/*`, `/api/*` stay out of the matcher.** Gating the gate is an
  infinite redirect; gating `/auth/callback` breaks the request that sets the
  cookie; redirecting an API route to HTML surfaces as a JSON parse error.

## Naming the person: the sub is an internal key

**A `usr_<uuid>` is never displayed** (owner rule 2026-09-02). It scopes runs,
quota and every product row, and it is what travels to the platform - but it is
a key, not a name, and a product that prints one is telling the person it never
asked the IdP who they are. The same holds for workspace and org ids: the token
carries `active_workspace_name` / `active_org_name` for the human half, and an
unnamed workspace renders as nothing rather than as its uuid.

Two pieces implement it, and a copy inherits both:

- `auth/lib/profile.ts` RESOLVES the display profile - name, avatar, email -
  from the id_token first and then from UserInfo, because this IdP advertises
  `name` / `picture` / `email` under `claims_supported` but does not put them in
  the id_token. OIDC permits that split (core 5.3), so an RP that wants a name
  has to go and ask. The result is cached per RP session for 10 minutes,
  including when it comes back empty, in its OWN Redis key - never inside the
  session bundle, whose read-modify-write would race the silent refresh and
  could persist a retired refresh token. A UserInfo body whose `sub` is not the
  caller's is dropped, not rendered.
- `auth/lib/display.ts` LABELS the person: platform name, else the email local
  part, else a caller-supplied fallback (the deck passes the player's call
  sign - anonymous, stable, and not an identifier). Every candidate is checked
  against the sub, so a caller that passes an identifier as its fallback gets it
  dropped. That check is not theoretical: the deck shipped `sub.slice(0, 12)` as
  its fallback and production showed a uuid where the name belongs.

The rule is enforced in `display.test.ts`. Adding a new identity surface means
calling `displayNameFor` / `contactLineFor`, not re-deriving a label from the
session payload.
