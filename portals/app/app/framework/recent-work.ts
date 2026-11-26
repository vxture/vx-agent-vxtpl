/**
 * Product-independent work-card data and query results.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Model
 * @author AI-Generated
 * @date 2026-11-25
 */

export interface RecentWorkItem {
  id: string;
  updatedAt: string;
  title: string;
  kind: string;
  description?: string;
  status: { label: string; tone: "success" | "neutral" };
  progress?: {
    label: string;
    percent: number;
    stages: { label: string; state: "complete" | "current" | "pending" }[];
  };
}

type WorkFailure = "unavailable" | "locked" | "anonymous";
export type WorkResult =
  | { status: "ready"; items: RecentWorkItem[]; more: boolean }
  | { [Status in WorkFailure]: { status: Status } }[WorkFailure];
export type WorkRecordResult =
  | { status: "ready"; item: RecentWorkItem }
  | { status: "unavailable" | "missing" };

export const ALL_WORK_PAGE_SIZE = 12;
export const HOME_WORK_LIMIT = 6;
