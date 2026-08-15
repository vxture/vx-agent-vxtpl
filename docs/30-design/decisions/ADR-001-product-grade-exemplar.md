# ADR-001: vxtpl is a deployed product, not a placeholder skeleton

- **Status:** accepted
- **Date:** 2026-08-16
- **Supersedes:** the placeholder-cascade model described in the pre-2026-08-16
  `CLAUDE.md` and the positioning recorded in liaison letter
  `80-2608131530-vxtpl-repo-renamed.md`

## Context

This repo began as `vxture-template`: a domain-neutral skeleton carrying the org
governance base and a `__PRODUCT_CODE__` placeholder that
`scripts/init/instantiate.mjs` substituted when a real product repo was created.
The repo itself was never meant to be a product.

Two things happened to that model.

First, it stopped being true. Across batches 2 and E the repo grew a real Next.js
application, a business-face database, an OIDC relying-party flow, an entitlement
resolver, an HMAC-verified provisioning webhook, and a tag-to-production deploy
chain - and it shipped four production releases to `vxtpl.vxture.com`. The
governance docs still described a skeleton with no application source while the
application was serving traffic.

Second, the placeholder mechanism was quietly load-bearing in a way nobody
intended. Because the source tree carried `__PRODUCT_CODE__` rather than a real
name, `build.yml` had to run `instantiate.mjs vxtpl` against the ephemeral CI
checkout before every image build. The deployed artifact was therefore never the
thing in the repository - it was a machine-generated variant of it. The repo could
not be run, read, or reasoned about as the product it deployed, and the one file
the mechanism could not fix (the edge vhost, whose *filename* was a placeholder
and whose upstream port had a sentinel no script ever replaced) had silently
drifted from the config actually installed on the edge.

A skeleton also cannot answer the questions a new product repo actually has. Not
"where do I put my capability matrix" but "what does a correct Atlas call look
like, what does the token for it cost, what happens when entitlement says no."
An empty slot teaches none of that.

## Decision

vxtpl is a deployed Vxture product **and** the reference build new product repos
are copied from. These are the same artifact by design.

1. **No placeholders.** Every name in the tree is the literal `vxtpl` value that
   runs in production. `instantiate.mjs` and the `build.yml` step that invoked it
   are deleted; CI builds the repository as-is.
2. **Product creation is copy-and-rename.** `scripts/init/rename-product.mjs`
   rewrites the name cascade - contents and file/directory names - for a copied
   repo. It is site-aware (snake for database identifiers, upper for secret names)
   and it refuses to rewrite vxtpl's liaison history, which belongs to vxtpl.
3. **The exemplar zone replaces the blank zone.** Where the template previously
   shipped an empty slot with a comment, vxtpl ships a working implementation a
   copy is expected to edit. The rigid zone - governance, CI contexts, the
   three-channel mechanism, DB governance, docs numbering - is unchanged.
4. **Real integration is the acceptance bar.** vxtpl must genuinely call Atlas and
   Runos with platform-minted credentials. Mock resolvers remain for local dev and
   CI, and are refused when `DEPLOY_STAGE` is `production` or `beta` so a deployed
   stack cannot silently serve mock entitlements.

## Consequences

- The deployed image is now built from the repository verbatim. What you read is
  what runs.
- `vars.PRODUCT_CODE` is no longer consulted by any workflow. The repo variable
  can be removed once no branch references it.
- Renaming became harder in exactly the place it should be visible: a hyphenated
  product code produces three lexical forms, and `rename-product.mjs` has to encode
  that. The old placeholder scheme hid this by carrying three separate dunder
  tokens; the cost of losing them is one ordered replacement table.
- vxtpl's liaison correspondence, batch tracker, and tech-debt register are its
  own. A copy deletes them rather than inheriting a fabricated history - the rename
  script reports them instead of rewriting them.
- Being the exemplar raises the bar for every gap: a shortcut taken here
  propagates into every product copied from here. Known gaps are tracked as
  tech debt in `docs/60-operations/`, not left as comments.
