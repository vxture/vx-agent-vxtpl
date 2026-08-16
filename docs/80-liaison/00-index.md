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
| `110-2608160600-vxtpl-atlas-runos-integration-questions.md` | 2608160600 | Atlas line, Runos line | integration questions filed as vxture-runos#116 (delegation_token aud contract) and vxture-atlas#198 (product-endpoint grants, real production endpointCodes, no consumer-side catalog self-check) | open |
