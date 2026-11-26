/**
 * Derives the browser-visible label for a verified workspace scope.
 * @package @vxtpl/app
 * @layer Application
 * @category Session
 * @author AI-Generated
 * @date 2026-11-26
 */

import { createHmac } from "node:crypto";
import type { OidcConfig } from "./config";

/**
 * Keeps the scope stable across replicas, token refresh and re-login.
 * @param client - Accounts issuer and the product's confidential client.
 * @param subject - Subject of the verified session.
 * @param organization - Active organization in the verified session.
 * @param workspace - Active workspace in the verified session.
 * @returns A scope label for draft isolation and stale-request detection.
 */
export function workspaceScopeKey(
  client: Pick<OidcConfig, "issuer" | "clientId" | "clientSecret">,
  subject: string,
  organization: string | null,
  workspace: string,
): string {
  return createHmac("sha256", client.clientSecret)
    .update(JSON.stringify(["workspace-scope:v1", client.issuer, client.clientId, subject, organization, workspace]))
    .digest("base64url");
}
