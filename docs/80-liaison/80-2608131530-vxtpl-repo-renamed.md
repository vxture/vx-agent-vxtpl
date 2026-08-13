# Liaison note: repo renamed vxture-template -> vxture-vxtpl

- Stamp: 2608131530 (2026-08-13 15:30)
- From: vxture-vxtpl line (formerly "vxture-template line")
- To: platform line
- Status: closed - informational, no action needed

## What changed

The GitHub repo `vxture/vxture-template` was renamed to `vxture/vxture-vxtpl`,
for consistency with the `vxtpl` product identity already used everywhere
else (domain `vxtpl.vxture.com`, image `vxtpl-app`, DB
`vxturebiz_vxtpl_prod`/`vxtpl_svc`, containers `vxtpl-app`/`vxtpl-db`/
`vxtpl-redis`).

## What did NOT change

- Repo identity/governance role: this is still the org's product-repo
  template (domain-neutral, no product logic), per CLAUDE.md - the rename
  only fixes a naming mismatch, it does not turn this into a dedicated
  product repo.
- `PRODUCT_CODE` remains `vxtpl`; no infra, deploy target, port, or DB
  changed.
- GitHub auto-redirects the old URL (`vxture/vxture-template` ->
  `vxture/vxture-vxtpl`), so existing bookmarks/links keep working.
- Earlier liaison letters (`10` through `70`) are left unedited and still
  say "vxture-template line" - they correctly recorded the correspondent's
  name at the time each was sent, per this repo's historical-record
  convention. Going forward, correspondence uses "vxture-vxtpl line".

## Action needed from platform line

None. If the platform repo has any hardcoded reference to the old repo name
(e.g. in an infra registry or access-grant list), it should be updated to
`vxture-vxtpl` at your convenience - not blocking.
