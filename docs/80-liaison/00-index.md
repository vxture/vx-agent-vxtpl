# 80-liaison - Cross-org liaison

Cross-organization liaison for this repo: reply letters, integration agreements,
and sync notes with other product lines or the platform line. Artifacts carry a
`YYMMDDHHMM` stamp (in the filename after the `NN-` index, so the docs-numbering
guardrail still passes).

| File | Stamp | To | Subject | Status |
|------|-------|----|---------|--------|
| `10-2607211400-vxtpl-edge-vhost-request.md` | 2607211400 | platform line | install `vxtpl.vxture.com` edge vhost -> `vx-worker-02:3232` | closed - platform confirmed vhost live |
| `20-2607211320-vxtpl-platform-credential-request.md` | 2607211320 | platform line | issue C1 OIDC client secret + C2 platform API/S2S token + C3 webhook signing secret so vxtpl login/subscription/provisioning go live | open |
| `30-2607211500-vxtpl_301-shared-health-recovery-reply.md` | 2607211500 | platform line | reply to `vxtpl_301`: `@vxture/shared` wired, vendored health-identity deviation (TD-002) recovered and closed | closed |
| `40-2607241900-vxtpl-port-reassignment.md` | 2607241900 | platform line | vxtpl app port reassigned 3232 -> 3210 (platform edge vhost updated, template host/docs follow) | closed |
| `50-2608130250-vxtpl-edge-502-after-port-cutover.md` | 2608130250 | platform line | edge `vxtpl.vxture.com` returns 502 after template-side 3210 cutover verified healthy | open |
| `60-2608130300-vxtpl-atlas-chat-request.md` | 2608130300 | platform line | scope decision + S2S credential request so vxtpl chat can consume Atlas (mock resolver ships now regardless) | open |
| `70-2608131500-vxtpl-runos-capability-check-request.md` | 2608131500 | platform line | scope decision + S2S credential request so vxtpl can verify Runos discovery (agent-facing, read-only) | open |
| `80-2608131530-vxtpl-repo-renamed.md` | 2608131530 | platform line | repo renamed vxture-template -> vxture-vxtpl (informational) | closed |
| `90-2608131600-vxtpl-c3-webhook-secret-received.md` | 2608131600 | platform line | C3 provisioning webhook secret set on worker02, verified live | closed |
| `100-2608160200-vxtpl-product-grade-exemplar-and-s2s-correction.md` | 2608160200 | platform line | vxtpl repositioned as a deployed product + reference build (supersedes 80's positioning); withdraws the static-S2S-token asks in 60/70 as structurally impossible; asks for registration + coverage instead | open |
| `110-2608160600-vxtpl-atlas-runos-integration-questions.md` | 2608160600 | Atlas line, Runos line | integration questions filed as vxture-runos#116 (delegation_token aud contract) and vxture-atlas#198 (product-endpoint grants, real production endpointCodes, no consumer-side catalog self-check) | closed - both answered, see 120 |
| `120-2608170300-vxtpl-l1-contract-refresh-answers.md` | 2608170300 | Atlas line, Runos line, platform line | answers received and applied: Runos fixed the delegation doc + hardened the check, Atlas built `GET /v1/endpoints`; vxtpl was missing the required `taskId` and had been reading stale docs | closed on vxtpl's side |
| `130-2608311620-vxtpl-game-metric-registration.md` | 2608311620 | platform line | register counter metric `vxtpl.game.runs` (required) and optional limit key `vxtpl.game.runs_per_day` for the challenge game (ADR-006) | open |
| `140-2609011030-vxtpl-conformance-refresh-and-credential-question.md` | 2609011030 | platform line | conformance refresh applied per the integration general rules (consume always-200 contract, end_user_id, eviction breadth, full-channel /platform-check); asks which credential new products should present to /platform/* and /usage/* now that shared tokens are a retired class | open |
| `150-2609011400-vxtpl-port-cutover-execute.md` | 2609011400 | platform line | execute the vxtpl port cutover (edge vhost 3210 -> 4000): v0.3.0 is live and healthy on worker-02 :4000, the old port has no listener, public vhost 502s until the five proxy_pass sites flip per the registry and the conf's own flip-back commitment | open |
