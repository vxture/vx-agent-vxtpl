/**
 * Serves the initial workspace without a configured domain work source.
 * @package @vxtpl/app
 * @layer Application
 * @category Query
 * @author AI-Generated
 * @date 2026-11-26
 */

import { readWorkspaceSession } from "../auth/lib/workspace-session";
import type { WorkRecordResult, WorkResult } from "./recent-work";

/**
 * Resolves workspace availability before displaying the empty work list.
 * @param _limit - Requested page size for the work provider.
 * @param _offset - Requested page offset for the work provider.
 * @returns Workspace availability or an empty list.
 */
export async function readRecentWork(_limit: number, _offset = 0): Promise<WorkResult> {
  const session = await readWorkspaceSession();
  switch (session.status) {
    case "ready":
    case "development": return { status: "ready", items: [], more: false };
    case "anonymous": return { status: "anonymous" };
    case "unavailable":
    case "unconfigured": return { status: "unavailable" };
    default: return { status: "locked" };
  }
}

/**
 * Resolves the detail state for the empty work source.
 * @param _id - Requested work record.
 * @returns The missing record result.
 */
export async function readWorkRecord(_id: string): Promise<WorkRecordResult> {
  return { status: "missing" };
}
