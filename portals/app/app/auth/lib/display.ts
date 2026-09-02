// How a signed-in person is LABELLED in the interface. Pure, client-safe, and
// the single place the rule lives:
//
//   THE SUB IS AN INTERNAL KEY AND IS NEVER DISPLAYED (owner rule 2026-09-02).
//
// It scopes runs, quota and every product row, and it travels to the platform -
// but a `usr_<uuid>` is not a name, and showing one is how a product tells a
// person it does not know who they are. The same goes for workspace and org
// ids: there are *_name claims for the human half, and if a name is missing the
// answer is to show nothing, not the identifier behind it.
//
// The rule is enforced, not just documented: every candidate label is checked
// against the sub, so a caller that passes an identifier as its fallback (which
// is exactly how the deck regressed - `sub.slice(0, 12)`) gets it dropped
// rather than rendered.

export interface DisplayIdentity {
  sub?: string | null;
  displayName?: string | null;
  email?: string | null;
  picture?: string | null;
  activeWorkspace?: string | null;
  activeWorkspaceName?: string | null;
  activeOrgName?: string | null;
}

function clean(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A candidate that is the sub, or any slice of it long enough to read as an
 * identifier. Case-insensitive: uuids get rendered both ways. */
export function leaksIdentifier(value: string, sub: string | null | undefined): boolean {
  const v = clean(value).toLowerCase();
  const s = clean(sub).toLowerCase();
  if (!v || !s) return false;
  if (v === s) return true;
  return v.length >= 6 && (s.includes(v) || v.includes(s));
}

/** The local part of an email, used as a name when the IdP has none. Not the
 * whole address: the identity strip is chrome, and an address is contact
 * detail - it belongs in the menu line, not across the topbar. */
export function emailLocalPart(email: string | null | undefined): string {
  const e = clean(email);
  const at = e.indexOf("@");
  return at > 0 ? e.slice(0, at) : "";
}

/**
 * The label for a person: platform display name, else the email local part,
 * else the caller's fallback (the deck passes the player's call sign - an
 * anonymous handle, never an identifier). Returns "" only if every candidate
 * was empty or was an identifier in disguise.
 */
export function displayNameFor(user: DisplayIdentity | null | undefined, fallback = ""): string {
  const u = user ?? {};
  for (const candidate of [clean(u.displayName), emailLocalPart(u.email), clean(fallback)]) {
    if (!candidate) continue;
    if (leaksIdentifier(candidate, u.sub)) continue;
    return candidate;
  }
  return "";
}

/** The fuller "who am I signed in as" line for a menu or tooltip: name and
 * email, whichever exist. Never the sub - an account with neither gets an
 * empty line, and the caller shows nothing. */
export function contactLineFor(user: DisplayIdentity | null | undefined): string {
  const u = user ?? {};
  return [clean(u.displayName), clean(u.email)].filter(Boolean).join(" - ");
}

/** The workspace, if the token gave us a NAME for it. The id alone is not a
 * label, so it renders as nothing at all. */
export function workspaceLabelFor(user: DisplayIdentity | null | undefined): string {
  return clean(user?.activeWorkspaceName);
}

/** Avatar monogram for the no-picture case. */
export function avatarInitial(name: string): string {
  const n = clean(name);
  return n ? n.charAt(0).toUpperCase() : "?";
}
