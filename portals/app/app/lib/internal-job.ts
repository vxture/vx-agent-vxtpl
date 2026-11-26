/**
 * Authenticates product job scheduler requests.
 * @package @vxtpl/app
 * @layer Application
 * @category Authentication
 * @author AI-Generated
 * @date 2026-11-26
 */

import { createHash, timingSafeEqual } from "node:crypto";

export function checkInternalJob(request: Request): boolean {
  const secret = process.env.INTERNAL_JOB_TOKEN;
  const supplied = request.headers.get("x-internal-job-token");
  if (!secret || !supplied) return false;
  const digest = (input: string) => createHash("sha256").update(input).digest();
  return timingSafeEqual(digest(secret), digest(supplied));
}
