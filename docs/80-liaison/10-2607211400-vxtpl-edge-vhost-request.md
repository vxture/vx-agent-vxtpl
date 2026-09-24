# Liaison request: public-edge vhost for vxtpl.vxture.com

- Stamp: 2607211400 (2026-07-21 14:00)
- From: vxture-template line
- To: platform line (owns the shared public edge)
- Status: open - awaiting platform-line install

## Context

The demo product `vxtpl` is deployed and running on **worker02** (tailnet
MagicDNS `vx-worker-02`, IP `<worker-02-tailnet-ip>`), app port
**`APP_PUBLISH_PORT=3232`** (avoids arda's 3230/3231), stack root
`/srv/md0/vxtpl`. The container's `/api/health` is verified 200.

`vxtpl.vxture.com` resolves to the shared edge, but the edge has **no vxtpl
vhost**, so requests fall to a default server and currently return arda's app
(evidence: response `lang="zh-CN"`, and vxtpl-only routes `/entitlement-matrix`
and `/status` return 404).

## Request (platform line)

Add a `vxtpl.vxture.com` vhost to the shared edge (vxture project repo
`deploy/nginx/sites-enabled/`) with upstream **`vx-worker-02:3232`** (IP form
`<worker-02-tailnet-ip>:3232` if edge-container MagicDNS is unavailable), then run
`sudo bash deploy/scripts/20-sync-nginx-config.sh` (does `nginx -t` + reload).

## vhost config

The authoritative source lives in this repo at
`configs/edge/__PRODUCT_CODE__.vxture.com.conf`; instantiated for vxtpl / port
3232 it is:

```nginx
server {
    listen 80; listen [::]:80;
    server_name vxtpl.vxture.com;
    return 301 https://vxtpl.vxture.com$request_uri;
}
server {
    listen 443 ssl; listen [::]:443 ssl;
    server_name vxtpl.vxture.com;
    ssl_certificate     /etc/nginx/ssl/live/vxture.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/live/vxture.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3; ssl_ciphers HIGH:!aNULL:!MD5;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    client_max_body_size 25m;
    resolver 100.100.100.100 valid=30s ipv6=off;
    set $upstream "vx-worker-02:3232";     # or "<worker-02-tailnet-ip>:3232" if MagicDNS is unavailable
    location = /api/usage/flush { return 404; }   # internal endpoint, not public
    location / {
        proxy_pass http://$upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection '';
    }
}
```

## Acceptance

- `curl https://vxtpl.vxture.com/api/health` returns JSON with `product` /
  `gitSha` / `time` fields (not the single-field `{"status":"ok"}`).
- `curl -o /dev/null -w '%{http_code}' https://vxtpl.vxture.com/entitlement-matrix`
  returns **200** (currently 404 = still hitting arda).

## Infra allocation (for the registry, product_240 section 2.7)

vxtpl -> host worker02 / port 3232 / stack_root `/srv/md0/vxtpl` / apex
`vxtpl.vxture.com`.
