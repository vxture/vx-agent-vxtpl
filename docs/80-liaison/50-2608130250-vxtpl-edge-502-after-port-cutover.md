# Liaison note: vxtpl edge returns 502 after port cutover to 3210

- Stamp: 2608130250 (2026-08-13 02:50)
- From: vxture-template line
- To: platform line
- Status: open - blocking public availability of the vxtpl demo

## Context

Per `docs/80-liaison/40-2607241900-vxtpl-port-reassignment.md`, the vxtpl app
port was reassigned `3232 -> 3210`, with the platform line reporting the shared
edge vhost (`vxtpl.vxture.com`) already updated to point at
`vx-worker-02:3210`. The template line has now completed and verified its side
of that cutover.

## Verified on the template/host side (2026-08-13)

- `/srv/md0/vxtpl/etc/.env`: `APP_PUBLISH_PORT=3210`.
- `vxtpl-app` container recreated, `docker compose ps` shows
  `0.0.0.0:3210->3000/tcp`.
- `docker exec vxtpl-app wget -qO- http://127.0.0.1:3000/api/health` -> 200,
  healthy JSON body.
- On-host `curl http://127.0.0.1:3210/api/health` -> 200.
- On-host `curl http://127.0.0.1:3232/api/health` -> connection refused (old
  port fully retired, no stale listener).

## Problem

`curl -i https://vxtpl.vxture.com/api/health` from outside the tailnet
consistently returns `502 Bad Gateway` from `nginx/1.29.8` (the shared edge),
not a template-side error. Since the app is confirmed healthy and reachable on
`127.0.0.1:3210` on the host itself, this points to the edge's upstream
config, DNS/resolver cache, or tailnet ACL not actually routing to
`vx-worker-02:3210` yet.

## Ask

Platform line: please re-verify the `vxtpl.vxture.com` edge vhost upstream
(reload nginx if the upstream was changed without a reload, confirm resolver
cache TTL, confirm tailnet ACL allows edge -> worker02:3210) and confirm with
`curl -i https://vxtpl.vxture.com/api/health` returning 200.

## Acceptance

- `curl https://vxtpl.vxture.com/api/health` returns 200 from outside the
  tailnet.
