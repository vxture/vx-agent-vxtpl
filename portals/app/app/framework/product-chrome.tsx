/**
 * Shared product header and legal footer.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

import type { ReactNode } from "react";
import { BRAND } from "@vxtpl/shared/brand";
import { Icon, ShellBrand, ShellFullscreenToggle, ShellIconGroup, ShellLegalFooter } from "../ds";
import { ProductSession, SessionControl, SessionScope } from "../session-control";
import { ProductNavigation } from "./product-navigation";
import { ThemeControl } from "./theme-control";
import { productRoutes } from "./product-experience";
import "./product-framework.css";

export function ProductHeaderFrame({
  leading,
  navigation,
  tools,
  variant = "public",
}: {
  leading: ReactNode;
  navigation?: ReactNode;
  tools: ReactNode;
  variant?: "public" | "workspace" | "canvas";
}) {
  return (
    <header className="product-framework-header" data-variant={variant}>
      <div className="product-framework-leading">{leading}</div>
      {navigation}
      <div className="product-framework-tools">{tools}</div>
    </header>
  );
}

export function ProductHeader({ workspace = false, actions, assistant, entryLocaleControl, sessionRevision }: {
  workspace?: boolean;
  actions?: ReactNode;
  assistant?: ReactNode;
  entryLocaleControl?: ReactNode;
  sessionRevision?: number;
}) {
  const header = (
    <ProductHeaderFrame
      variant={workspace ? "workspace" : "public"}
      leading={
        <>
          <ShellBrand href={workspace ? productRoutes.home : productRoutes.landing} logoSrc="/logo.svg" label={BRAND.displayName} />
          {workspace && <SessionScope />}
        </>
      }
      navigation={workspace && <ProductNavigation />}
      tools={
        <>
          {assistant && <ShellIconGroup label="Assistant">{assistant}</ShellIconGroup>}
          <ShellIconGroup label="Display controls" className="product-display-controls">
            {actions}
            <ThemeControl />
            {entryLocaleControl}
            <ShellFullscreenToggle
              targetId="product"
              className="product-display-control"
              enterLabel="Enter fullscreen"
              exitLabel="Exit fullscreen"
            />
            {entryLocaleControl && (
              <a className="product-display-control product-platform-link" href="https://vxture.com" aria-label="Vxture platform homepage">
                <Icon name="home" size="sm" aria-hidden="true" />
              </a>
            )}
          </ShellIconGroup>
          {workspace && <SessionControl />}
        </>
      }
    />
  );
  return workspace ? <ProductSession key={sessionRevision}>{header}</ProductSession> : header;
}

const LEGAL_LINKS = [
  { label: "Terms of service", href: "https://vxture.com/zh-CN/legal/terms" },
  { label: "Privacy policy", href: "https://vxture.com/zh-CN/legal/privacy" },
  { label: "Copyright notice", href: "https://vxture.com/zh-CN/legal/copyright" },
];

export function ProductFooter() {
  return (
    <ShellLegalFooter
      className="product-framework-footer"
      innerClassName="product-framework-footer-inner"
      links={LEGAL_LINKS}
      copyright={`\u00a9 ${new Date().getUTCFullYear()} VXTURE \u00b7 RUYIN`}
    />
  );
}
