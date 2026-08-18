# rebuild - Rebuild and branch-protection artifacts

Artifacts used to bring this repo to org standard and to protect `main`.

| File | Purpose |
|------|---------|
| `main-ruleset.json` | the branch-protection ruleset, copied verbatim from the platform standard. Applied via `gh api repos/vxture/<repo>/rulesets`. Requires the five status checks `quality-gate` / `build` / `test-coverage` / `audit` / `gitleaks`; requires PR (0 approvals), blocks deletion and non-fast-forward, requires linear history, squash-only. Single-owner repos keep `required_approving_review_count=0`. |

## `bypass_actors` is empty, and must stay empty

This is the one field in the file worth calling out, because it reads as an
omission and is not.

The file used to carry `{ "actor_id": 5, "actor_type": "RepositoryRole",
"bypass_mode": "always" }` - repo admin, every situation, including a direct
push. For any admin, PR-required, the five status checks, linear history,
no force-push and no branch deletion were all suggestions. It surfaced by
accident in a sibling repo: a commit pushed straight to `main` succeeded against
a CLAUDE.md that said direct pushes were blocked. Every repo in the org had it,
because every repo was bootstrapped from this file.

The live rulesets were fixed at the time; this file was not, so the next repo
created would have inherited it again. That is the shape of the risk here - this
file is not documentation, it is the artifact applied verbatim, so a weakened
protection propagates rather than stays local.

`scripts/guardrails/check-ruleset.mjs` now fails CI on an empty-to-non-empty
change, on a dropped required context, and on the removal of any structural
rule. A protection with an exemption for the role most able to use it is a note,
not a control.

Bootstrap order (empty repo): first-push `main` and let CI produce the required
checks once, THEN apply the ruleset - see `../20-github-bootstrap-checklist.md`.
