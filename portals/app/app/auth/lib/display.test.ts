import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avatarInitial,
  contactLineFor,
  displayNameFor,
  emailLocalPart,
  leaksIdentifier,
  workspaceLabelFor,
} from "./display";

const SUB = "usr_11111111-2222-3333-4444-555555555555";

test("display name prefers the platform name, then the email local part", () => {
  assert.equal(displayNameFor({ sub: SUB, displayName: "Ada L", email: "ada@x.com" }), "Ada L");
  assert.equal(displayNameFor({ sub: SUB, email: "ada.l@x.com" }), "ada.l");
  assert.equal(displayNameFor({ sub: SUB, displayName: "   " , email: "ada@x.com" }), "ada");
});

test("the fallback is used only when the IdP gave nothing", () => {
  assert.equal(displayNameFor({ sub: SUB }, "NOVA-1A2B"), "NOVA-1A2B");
  assert.equal(displayNameFor({ sub: SUB, displayName: "Ada L" }, "NOVA-1A2B"), "Ada L");
  assert.equal(displayNameFor(null, "PILOT"), "PILOT");
  assert.equal(displayNameFor({ sub: SUB }), "");
});

// THE rule (owner 2026-09-02). The regression this guards is real: the deck
// shipped `sub.slice(0, 12)` as its fallback and production showed a uuid
// where the player's name belongs.
test("the sub is never a label, whole or sliced, whatever a caller passes", () => {
  assert.equal(displayNameFor({ sub: SUB }, SUB), "");
  assert.equal(displayNameFor({ sub: SUB }, SUB.slice(0, 12)), "");
  assert.equal(displayNameFor({ sub: SUB }, SUB.toUpperCase()), "");
  assert.equal(displayNameFor({ sub: SUB, displayName: SUB }, "PILOT"), "PILOT");
  assert.equal(displayNameFor({ sub: SUB, email: `${SUB}@x.com` }, "PILOT"), "PILOT");
});

test("leaksIdentifier only fires on identifier-length matches", () => {
  assert.equal(leaksIdentifier("11111111-2222", SUB), true);
  assert.equal(leaksIdentifier("usr_11", SUB), true);
  assert.equal(leaksIdentifier("Ada", SUB), false); // short, and not in the sub
  assert.equal(leaksIdentifier("Ada Lovelace", SUB), false);
  assert.equal(leaksIdentifier("anything", null), false);
});

test("the contact line carries name and email, never the sub", () => {
  assert.equal(contactLineFor({ sub: SUB, displayName: "Ada L", email: "ada@x.com" }), "Ada L - ada@x.com");
  assert.equal(contactLineFor({ sub: SUB, email: "ada@x.com" }), "ada@x.com");
  assert.equal(contactLineFor({ sub: SUB }), "");
  assert.equal(contactLineFor(null), "");
});

test("a workspace shows only when the token named it", () => {
  assert.equal(workspaceLabelFor({ activeWorkspace: "00000000-0000-4000-a000-000000000210" }), "");
  assert.equal(
    workspaceLabelFor({ activeWorkspace: "00000000-0000-4000-a000-000000000210", activeWorkspaceName: "Acme" }),
    "Acme",
  );
});

test("email local part and monogram", () => {
  assert.equal(emailLocalPart("ada@x.com"), "ada");
  assert.equal(emailLocalPart("not-an-email"), "");
  assert.equal(emailLocalPart(null), "");
  assert.equal(avatarInitial("nova-1a2b"), "N");
  assert.equal(avatarInitial(""), "?");
});
