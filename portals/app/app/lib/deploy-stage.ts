// Deploy-stage guard for the offline mock resolvers.
//
// vxtpl's mock entitlement and mock chat resolvers exist so the whole UI is
// explorable with an empty .env - that is a genuine local-dev and CI
// convenience. On a deployed stack it is a trap: a missing PLATFORM_API_URL
// would make the app serve entitlements out of MOCK_TIER, granting or denying
// paid access on the strength of an environment variable, and the only signal
// would be a badge on the status page nobody is watching.
//
// So the mock path is allowed by stage, not by accident. DEPLOY_STAGE is
// injected at image build (build.yml derives it from the git ref) and is
// "production" for a v*.*.* tag, "dev" otherwise.

export type DeployStage = "dev" | "beta" | "production";

export function deployStage(): DeployStage {
  const raw = process.env.DEPLOY_STAGE;
  return raw === "production" || raw === "beta" ? raw : "dev";
}

/** True on a stage where a mock resolver must never stand in for a real one. */
export function isDeployedStage(): boolean {
  return deployStage() !== "dev";
}

/**
 * Refuse to fall back to a mock resolver on a deployed stage.
 *
 * ALLOW_MOCK_ON_DEPLOY=on is the deliberate override - for a first deploy that
 * has to come up before its credentials are issued. It is loud on purpose: it
 * names itself, and `/api/status` reports the resolver as mock regardless.
 */
export function assertMockAllowed(channel: string, requiredEnv: string): void {
  if (!isDeployedStage()) return;
  if (process.env.ALLOW_MOCK_ON_DEPLOY === "on") {
    console.warn(
      `[${channel}] running the MOCK resolver on stage '${deployStage()}' because ` +
        `ALLOW_MOCK_ON_DEPLOY=on. This serves fabricated data. Configure ${requiredEnv}.`,
    );
    return;
  }
  throw new Error(
    `[${channel}] refusing to start on stage '${deployStage()}' without ${requiredEnv}: ` +
      "a deployed stack must not serve mock data. Configure it, or set " +
      "ALLOW_MOCK_ON_DEPLOY=on to accept fabricated data deliberately.",
  );
}
