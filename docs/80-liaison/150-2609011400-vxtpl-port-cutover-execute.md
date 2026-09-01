# Liaison: execute the vxtpl port cutover (3210 -> 4000) - the condition is met

- Stamp: 2609011400 (2026-09-01 14:00)
- From: vxture-vxtpl line
- To: platform line
- Status: open (blocking public reachability of the v0.3.0 release)

## Grounds (three sources agree; the target number needs no discussion)

1. **Port registry** (the sole assigning authority): vxtpl = L3 agent-tier
   head sub-block **4000/4001** (owner reclassification 2026-08-13). The
   registry's open-items list carries "vxtpl port cutover: live old port ->
   4000/4001, pending". 3210/3211 is assigned to ontos; vxtpl must vacate it
   before ontos deploys.
2. **The platform repo's own file**
   `deploy/nginx/sites-enabled/vxtpl.vxture.com.conf` (2026-08-18 correction
   block): the five proxy_pass sites were temporarily pointed back at 3210
   because worker-02 had no :4000 listener at the time, with the explicit
   commitment "target stays 4000/4001; flip back once the vxtpl repo
   actually listens on 4000".
3. **The vxtpl repo**: all 10 port sites state :4000 (guardrail-locked), and
   `configs/edge/vxtpl.vxture.com.conf` (the vhost source of record) says
   `vx-worker-02:4000`.

## The trigger condition was met on 2026-09-01 (evidence)

- vxtpl **v0.3.0** deployed (run 33470859273, image
  `ghcr.io/vxture/vxtpl-app:sha-86640f3`); on worker-02 `vxtpl-app` now
  publishes **0.0.0.0:4000**, and the deploy's own verification printed
  `[deploy] verify OK (health 200 on container :4000, published :4000)`.
- **The old port 3210 has no listener any more** (the new container
  publishes 4000 only). The "temporary hold at 3210" therefore now points at
  an empty port - public `vxtpl.vxture.com` measures 502 - and flipping to
  4000 is the only path that restores the public site.

## Ask

1. In `deploy/nginx/sites-enabled/vxtpl.vxture.com.conf`, change the FIVE
   `proxy_pass http://${VX_WORKER02_TAILNET_IP}:3210` sites (each carries
   the temporary-hold comment) to `:4000`, and append a 2026-09-01
   cutover-executed note to the file header (keep the history blocks).
2. Ship through the platform repo's normal chain (PR -> tag -> production
   approval -> nginx dir sync + reload).

## Post-cutover verification

- `https://vxtpl.vxture.com/api/health` -> 200 with `"version":"v0.3.0"`,
  `"gitSha":"86640f3"`.
- `https://vxtpl.vxture.com/` -> the Emberstorm deck (fullscreen
  amber-on-charcoal game surface).
- If anything still fails: tailnet-direct
  `http://vx-worker-02:4000/api/health` must answer 200 - use it to separate
  an edge-layer problem from an app-layer one (the app side is verified
  healthy).

## Rollback posture

Unlike 2026-08-18, pointing back at 3210 no longer preserves anything - the
port is empty. If the flip misbehaves, the direction to investigate is
edge-to-worker-02 tailnet reachability / `${VX_WORKER02_TAILNET_IP}`
rendering, not a port revert.
