# Liaison request: register the challenge-game usage metric (and optional limit key)

- Stamp: 2608311620 (2026-08-31 16:20)
- From: vxture-vxtpl line
- To: platform line
- Status: open

## What changed

vxtpl now carries a real business domain: the 20-Second Challenge (ADR-006,
spec `docs/20-specs/20-challenge-game.md`). It meters one new unit of work and
consults one optional sales limit.

## Ask 1: counter metric `vxtpl.game.runs` (required)

One count per challenge run started. Buffered in `local_usage.raw` and flushed
through the existing C3 `POST /usage/consume` path, exactly like
`vxtpl.chat.messages`. Please add the key to the platform metric registry so
the flush is accepted; until it lands, runs buffer locally (flush-side
rejection is the failure mode to expect, nothing user-facing).

## Ask 2: max-type limit key `vxtpl.game.runs_per_day` (optional)

The free tier's daily quota defaults to 10 in product code (`FREE_DAILY_RUNS`)
and is counted locally per (workspace, sub, UTC day). If the commercial side
ever wants to tune it without a deploy, configure this key in the C2
envelope's `limits{}` - the product already reads it and lets it override the
default (tiers holding `game:unlimited-runs` ignore both). No action needed if
the product default is fine.

## No other platform surface is touched

Tier gating rides the existing C2 tiers (free/starter/pro cumulative; business
and enterprise inherit pro's game capabilities). No new OIDC scope, no new
webhook type, no Atlas/Runos involvement.
