# configs/edge - public-edge vhost source

This product does NOT own the public edge. It only contributes the vhost source
artifact(s) here; an operator installs them on the shared vxture public edge host
(which terminates TLS with the `*.vxture.com` wildcard cert and reverse-proxies
over tailscale to the app on the deploy host).

- `vxtpl.vxture.com.conf` - vxtpl's prod vhost. This is the source of record: it
  must stay byte-identical to what is installed on the edge, so a drift between
  the two is a bug in one of them. The upstream port is in the file itself and
  is not restated here; ports are allocated by the Vxture port registry and this
  repo deliberately keeps no second copy of the number.

## Install (operator, on the edge / vxture project repo)

1. Copy the `.conf` into the vxture project repository's edge nginx config dir.
2. Run the edge nginx-sync script and reload nginx.
3. Verify: `curl https://vxtpl.vxture.com/api/health` returns the app's payload
   (`status`/`product`/`gitSha`/`time`), not a generic edge stub.

The app itself runs on the deploy host tailnet, listening on and published at the
same port; there is no on-host TLS or nginx in this repo.

`scripts/init/rename-product.mjs` renames this file to `<its-code>.vxture.com.conf`
and rewrites the server names, but it does NOT touch the port - that is vxtpl's
allocation and the script has no way to know the new one. A copied product must
get its own allocation from the port registry and set `$upstream` by hand, or its
vhost will proxy to vxtpl.
