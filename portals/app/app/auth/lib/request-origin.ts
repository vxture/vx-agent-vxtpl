/**
 * Same-origin checks for browser session operations.
 * @package @vxtpl/app
 * @layer Application
 * @category Security
 * @author AI-Generated
 * @date 2026-11-26
 */

export function acceptsBrowserOrigin(request: Request, appOrigin: string): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    if (appOrigin) return origin === new URL(appOrigin).origin;
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    return origin === new URL(`${url.protocol}//${host}`).origin;
  } catch {
    return false;
  }
}
