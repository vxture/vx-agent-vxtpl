/**
 * Builds client_secret_basic credentials for the Accounts token endpoint.
 * @package @vxtpl/app
 * @layer Application
 * @category Authentication
 * @author AI-Generated
 * @date 2026-11-26
 */

/**
 * Encodes each credential before adding the Basic field separator.
 * @param client - The registered confidential client credentials.
 * @returns An HTTP Authorization header value for the token endpoint.
 */
export function oidcClientAuthorization(client: { clientId: string; clientSecret: string }): string {
  const id = encodeURIComponent(client.clientId);
  const secret = encodeURIComponent(client.clientSecret);
  return "Basic " + Buffer.from(`${id}:${secret}`, "utf8").toString("base64");
}
