/**
 * Management preview with fixed Design System navigation.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Layout
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@vxtpl/shared/brand";
import { ShellSidebarFrame, ShellSidebarNav, type ShellNavSection } from "../../../ds";
import { ProductHeader } from "../../../framework/product-chrome";
import { productRoutes } from "../../../framework/product-experience";
import { WorkspaceRegions } from "../../../framework/workspace-regions";
import { managementPages } from "../catalog";

const sections: ShellNavSection[] = [
  { title: "Tables", items: managementPages.map(({ href, title, icon }) => ({ href, label: title, icon })) },
  { title: "Workspace", items: [{ href: productRoutes.frameworks, label: "Framework catalogue", icon: "squares-four" }] },
];

export default function ManagementLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <WorkspaceRegions
      width="1920"
      renderHeader={(actions) => <ProductHeader workspace actions={actions} />}
      left={{
        title: "Management navigation",
        open: true,
        onOpenChange: () => {},
        collapsed,
        toggleInHeader: false,
        content: (docked, close) => {
          const mode = docked && collapsed ? "collapsed" : "expanded";
          return (
            <ShellSidebarFrame mode={mode} className="management-sidebar">
              <ShellSidebarNav
                domainName="Management"
                sections={sections}
                collapsed={mode === "collapsed"}
                onToggleCollapsed={docked ? () => setCollapsed((value) => !value) : close}
                isActive={(href) => href === pathname}
                storageKeyPrefix={`${BRAND.productCode}-framework-management`}
                linkComponent={Link}
                labels={{
                  expandNav: "Expand navigation",
                  collapseNav: docked ? "Collapse navigation" : "Close navigation",
                  expandAllGroups: "Expand all groups",
                  collapseAllGroups: "Collapse all groups",
                }}
              />
            </ShellSidebarFrame>
          );
        },
      }}
      right={{
        title: "Table guide",
        open: guideOpen,
        onOpenChange: setGuideOpen,
        content: (
          <div className="workspace-region-content">
            <h2>Table guide</h2>
            <p>The first three menu entries show a read-only table, row selection and bulk selection.</p>
          </div>
        ),
      }}
    >
      {children}
    </WorkspaceRegions>
  );
}
