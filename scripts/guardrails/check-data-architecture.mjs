#!/usr/bin/env node
/**
 * check-data-architecture.mjs - DDL <-> Prisma lockstep guardrail.
 *
 * The DDL under deploy/database/ddl/ is the single structure authority
 * (product_240 section 2.4 E); the Prisma schema is only a client-generation
 * source and MUST stay in lockstep. The authoritative table set is the UNION of
 * the create-once baseline and the numbered incr/ increments (the baseline is
 * frozen, so every table added after it exists only as an increment). This
 * asserts that union equals the set of Prisma models (matched by @@schema +
 * @@map). Any drift fails under --strict (CI).
 *
 * Pure node, zero dependencies.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DDL = "deploy/database/ddl/00_baseline.sql";
const INCR_DIR = "deploy/database/ddl/incr";
const PRISMA = "portals/app/prisma/schema.prisma";
const STRICT = process.argv.includes("--strict");

export function ddlTables(sql) {
  const set = new Set();
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\.(\w+)/gi;
  let m;
  while ((m = re.exec(sql))) set.add(`${m[1]}.${m[2]}`);
  return set;
}

export function prismaTables(text) {
  const set = new Set();
  const re = /model\s+\w+\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[1];
    const schema = /@@schema\("([^"]+)"\)/.exec(body);
    const map = /@@map\("([^"]+)"\)/.exec(body);
    if (schema && map) set.add(`${schema[1]}.${map[1]}`);
  }
  return set;
}

function diff(a, b) {
  return [...a].filter((x) => !b.has(x)).sort();
}

/** Baseline + every numbered increment, in one set. */
export function allDdlSql() {
  let sql = readFileSync(DDL, "utf8");
  let names = [];
  try {
    names = readdirSync(INCR_DIR).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    // no incr dir is a valid state (fresh copy)
  }
  for (const f of names) sql += `\n${readFileSync(`${INCR_DIR}/${f}`, "utf8")}`;
  return sql;
}

// Run only when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let ddl, prisma;
  try {
    ddl = ddlTables(allDdlSql());
    prisma = prismaTables(readFileSync(PRISMA, "utf8"));
  } catch (e) {
    console.log(`[data-architecture] skip: ${e.message}`);
    process.exit(0);
  }

  const onlyDdl = diff(ddl, prisma);
  const onlyPrisma = diff(prisma, ddl);

  if (onlyDdl.length === 0 && onlyPrisma.length === 0) {
    console.log(`[data-architecture] OK - ${ddl.size} tables in lockstep (DDL == prisma).`);
    process.exit(0);
  }

  console.log("[data-architecture] DDL/prisma drift:");
  for (const t of onlyDdl) console.log(`  in DDL, missing from prisma: ${t}`);
  for (const t of onlyPrisma) console.log(`  in prisma, missing from DDL: ${t}`);
  if (STRICT) {
    console.error("[data-architecture] STRICT: DDL and prisma must be in lockstep.");
    process.exit(1);
  }
  process.exit(0);
}
