import type { OidcConfig } from "./config";
import {
  mergeProfile,
  profileFromClaims,
  profileFromIdToken,
  profileIsComplete,
  type IdProfile,
} from "./claims";
import { fetchUserInfo } from "./oidc";
import { getProfile, putProfile } from "./session-store";

// The display profile a UI is allowed to render: name, avatar, email. Assembled
// here, once, so that every surface asks the same question and gets the same
// answer - and so that the sub has nowhere to leak in as a "name".
//
// Two sources, in order:
//   1. the id_token payload (free - it is already in the session), then
//   2. UserInfo (one network call), which is where this IdP actually keeps the
//      display claims: the discovery document lists name / picture / email
//      under claims_supported, but a production id_token carries none of them
//      (live finding 2026-09-02). OIDC permits that split, so an RP that wants
//      a person's name has to go and ask.
//
// The result is cached per RP session for PROFILE_TTL_SECONDS, including when
// it comes back empty - an account the IdP has no name for must not cost a
// UserInfo round trip on every page load. Cache failures are non-fatal: a
// display name is not worth failing a session read over.

const PROFILE_TTL_SECONDS = 600;

export async function resolveDisplayProfile(
  cfg: OidcConfig,
  rpsid: string,
  ctx: { user: { sub: string }; accessToken: string; idToken: string },
): Promise<IdProfile> {
  const fromToken = profileFromIdToken(ctx.idToken);
  if (profileIsComplete(fromToken)) return fromToken;

  const cached = await getProfile(cfg.clientId, rpsid).catch(() => null);
  if (cached) return mergeProfile(fromToken, cached);

  const info = await fetchUserInfo(cfg, ctx.accessToken, ctx.user.sub);
  const merged = mergeProfile(fromToken, info ? profileFromClaims(info) : null);
  await putProfile(cfg.clientId, rpsid, merged, PROFILE_TTL_SECONDS).catch(() => undefined);
  return merged;
}
