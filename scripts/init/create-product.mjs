#!/usr/bin/env node
/**
 * Creates an independent repository from the managed product template files.
 * @package vxture-vxtpl
 * @layer Application
 * @category Bootstrap
 * @author AI-Generated
 * @date 2026-11-26
 */

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

// ============================================================================
// Template selection
// ============================================================================

const root = resolve(import.meta.dirname, "../..");
const managedRootFiles = new Set([
  ".dockerignore", ".editorconfig", ".env.example", ".gitattributes", ".gitignore",
  ".gitleaks.toml", ".npmrc", ".osv-scanner.toml", "AGENTS.md", "CLAUDE.md", "README.md",
  "docker-compose.yml", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
]);
const managedPrefixes = [".github/", ".husky/", "configs/", "deploy/", "docs/", "portals/", "scripts/"];
const localPath = /(?:^|\/)(?:\.env(?:\.[^/]*)?|[^/]+\.(?:env|pem|key|crt|p12|pfx|log)|node_modules|output|\.next|\.playwright-cli|private|runtime|data|backup|generated)(?:\/|$)/i;
const historicalPath = /^(?:docs\/(?:60-operations|70-workplan|80-liaison)\/|docs\/30-design\/(?:10-template-foundation\.md|20-framework-preview\/|decisions\/)|docs\/50-deployment\/30-l1-integration-plan\.md$)/;
const examplePath = /^(?:portals\/app\/app\/(?:api\/game\/|game\/|play\/|\(product\)\/challenge\/)|portals\/app\/public\/deck-frame-arc\.png$|deploy\/database\/ddl\/incr\/000[12]_|docs\/(?:20-specs\/20|40-implementation\/40)-challenge-game\.md$)/;

function git(args, cwd = root) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}

function managedFiles(includeCandidate, includeExample) {
  const tracked = git(["ls-files", "--cached", "-z"]).split("\0");
  const candidateSource = /^(?:portals\/app\/(?:app\/[^\0]+\.(?:ts|tsx|css)|instrumentation\.ts|product\.config\.json)|scripts\/(?:init|doctor)\/[^/]+\.mjs)$/;
  // A checkout implementing the generator for the first time uses its
  // scoped source additions. Released copies default to tracked files.
  const candidates = includeCandidate || !tracked.includes("scripts/init/create-product.mjs")
    ? git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter((path) => candidateSource.test(path))
    : [];
  return [...new Set([...tracked, ...candidates])].filter((path) => {
    if (!path || historicalPath.test(path) || (!includeExample && examplePath.test(path))) return false;
    if (path !== ".env.example" && localPath.test(path)) return false;
    if (!(managedRootFiles.has(path) || managedPrefixes.some((prefix) => path.startsWith(prefix)))) return false;
    const fullPath = join(root, path);
    return existsSync(fullPath) && lstatSync(fullPath).isFile();
  });
}

// ============================================================================
// Fresh project files
// ============================================================================

function replaceRequired(text, from, to, path) {
  if (!text?.includes(from)) throw new Error(`Template anchor is missing in ${path}`);
  return text.replace(from, to);
}

function removeExampleSchema(text, path) {
  const domain = /^\/\/ ===== ([a-z][a-z0-9_]*_game) \(domain schema, incr\/0001\) =====\n\nmodel GameRun \{[\s\S]*?^\}\n/m.exec(text);
  if (!domain) {
    if (!/\bmodel GameRun\b/.test(text)) return text;
    throw new Error(`Example schema boundary is missing in ${path}`);
  }
  const remaining = text.slice(0, domain.index) + text.slice(domain.index + domain[0].length);
  return replaceRequired(remaining, `, "${domain[1]}"`, "", path).trimEnd() + "\n";
}

function deriveFiles(paths, includeExample) {
  const files = new Map(paths.map((path) => [path, readFileSync(join(root, path))]));
  const read = (path) => files.get(path)?.toString("utf8").replace(/\r\n/g, "\n");
  const write = (path, text) => files.set(path, Buffer.from(text));

  // The registry setup is part of the versioned template. A local npm login
  // may have written credentials into a working copy of this file.
  write(".npmrc", git(["show", "HEAD:.npmrc"]));
  const exampleEnv = read(".env.example");
  if (!exampleEnv || /^(?:OIDC_CLIENT_SECRET|POSTGRES_PASSWORD|PROVISION_WEBHOOK_SECRET(?:_NEXT)?|INTERNAL_JOB_TOKEN)\s*=\s*[^#\s]/m.test(exampleEnv)) {
    throw new Error("The environment example must have empty credential fields");
  }
  for (const [path, heading] of [
    ["docs/30-design/decisions/00-index.md", "Architecture decisions"],
    ["docs/60-operations/00-index.md", "Operations"],
    ["docs/70-workplan/00-index.md", "Work plan"],
    ["docs/80-liaison/00-index.md", "Platform coordination"],
  ]) write(path, `# ${heading}\n\nRecord this product's own entries here.\n`);

  write("README.md", "# Vxture product workspace\n\n" +
    "Run `pnpm install --frozen-lockfile` and `pnpm dev` to start the workspace locally. " +
    "The product exposes the public entry, gate, work home, chat and platform demonstration. " +
    "Open `/system/frameworks` in development to inspect the five shared page structures.\n\n" +
    "Use `pnpm doctor` to check configuration and the " +
    "[platform registration checklist](docs/50-deployment/10-platform-registration-checklist.md) for live setup.\n");
  write("docs/20-specs/10-product-definition.md",
    "# Vxtpl product definition\n\nThe product uses the Vxture workspace shell, account entry and platform integration. " +
    "Record its business scope, navigation, permissions and availability here.\n");
  const registration = "docs/50-deployment/10-platform-registration-checklist.md";
  write(registration, "# Platform registration checklist\n\n" +
    "- [ ] Confirm product registration, the environment's confidential OIDC client and all registered redirect URIs.\n" +
    "- [ ] Confirm the allocated port, edge route, designated test workspace, product seat and coverage.\n" +
    "- [ ] Register the provisioning delivery URL, signature secret, usage metrics and internal flush schedule.\n" +
    "- [ ] Confirm the Atlas endpoints and Runos capabilities used in this product.\n" +
    "- [ ] Validate the live workspace, receipts and same-session logout before release.\n\n" +
    "Use the [integration general rules](https://claude.ai/code/artifact/20e37039-ea59-4c5d-9fab-ba3ca3ad54f0) " +
    "and the [integration example](https://claude.ai/code/artifact/f0bd83c7-6296-4200-a7d8-108b7755f584).\n");
  const deployment = "docs/50-deployment/00-index.md";
  write(deployment, read(deployment).split("\n").filter((line) => !line.includes("30-l1-integration-plan.md")).join("\n"));
  const agreement = "CLAUDE.md";
  const sourceAgreement = read(agreement);
  const introduction = sourceAgreement.indexOf("\n## What ");
  const nameCascade = sourceAgreement.indexOf("\n## Name cascade", introduction);
  if (introduction === -1 || nameCascade === -1) throw new Error("Product introduction is missing in CLAUDE.md");
  write(agreement, sourceAgreement.slice(0, introduction) +
    "\n## Product foundation\n\nThis repository starts from the Vxture product template. Use pnpm for the workspace and the " +
    "platform registration checklist for endpoint, client, environment and acceptance setup. " +
    "Organization-wide engineering and repository standards live in the platform repository.\n" +
    sourceAgreement.slice(nameCascade));

  if (!includeExample) {
    write("portals/app/product.config.json", JSON.stringify({ homeMode: "overview", directDestination: "/home", example: null }, null, 2) + "\n");
    const work = "portals/app/app/framework/recent-work.server.ts";
    write(work, replaceRequired(read(work), "../game/recent-work.server", "./empty-work.server", work));
    const features = "portals/app/app/entitlement/example-capabilities.ts";
    write(features, replaceRequired(read(features), 'export { exampleCapabilities } from "../game/capabilities";',
      'import type { Tier } from "./types";\n\n/** Supplies feature keys for an installed example. */\nexport function exampleCapabilities(_tier: Tier): readonly string[] { return []; }', features));
    const schema = "portals/app/prisma/schema.prisma";
    write(schema, removeExampleSchema(read(schema), schema));
    const dbInit = "deploy/db-init-remote.sh";
    write(dbInit, read(dbInit).replace(/,'[a-z][a-z0-9_]*_game'\)/, ")"));
    const ddlIndex = "deploy/database/ddl/incr/README.md";
    write(ddlIndex, "# Database increments\n\nApply numbered SQL increments through the db-init workflow. " +
      "Keep DDL, column privileges and Prisma models in step.\n");
    for (const [index, name] of [
      ["docs/20-specs/00-index.md", "20-challenge-game.md"],
      ["docs/40-implementation/00-index.md", "40-challenge-game.md"],
    ]) write(index, read(index).split("\n").filter((line) => !line.includes(name)).join("\n"));
  }
  return files;
}

// ============================================================================
// Command
// ============================================================================

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string" },
      "with-emberstorm": { type: "boolean", default: false },
      "include-candidate": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const [code] = positionals;
  if (positionals.length !== 1 || !/^[a-z][a-z0-9_-]{0,31}$/.test(code ?? "")) {
    throw new Error("Usage: node scripts/init/create-product.mjs <product_code> [--output <dir>] [--with-emberstorm]");
  }
  const current = /productCode:\s*"([^"]+)"/.exec(readFileSync(join(root, "portals/packages/shared/src/brand.ts"), "utf8"))?.[1];
  if (!current || current === code) throw new Error("Choose a new product code");
  const output = values.output ? resolve(values.output) : resolve(root, "..", `vx-agent-${code}`);
  const child = relative(root, output);
  if (!child || (!isAbsolute(child) && child !== ".." && !child.startsWith(".." + sep))) {
    throw new Error("Choose an output outside the source checkout");
  }
  if (existsSync(output)) throw new Error("The output directory already exists");

  const paths = managedFiles(values["include-candidate"], values["with-emberstorm"]);
  if (values["with-emberstorm"] && !paths.includes("portals/app/app/play/page.tsx")) {
    throw new Error("Emberstorm sources are unavailable in this template. Use the Vxtpl source checkout.");
  }
  const files = deriveFiles(paths, values["with-emberstorm"]);
  console.log(`[create-product] ${code}: ${files.size} managed files, example=${values["with-emberstorm"] ? "on" : "off"}`);
  console.log(`[create-product] Output ${output}`);
  if (!values["dry-run"]) {
    mkdirSync(output);
    for (const [path, contents] of files) {
      const destination = join(output, path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, contents, { mode: path.endsWith(".sh") || path.startsWith(".husky/") ? 0o755 : 0o644 });
    }
    const report = execFileSync(process.execPath, ["scripts/init/rename-product.mjs", code], {
      cwd: output, encoding: "utf8", env: { ...process.env, VX_PRODUCT_GENERATOR: "on" },
    });
    for (const line of report.split(/\r?\n/).filter((entry) => /^\[rename\]|^  (?:OIDC|database|service role|public vhost)/.test(entry))) {
      console.log(line);
    }
    git(["init", "--quiet", "--initial-branch=main"], output);
    console.log("[create-product] Install with pnpm install --frozen-lockfile. Run pnpm doctor for platform readiness.");
  }
} catch (error) {
  console.error(`[create-product] ${error.message}`);
  process.exitCode = 1;
}
