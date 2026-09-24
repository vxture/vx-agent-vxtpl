# configs/edge - public-edge vhost reference

This product does NOT own the public edge. **As of 2026-09-24 it does not supply
the installed vhost either**: the vxture platform generates every agent vhost
itself from its product registry, and there is deliberately no per-product `.conf`
on the edge.

## What actually serves vxtpl.vxture.com

The platform edge (worker-01 nginx) renders two things on every deploy:

- `agents.vhost.template` - one wildcard `*.vxture.com` server block, shared by
  every agent-line product;
- `agents-upstream.map` - `<host> -> <upstream host:port>`, generated from the
  **product registry**. The row for this product currently reads
  `vxtpl.vxture.com 100.76.219.48:4000;` (worker-02's tailnet IP + the app's
  published port).

So the only thing this product controls about its edge routing is **one field in
the platform's product catalog** ("边缘上游" on the product page in opera). There
is no file to copy and no nginx-sync step. The platform side states this for the
same class of product: "仓里没有、也不应该有 <code> 的 vhost 文件，边缘上游在
opera 的产品目录里填".

**If the upstream port ever moves, the change is in two places in one window:**
`APP_PUBLISH_PORT` on the deploy host, and that one catalog field. A port move
that touches only one of them leaves the site answering 502 (that has happened -
liaison letter 50).

## Why `vxtpl.vxture.com.conf` is still here

It is a **reference artifact**, kept for two reasons, neither of which is
"install it":

1. `scripts/init/rename-product.mjs` renames it for a product copied from this
   template, and its `$upstream` line is the one place a copied product is forced
   to confront that it needs its own port allocation.
2. It documents the response shape the edge is expected to produce (timeouts,
   forwarded headers, the `404` on the internal-only usage-flush endpoint) for
   anyone running this app behind an edge that is *not* the vxture platform.

It is **not** byte-identical to anything installed, and nothing checks it against
the platform. Treating it as the source of record is what this README used to say,
and that instruction would have an operator hand-install a vhost the platform
neither reads nor keeps (`20-sync-nginx-config.sh` clears and re-renders
`sites-enabled` on every deploy).

## Verify (no install step)

```
curl https://vxtpl.vxture.com/api/health
```

Expect the app's payload (`status`/`product`/`gitSha`/`time`), not a generic edge
stub. A `404`/`444` here means the catalog's edge-upstream field is empty or wrong,
not that a vhost is missing.

The app itself runs on the deploy host tailnet, listening on and published at the
same port; there is no on-host TLS or nginx in this repo.
