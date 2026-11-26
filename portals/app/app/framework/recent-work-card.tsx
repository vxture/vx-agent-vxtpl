/**
 * Recent-work cards with status, records and accessible segmented progress.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

import { Icon, StatusBadge } from "../ds";
import { productRoutes } from "./product-experience";
import type { RecentWorkItem } from "./recent-work";
import { WorkTime } from "./work-time";
import "./workspace-home.css";

export function RecentWorkCard({ item, showLink = true }: { item: RecentWorkItem; showLink?: boolean }) {
  const { progress, status } = item;
  return (
    <article className="workspace-work-card" data-tone={status.tone} lang="zh-CN">
      <div className="workspace-work-card-top">
        <span><Icon name="timer" size="sm" aria-hidden="true" /> {item.kind}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      <div>
        <h3>{item.title}</h3>
        {item.description && <p>{item.description}</p>}
      </div>
      {progress && (
        <div className="workspace-work-progress">
          <div className="workspace-work-progress-label">
            <span><Icon name="target" size="sm" aria-hidden="true" /> {progress.label}</span>
            <span>{progress.percent}%</span>
          </div>
          <ol aria-label={"\u5de5\u4f5c\u8fdb\u5ea6"}>
            {progress.stages.map(({ label, state }) => (
              <li key={label} data-progress={state}>
                <span className="sr-only">{label} {state === "complete" ? "\u5df2\u5b8c\u6210" : state === "current" ? "\u5230\u8fbe\u9636\u6bb5" : "\u672a\u5f00\u59cb"}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="workspace-work-card-footer">
        <span>{"\u66f4\u65b0 \u00b7 "}<WorkTime iso={item.updatedAt} /></span>
        {showLink && <a href={`${productRoutes.work}/${encodeURIComponent(item.id)}`} aria-label={`\u8fdb\u5165 ${item.title}`}>{"\u8fdb\u5165"}</a>}
      </div>
    </article>
  );
}
