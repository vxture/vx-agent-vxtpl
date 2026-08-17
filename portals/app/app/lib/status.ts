import { BRAND } from "@vxtpl/shared/brand";
import { serviceIdentity } from "@vxture/shared";

// Integration-status surface (the /status dashboard + /api/status). Summarizes
// ALL platform-integration config for at-a-glance inspection.
//
// HARD RULE: never emit a secret VALUE. Secrets are reported as a presence
// boolean only (`*Configured`); identifiers (issuer, client_id, urls, db
// host/name/role) are non-secret. A DATABASE_URL is parsed for host/db/role and
// the password is dropped. The no-leak invariant is covered by status.test.ts.

export type StatusMode = "off" | "public" | "authed";

type Env = Record<string, string | undefined>;

export function statusMode(env: Env): StatusMode {
  const m = (env.STATUS_PAGE ?? "public").toLowerCase();
  return m === "off" || m === "authed" ? m : "public";
}

export interface DbInfo {
  configured: boolean;
  host?: string;
  db?: string;
  role?: string;
  reachable?: boolean | null;
}
export interface RedisInfo {
  configured: boolean;
  host?: string;
  reachable?: boolean | null;
}

export interface IntegrationStatus {
  identity: { productCode: string; gitSha: string; appEnv: string; time: string };
  c1: {
    enabled: boolean;
    issuer: string | null;
    clientId: string | null;
    redirectUri: string | null;
    scopes: string | null;
    cookieName: string | null;
    clientSecretConfigured: boolean;
  };
  c2: {
    resolver: "platform" | "mock";
    platformApiConfigured: boolean;
    authTokenConfigured: boolean;
    consoleUrl: string | null;
    cacheTtlMs: number;
  };
  c3: {
    webhookSecretConfigured: boolean;
    webhookRotationConfigured: boolean;
    internalJobTokenConfigured: boolean;
  };
  s2s: {
    /** All three are needed to mint a token; the OIDC client doubles as the S2S credential. */
    configured: boolean;
    issuer: string | null;
  };
  chat: {
    resolver: "atlas" | "mock";
    atlasApiConfigured: boolean;
  };
  capability: {
    runosApiConfigured: boolean;
  };
  /** True when a mock resolver is standing in on a stage that should not have one. */
  mockOnDeployedStage: boolean;
  data: { database: DbInfo; redis: RedisInfo };
  showInfra: boolean;
}

/** Parse the NON-SECRET parts of a postgres URL. The password is never returned. */
export function parseDbUrl(url: string | undefined): { host?: string; db?: string; role?: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      host: u.hostname || undefined,
      db: u.pathname.replace(/^\//, "") || undefined,
      role: decodeURIComponent(u.username) || undefined,
    };
  } catch {
    return null;
  }
}

function redisHost(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}

export function buildStatus(env: Env, now: string): IntegrationStatus {
  const showInfra = (env.STATUS_SHOW_INFRA ?? "on").toLowerCase() !== "off";
  const db = parseDbUrl(env.DATABASE_URL);
  return {
    identity: {
      productCode: BRAND.productCode,
      gitSha: serviceIdentity({ service: `${BRAND.productCode}-app`, product: BRAND.productCode }).gitSha,
      appEnv: env.NEXT_PUBLIC_APP_ENV ?? env.NODE_ENV ?? "unknown",
      time: now,
    },
    c1: {
      enabled: env.OIDC_RP_ENABLED === "on",
      issuer: env.OIDC_ISSUER ?? null,
      clientId: env.OIDC_CLIENT_ID ?? null,
      redirectUri: env.OIDC_REDIRECT_URI ?? null,
      scopes: env.OIDC_SCOPES ?? null,
      cookieName: env.RP_SESSION_COOKIE_NAME ?? null,
      clientSecretConfigured: Boolean(env.OIDC_CLIENT_SECRET),
    },
    c2: {
      resolver: env.PLATFORM_API_URL && env.PLATFORM_INTERNAL_AUTH_TOKEN ? "platform" : "mock",
      platformApiConfigured: Boolean(env.PLATFORM_API_URL),
      authTokenConfigured: Boolean(env.PLATFORM_INTERNAL_AUTH_TOKEN),
      consoleUrl: env.NEXT_PUBLIC_CONSOLE_URL ?? null,
      cacheTtlMs: 45_000,
    },
    c3: {
      webhookSecretConfigured: Boolean(env.PROVISION_WEBHOOK_SECRET),
      webhookRotationConfigured: Boolean(env.PROVISION_WEBHOOK_SECRET_NEXT),
      internalJobTokenConfigured: Boolean(env.INTERNAL_JOB_TOKEN),
    },
    s2s: {
      configured: Boolean(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET),
      issuer: env.OIDC_ISSUER ?? null,
    },
    chat: {
      // Only the base URL: the bearer is minted per call from the OIDC client
      // above, so there is no chat-specific token to report on.
      resolver: env.ATLAS_API_URL ? "atlas" : "mock",
      atlasApiConfigured: Boolean(env.ATLAS_API_URL),
    },
    capability: {
      runosApiConfigured: Boolean(env.RUNOS_API_URL),
    },
    // A deployed stack serving mock entitlement or chat data is a
    // misconfiguration someone chose to keep running - surface it, loudly.
    // Both C2 variables matter: the entitlement resolver falls back to the mock
    // when EITHER is missing, so testing only the URL would leave the banner
    // hidden while tiers are being fabricated.
    mockOnDeployedStage:
      (env.DEPLOY_STAGE === "production" || env.DEPLOY_STAGE === "beta") &&
      (!env.PLATFORM_API_URL || !env.PLATFORM_INTERNAL_AUTH_TOKEN || !env.ATLAS_API_URL),
    data: {
      database: {
        configured: Boolean(env.DATABASE_URL),
        ...(showInfra && db ? { host: db.host, db: db.db, role: db.role } : {}),
        reachable: null,
      },
      redis: {
        configured: Boolean(env.REDIS_URL),
        ...(showInfra ? { host: redisHost(env.REDIS_URL) } : {}),
        reachable: null,
      },
    },
    showInfra,
  };
}
