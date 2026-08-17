#!/usr/bin/env node
// Port guardrail: this product states its port in eight places, and they must agree.
//
// The org port registry allocates one number per product and is the only source
// permitted to assign one. Its rule R3 makes three things equal - the dev port,
// the in-code fallback default, and the port the app listens on INSIDE the
// container - while the PUBLISHED host port stays a variable, which is what lets
// a prod and a beta stack of one product share a host.
//
// So the repo holds the number in several files, by necessity: a Dockerfile
// cannot read compose, an nginx vhost cannot read a shell script. What it must
// not hold is a number that disagrees with itself.
//
// WHY THIS EXISTS. On 2026-08-17 vxtpl's published port and its container port
// were both made variables, sourced from an env value that did not reach every
// consumer. The container came up on the operator's number, the deploy script
// probed the default, and the deploy reported a health failure against a
// container Docker had already marked healthy. Meanwhile the public edge had
// been retargeted to the new allocation while the deploy host still carried the
// old one, so the site had been returning 502 the whole time for a completely
// separate reason. Three numbers, three files, no single place where the
// disagreement was visible. Every individual file looked correct.
//
// This check is what makes that class of failure loud. It is deliberately dumb:
// it reads the number out of each file and compares. It cannot tell you the
// number is the RIGHT one - only the registry can - but it can tell you the repo
// is telling one story.
//
// THE PUBLISHED PORT IS NOT CHECKED against the others, on purpose: on the
// deploy host it is whatever the operator .env says, and disagreeing with the
// container port is legal there (that is how arda runs beta). What is checked is
// that the repo's DEFAULT for it matches, so a fresh clone is coherent.

import { readFileSync } from "node:fs";

const STRICT = process.argv.includes("--strict");

/**
 * Each site: where the number lives, and how to pull it out.
 *
 * Adding a place that states the port means adding it here. That is the point -
 * a new file with a hardcoded port and no entry is exactly the drift this
 * catches, so the list is maintained by hand rather than guessed at.
 */
const SITES = [
  {
    file: "docker-compose.yml",
    what: "container-internal port (app listens here)",
    re: /^\s*PORT:\s*"(\d+)"/m,
  },
  {
    file: "docker-compose.yml",
    what: "published mapping, container side",
    re: /^\s*-\s*"\$\{APP_PUBLISH_PORT:-\d+\}:(\d+)"/m,
  },
  {
    file: "docker-compose.yml",
    what: "published mapping, repo default for the host side",
    re: /^\s*-\s*"\$\{APP_PUBLISH_PORT:-(\d+)\}:\d+"/m,
  },
  {
    file: "docker-compose.yml",
    what: "healthcheck target",
    re: /healthcheck[\s\S]*?127\.0\.0\.1:(\d+)\/api\/health/,
  },
  {
    file: "portals/app/Dockerfile",
    what: "image PORT default",
    re: /^ENV\s+.*\bPORT=(\d+)/m,
  },
  {
    file: "portals/app/Dockerfile",
    what: "image EXPOSE",
    re: /^EXPOSE\s+(\d+)/m,
  },
  {
    file: "deploy/deploy.sh",
    what: "verify target",
    re: /^APP_CONTAINER_PORT=(\d+)/m,
  },
  {
    file: "portals/app/package.json",
    what: "dev server",
    re: /"dev":\s*"next dev -p (\d+)"/,
  },
  {
    file: ".env.example",
    what: "operator template default",
    re: /^APP_PUBLISH_PORT=(\d+)/m,
  },
  {
    file: "configs/edge/vxtpl.vxture.com.conf",
    what: "edge upstream (source of record for the installed vhost)",
    re: /set \$upstream\s+"[^":]+:(\d+)"/,
  },
];

const found = [];
const missing = [];

for (const site of SITES) {
  let text;
  try {
    text = readFileSync(site.file, "utf8");
  } catch {
    missing.push({ ...site, why: "file not found" });
    continue;
  }
  const m = site.re.exec(text);
  if (!m) {
    missing.push({ ...site, why: "pattern did not match - the file changed shape" });
    continue;
  }
  found.push({ ...site, port: m[1] });
}

const ports = [...new Set(found.map((f) => f.port))];

if (missing.length === 0 && ports.length === 1) {
  console.log(`[port-consistency] OK - ${found.length} sites all state :${ports[0]}.`);
  process.exit(0);
}

if (missing.length > 0) {
  console.error(`[port-consistency] ${missing.length} site(s) could not be read:\n`);
  for (const m of missing) console.error(`  ${m.file}  (${m.what})\n      ${m.why}`);
  console.error(
    `\nA site that stopped matching is not a pass. Either the port moved somewhere this\n` +
      `check does not look, or the file was restructured - fix the pattern in\n` +
      `scripts/guardrails/check-port-consistency.mjs so it keeps watching.`,
  );
}

if (ports.length > 1) {
  console.error(`\n[port-consistency] the repo states ${ports.length} different ports:\n`);
  for (const f of found) console.error(`  :${f.port}  ${f.file}  (${f.what})`);
  console.error(
    `\nOne product, one number. The registry allocates it and is the only source that\n` +
      `may; this check only asks that the repo agree with itself. If you are moving the\n` +
      `port, move every site above - and remember the deploy host's own .env and the\n` +
      `installed edge vhost are NOT in this repo and must move in the same window.`,
  );
}

process.exit(STRICT ? 1 : 0);
