/**
 * Reads recent work under the verified account, workspace and history entitlement.
 * @package @vxtpl/app
 * @layer Application
 * @category Query
 * @author AI-Generated
 * @date 2026-11-25
 */

import { readWorkspaceSession } from "../auth/lib/workspace-session";
import { hasWorkspaceSeat } from "../entitlement/workspace-authority";
import { readWorkspaceEntitlement } from "../entitlement/resolver";
import { getGameStore, type GameRunRow } from "./store";
import { formatScoreMs, historyWindowFor, QUALIFY_MS, seasonOf } from "./rules";
import type { RecentWorkItem, WorkRecordResult, WorkResult } from "../framework/recent-work";

async function historyScope() {
  const session = await readWorkspaceSession();
  if (session.status !== "ready" && session.status !== "development") {
    if (session.status === "anonymous") return { status: "anonymous" } as const;
    if (session.status === "unavailable" || session.status === "unconfigured") return { status: "unavailable" } as const;
    return { status: "locked" } as const;
  }
  const entitlement = await readWorkspaceEntitlement(session);
  const window = historyWindowFor(entitlement);
  if (window.kind === "none" || !await hasWorkspaceSeat(session)) return { status: "locked" } as const;
  return {
    status: "ready",
    workspaceId: session.workspaceId,
    sub: session.sub,
    since: seasonOf(new Date()).start,
    bound: window.kind === "last10" ? window.limit : Infinity,
  } as const;
}

function workItem(row: GameRunRow): RecentWorkItem | null {
  if (row.scoreMs === null || !row.finishedAt || !row.outcome) return null;
  const scoreMs = row.scoreMs;
  const qualified = row.outcome === "survived";
  const step = QUALIFY_MS / 4;
  return {
    id: row.id,
    updatedAt: row.finishedAt.toISOString(),
    title: `Emberstorm \u00b7 ${formatScoreMs(scoreMs)}s`,
    kind: "\u6311\u6218\u8bb0\u5f55",
    description: "20 \u79d2\u8eb2\u907f\u6311\u6218",
    status: qualified ? { label: "\u5df2\u8fbe\u6807", tone: "success" } : { label: "\u5df2\u7ed3\u675f", tone: "neutral" },
    progress: {
      label: "20 \u79d2\u76ee\u6807",
      percent: Math.floor(Math.max(0, Math.min(scoreMs / QUALIFY_MS, 1)) * 100),
      stages: Array.from({ length: 4 }, (_, index) => {
        const start = step * index;
        const end = start + step;
        return {
          label: `${start / 1000}-${end / 1000}s`,
          state: scoreMs >= end ? "complete" : scoreMs >= start ? "current" : "pending",
        };
      }),
    },
  };
}

export async function readRecentWork(limit: number, offset = 0): Promise<WorkResult> {
  try {
    const scope = await historyScope();
    if (scope.status !== "ready") return scope;
    const bound = Math.max(0, scope.bound - offset);
    if (!bound) return { status: "ready", items: [], more: false };

    const rows = await getGameStore().recentFinished(scope.workspaceId, scope.sub, {
      since: scope.since,
      limit: Math.min(limit + 1, bound),
      offset,
    });
    return { status: "ready", items: rows.slice(0, limit).map(workItem).filter((item) => item !== null), more: rows.length > limit };
  } catch {
    return { status: "unavailable" };
  }
}

export async function readWorkRecord(id: string): Promise<WorkRecordResult> {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return { status: "missing" };
  try {
    const scope = await historyScope();
    if (scope.status !== "ready") return { status: scope.status === "unavailable" ? "unavailable" : "missing" };
    const store = getGameStore();
    const row = Number.isFinite(scope.bound)
      ? (await store.recentFinished(scope.workspaceId, scope.sub, { since: scope.since, limit: scope.bound })).find((item) => item.id === id)
      : await store.getRun(id);
    if (!row || row.workspaceId !== scope.workspaceId || row.sub !== scope.sub || row.status !== "finished" || !row.finishedAt || row.finishedAt < scope.since) {
      return { status: "missing" };
    }
    const item = workItem(row);
    return item ? { status: "ready", item } : { status: "missing" };
  } catch {
    return { status: "unavailable" };
  }
}
