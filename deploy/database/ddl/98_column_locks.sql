-- Column-level UPDATE whitelist (governance section 7). REVOKE table UPDATE, then
-- GRANT only the writable columns. Anchor columns (id, *_id reference keys,
-- created_at) are never writable. Append-only / link tables get no UPDATE at all.
-- Adding a writable column requires updating this whitelist, or the service write
-- fails with permission denied.

-- --- vx_provision ---
REVOKE UPDATE ON vx_provision.app_instance FROM vxtpl_svc;
GRANT UPDATE (status, env, provisioned_at, updated_at)
  ON vx_provision.app_instance TO vxtpl_svc;

-- webhook_delivery: append-only idempotency ledger -> no UPDATE.
REVOKE UPDATE ON vx_provision.webhook_delivery FROM vxtpl_svc;

REVOKE UPDATE ON vx_provision.provision_seq FROM vxtpl_svc;
GRANT UPDATE (last_seq, updated_at)
  ON vx_provision.provision_seq TO vxtpl_svc;

-- --- local_authz ---
REVOKE UPDATE ON local_authz.member FROM vxtpl_svc;
GRANT UPDATE (display_name, avatar_hash, status, updated_at)
  ON local_authz.member TO vxtpl_svc;

-- role / permission catalogs are seeded via db-init, not mutated at runtime.
REVOKE UPDATE ON local_authz.role FROM vxtpl_svc;
REVOKE UPDATE ON local_authz.permission FROM vxtpl_svc;

-- link tables: insert/delete only.
REVOKE UPDATE ON local_authz.member_role FROM vxtpl_svc;
REVOKE UPDATE ON local_authz.role_permission FROM vxtpl_svc;

-- --- local_usage ---
-- raw: the flush job flips `flushed`; nothing else is mutable.
REVOKE UPDATE ON local_usage.raw FROM vxtpl_svc;
GRANT UPDATE (flushed) ON local_usage.raw TO vxtpl_svc;

REVOKE UPDATE ON local_usage.checkpoint FROM vxtpl_svc;
GRANT UPDATE (flushed_at) ON local_usage.checkpoint TO vxtpl_svc;
