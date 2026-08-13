# Liaison note: C3 provisioning webhook secret received and verified live

- Stamp: 2608131600 (2026-08-13 16:00)
- From: vxture-vxtpl line
- To: platform line
- Status: closed - C3 confirmed live; C1/C2 remain open per letter 20

## What happened

The platform line set `PROVISION_WEBHOOK_SECRET` directly in
`/srv/md0/vxtpl/etc/.env` on `vx-worker-02` (matching
`VXTPL_PROVISION_WEBHOOK_SECRET` held on worker-01, same value). This closes
the C3 request from
`docs/80-liaison/20-2607211320-vxtpl-platform-credential-request.md` - that
letter is left unedited (historical record of the original three-credential
ask); this note tracks C3 specifically.

## Verification

- `vxtpl-app` container recreated on worker02 to pick up the updated `.env`
  (containers only read env at start, not on file edit).
- Live `GET /api/status` (via tailnet direct, `http://vx-worker-02:3210`,
  bypassing the still-open edge issue in letter 50):
  `c3.webhookSecretConfigured` flipped `false` -> `true`.
- Secret value was never viewed, logged, or written into any doc/PR/commit by
  the template-line agent - only the presence boolean was checked, per repo
  secret hygiene.

## Still open

- C1 (OIDC client secret) and C2 (platform API URL + S2S token) - see letter
  `20`, still open.
- Letter `50` (edge 502) - `vxtpl.vxture.com` still returns 502 as of this
  note; unrelated to C3, app itself confirmed healthy via tailnet direct.
- Letters `60` (Atlas) and `70` (Runos) - still open.
