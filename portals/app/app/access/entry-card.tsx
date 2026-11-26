/**
 * Entry card rendered in a page, landing panel or recovery dialog.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

import { Icon } from "../ds";
import { entryText, type EntryLocale, type EntryStatus } from "./entry-copy";
import "./gate.css";

export type EntryAction = {
  labels: readonly [string, string];
  disabled?: boolean;
} & ({ href: string; newTab?: boolean } | { onClick: () => void });

export function EntryCard({
  productName,
  status,
  locale,
  actions = [],
  overlay = false,
  titleId,
}: {
  productName: string;
  status: EntryStatus;
  locale: EntryLocale;
  actions?: ReadonlyArray<EntryAction>;
  overlay?: boolean;
  titleId?: string;
}) {
  const zh = locale === "zh-CN";
  const copy = entryText[status];
  const Title = overlay ? "h2" : "h1";
  return (
    <section className="vx-entry-card" data-entry-state={status} lang={locale} aria-busy={status === "checking"}>
      <div className="vx-entry-card-mark" aria-hidden="true">
        <Icon name={status === "checking" ? "spinner" : status === "signin" || status === "recover" ? "lock" : "info"} size="lg" />
      </div>
      <div className="vx-entry-card-heading" role={status === "checking" ? "status" : undefined}>
        <p className="vx-entry-welcome">WELCOME TO {productName}</p>
        <Title id={titleId}>{copy[zh ? 0 : 2]}</Title>
        <p>{copy[zh ? 1 : 3]}</p>
      </div>
      <div className="vx-entry-card-actions">
        {actions.map((action, index) => {
          const label = action.labels[zh ? 0 : 1];
          const className = index === 0 ? "vx-entry-action vx-entry-action-primary" : "vx-entry-action";
          return "href" in action
            ? <a className={className} key={label} href={action.href} target={action.newTab ? "_blank" : undefined} rel={action.newTab ? "noopener" : undefined}>{label}</a>
            : <button className={className} key={label} type="button" onClick={action.onClick} disabled={action.disabled}>{label}</button>;
        })}
      </div>
      <p className="vx-entry-card-footnote">{zh ? "\u7531 Vxture \u5e73\u53f0\u63d0\u4f9b\u8eab\u4efd\u9a8c\u8bc1" : "Identity verification by Vxture"}</p>
    </section>
  );
}
