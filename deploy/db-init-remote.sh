#!/usr/bin/env bash
# db-init's remote half: runs ON THE DEPLOY HOST (db-init.yml rsyncs the
# pinned commit's database/ddl beside it and invokes it with the variables
# below), or locally against a URL for a rehearsal. Applies the DDL set to the
# environment's database, ONCE PER FILE, keeping the ledger (ADR-008;
# database/ddl/ledger.sql).
#
# Variables (all required on the host):
#   REPO_DIR       the directory holding database/ddl - the checkout's DDL,
#                  rsync'd by the workflow to <STACK_ROOT>/db-init/<sha>
#   ENV_FILE       the operator .env (<STACK_ROOT>/etc/.env)
#   ACTION         apply | verify
#   PRODUCT_CODE   vxtpl
#   PROJECT_NAME   compose project (containers are <PROJECT_NAME>-db / -app)
#   DB_ENV         prod | beta   (database is vxturebiz_<snake>_<DB_ENV>)
#   SNAKE          PRODUCT_CODE with - replaced by _
#   GIT_SHA        the commit being applied, recorded in the ledger
#   EXPECTED_INCR  how many increments the pinned commit carries - CI counted
#                  them, so "the glob matched nothing" cannot pass as success
#                  (the 2026-09-01 outage: a stale host copy applied zero)
#   BOOTSTRAP_THROUGH  optional, e.g. 0003: a database that predates the
#                  ledger is declared to be at this increment; the trio and
#                  every increment up to it are recorded, not run. Refused
#                  when the ledger already has rows.
# Rehearsal only:
#   DB_URL         a postgres URL; psql runs here instead of in the container,
#                  and the service-role password step is skipped.
set -euo pipefail
cd "$REPO_DIR"
DB="vxturebiz_${SNAKE}_${DB_ENV}"
CONT="${PROJECT_NAME}-db"
ENV_FILE="${ENV_FILE:-$(cd "$REPO_DIR/.." && pwd)/etc/.env}"
if [ -n "${DB_URL:-}" ]; then
  run() { psql "$DB_URL" -v ON_ERROR_STOP=1 "$@"; }
else
  run() { docker exec -i "$CONT" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
fi
# The DDL carries vxtpl's real role name (vxtpl_svc) - it is applied verbatim,
# with no substitution layer between the file and the database.
apply_file() { run < "$1"; }
LEDGER="vxtpl_meta.applied_ddl"
q() { run -Atc "$1"; }
is_applied() { [ "$(q "SELECT 1 FROM ${LEDGER} WHERE name = '$1'")" = "1" ]; }
record() { q "INSERT INTO ${LEDGER} (name, applied_by, git_sha) VALUES ('$1', '$2', '${GIT_SHA:-}') ON CONFLICT (name) DO NOTHING" >/dev/null; }
list_tables() {
  run -c "SELECT table_schema||'.'||table_name FROM information_schema.tables WHERE table_schema IN ('vx_provision','local_authz','local_usage','vxtpl_game') ORDER BY 1;"
}

# Service-role password. The role is created LOGIN-only (no password) by
# 97_service_role.sql; the app connects as vxtpl_svc over TCP (scram), so the
# role needs a password matching the operator .env's DATABASE_URL
# (postgresql://<svc>:PASSWORD@host...). Parse it here - it lives only on the
# host and never transits CI. Empty if the URL carries no password.
svc_pw=""
if [ -f "$ENV_FILE" ]; then
  db_url="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed 's/^DATABASE_URL=//')"
  db_url="${db_url%\"}"; db_url="${db_url#\"}"
  creds="${db_url#*://}"; creds="${creds%%@*}"
  case "$creds" in *:*) svc_pw="${creds#*:}" ;; esac
fi

# THE LEDGER FIRST, always - it is what tells the rest of this script what to do.
apply_file database/ddl/ledger.sql

if [ "$ACTION" = "verify" ]; then
  echo "[db-init] contract + domain schema tables:"
  list_tables
  echo "[db-init] service role state:"
  run -c "SELECT rolname, rolcanlogin, (rolpassword IS NOT NULL) AS has_password FROM pg_roles WHERE rolname = '${SNAKE}_svc';"
  if [ -n "$svc_pw" ]; then echo "[db-init] .env DATABASE_URL carries a svc password: yes"; else echo "[db-init] .env DATABASE_URL carries a svc password: no"; fi
  echo "[db-init] ledger: $(q "SELECT count(*) FROM ${LEDGER}") file(s) recorded; latest:"
  run -c "SELECT name, applied_at, applied_by, git_sha FROM ${LEDGER} ORDER BY applied_at DESC, name DESC LIMIT 5;"
  exit 0
fi

shopt -s nullglob
incr_files=(database/ddl/incr/*.sql)
if [ "${#incr_files[@]}" -ne "${EXPECTED_INCR:-${#incr_files[@]}}" ]; then
  echo "[db-init] FATAL: ${#incr_files[@]} increment file(s) arrived; the pinned commit carries ${EXPECTED_INCR}" >&2
  exit 1
fi

# A DATABASE THAT PREDATES THE LEDGER. Nothing recorded, yet the baseline is
# there: the files have been applied, just never written down. Re-running
# them is exactly what this ledger exists to stop, so the operator says where
# the database stands and that much is recorded as applied. Once.
recorded="$(q "SELECT count(*) FROM ${LEDGER}")"
has_baseline="$(q "SELECT to_regclass('local_authz.member') IS NOT NULL")"
if [ "$recorded" = "0" ] && [ "$has_baseline" = "t" ]; then
  if [ -z "${BOOTSTRAP_THROUGH:-}" ]; then
    echo "::error::this database predates the ledger and is not empty - pass bootstrap_through=NNNN (the last increment it already has) to record where it stands" >&2
    exit 1
  fi
  record baseline bootstrap
  n=0
  for f in "${incr_files[@]}"; do
    name="$(basename "$f" .sql)"
    num="${name%%_*}"
    if [ "$((10#$num))" -le "$((10#$BOOTSTRAP_THROUGH))" ]; then record "$name" bootstrap; n=$((n + 1)); fi
  done
  echo "[db-init] ledger bootstrapped: baseline + $n increment(s) through $BOOTSTRAP_THROUGH recorded as already applied"
elif [ -n "${BOOTSTRAP_THROUGH:-}" ]; then
  echo "::error::bootstrap_through given but the ledger already has $recorded row(s) (or the database is empty) - refusing to guess" >&2
  exit 1
fi

# THE TRIO, on a fresh database only.
if is_applied baseline; then
  echo "[db-init] baseline trio already applied; skipping 00 / 97 / 98"
else
  for f in database/ddl/00_baseline.sql database/ddl/97_service_role.sql database/ddl/98_column_locks.sql; do
    echo "[db-init] applying $(basename "$f")"
    apply_file "$f"
  done
  record baseline db-init
fi

# EVERY INCREMENT NOT YET RECORDED, in order.
applied=0; skipped=0
for f in "${incr_files[@]}"; do
  name="$(basename "$f" .sql)"
  if is_applied "$name"; then skipped=$((skipped + 1)); continue; fi
  echo "[db-init] applying incr $name"
  apply_file "$f"
  record "$name" db-init
  applied=$((applied + 1))
done
echo "[db-init] increments: $applied applied, $skipped already recorded"

if [ -n "${DB_URL:-}" ]; then
  echo "[db-init] rehearsal: service-role password step skipped"
  echo "[db-init] resulting contract + domain schema tables:"
  list_tables
  echo "[db-init] done."
  exit 0
fi

# Give the service role its password so the app can authenticate. Source of
# truth is the operator .env's DATABASE_URL. If it has none yet, generate one,
# patch DATABASE_URL in place (600 file, host-only), and bounce the app so it
# reconnects with the new URL - keeping runtime and DB in agreement without a
# full .env re-bootstrap.
if [ -z "$svc_pw" ]; then
  svc_pw="$(openssl rand -hex 24 2>/dev/null || head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  if [ ! -f "$ENV_FILE" ]; then
    echo "[db-init] ERROR: $ENV_FILE not found; cannot persist svc password" >&2
    exit 1
  fi
  sed -i -E "s#(^DATABASE_URL=\"?postgresql://${SNAKE}_svc:)[^@]*@#\1${svc_pw}@#" "$ENV_FILE"
  echo "[db-init] no svc password in .env; generated one and patched DATABASE_URL"
  docker restart "${PROJECT_NAME}-app" >/dev/null 2>&1 || true
fi
# Pipe the ALTER over stdin (never argv) so the password stays out of ps.
esc="$(printf '%s' "$svc_pw" | sed "s/'/''/g")"
printf "ALTER ROLE %s_svc PASSWORD '%s';\n" "$SNAKE" "$esc" | run
echo "[db-init] service-role password set"
# Every apply ends by SHOWING what the database now has. A structure change
# that reports only "done" is a change nobody checked.
echo "[db-init] resulting contract + domain schema tables:"
list_tables
echo "[db-init] done."
