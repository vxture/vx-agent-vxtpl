/**
 * Main workspace with optional, independently scrolling side regions.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Layout
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ShellIconButton } from "../ds";
import { ProductContent, type ProductContentWidth } from "./product-content";
import "./workspace-regions.css";

export interface WorkspaceRegion {
  readonly title: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly collapsed?: boolean;
  readonly toggleInHeader?: boolean;
  readonly assistant?: boolean;
  readonly wide?: boolean;
  readonly content: ReactNode | ((docked: boolean, close: () => void) => ReactNode);
}

type RegionSide = "left" | "right";

interface WorkspaceRegionsProps {
  readonly children: ReactNode;
  readonly left?: WorkspaceRegion;
  readonly right?: WorkspaceRegion;
  readonly width?: ProductContentWidth;
  readonly className?: string;
  readonly renderHeader?: (actions: ReactNode, assistant?: ReactNode) => ReactNode;
}

/* Use the width of the layout rather than the viewport for embedded workspaces. */
function useRegionLayout(hasLeft: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ left: false, right: false });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = (width: number) => {
      const left = width >= 768;
      const right = width >= (hasLeft ? 1200 : 960);
      setLayout((current) => current.left === left && current.right === right ? current : { left, right });
    };
    update(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasLeft]);

  return { ref, layout };
}

/* Native modal behavior supplies Escape, focus restoration and input isolation. */
function RegionDrawer({ region, children }: { region: WorkspaceRegion; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node || node.open === region.open) return;
    if (region.open) node.showModal();
    else node.close();
  }, [region.open]);

  return (
    <dialog
      ref={ref}
      aria-label={region.assistant ? region.title : undefined}
      aria-labelledby={region.assistant ? undefined : titleId}
      className="workspace-region-drawer"
      data-wide={region.wide || undefined}
      onCancel={(event) => {
        event.preventDefault();
        region.onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) region.onOpenChange(false);
      }}
    >
      <div className="workspace-region-drawer-body">
        {!region.assistant && (
          <div className="workspace-region-drawer-header">
            <h2 id={titleId}>{region.title}</h2>
            <ShellIconButton icon="x" label={`Close ${region.title.toLowerCase()}`} onClick={() => region.onOpenChange(false)} />
          </div>
        )}
        <div className="workspace-region-drawer-content">{children}</div>
      </div>
    </dialog>
  );
}

function SideRegion({ region, side, docked }: { region: WorkspaceRegion; side: RegionSide; docked: boolean }) {
  const content = region.open
    ? typeof region.content === "function" ? region.content(docked, () => region.onOpenChange(false)) : region.content
    : null;

  return docked ? (
    region.open && (
      <aside
        className={`workspace-region workspace-region-${side}`}
        data-collapsed={region.collapsed || undefined}
        data-wide={region.wide || undefined}
        aria-label={region.title}
      >
        {content}
      </aside>
    )
  ) : <RegionDrawer region={region}>{content}</RegionDrawer>;
}

/* The center stays in place across every change in auxiliary region state. */
export function WorkspaceRegions({ children, left, right, width, className = "", renderHeader }: WorkspaceRegionsProps) {
  const { ref, layout } = useRegionLayout(Boolean(left?.open));
  const pathname = usePathname();
  const [drawer, setDrawer] = useState<RegionSide | null>(null);
  const leftControl = useRef<HTMLButtonElement>(null);
  const rightControl = useRef<HTMLButtonElement>(null);

  function regionAction(side: RegionSide) {
    const region = side === "left" ? left : right;
    const docked = layout[side];
    if (!region || (docked && region.toggleInHeader === false)) return null;
    const open = docked ? region.open : drawer === side;
    return (
      <ShellIconButton
        key={side}
        ref={side === "left" ? leftControl : rightControl}
        icon={region.assistant ? "sparkles" : side === "left" ? "sidebar" : "faders"}
        label={region.assistant ? region.title : `${open ? "Hide" : "Show"} ${region.title.toLowerCase()}`}
        className={region.assistant ? "product-assistant-control" : "product-display-control"}
        iconClassName={region.assistant ? "product-assistant-icon" : undefined}
        activeClassName={region.assistant ? "product-assistant-active" : undefined}
        active={open}
        onClick={() => docked ? region.onOpenChange(!open) : setDrawer(open ? null : side)}
      />
    );
  }

  function displayedRegion(region: WorkspaceRegion, side: RegionSide): WorkspaceRegion {
    if (layout[side]) {
      return {
        ...region,
        onOpenChange: (open) => {
          region.onOpenChange(open);
          if (!open) (side === "left" ? leftControl : rightControl).current?.focus();
        },
      };
    }
    return { ...region, open: drawer === side, onOpenChange: (open) => setDrawer(open ? side : null) };
  }

  useEffect(() => {
    if (drawer && layout[drawer]) setDrawer(null);
  }, [drawer, layout]);
  useEffect(() => setDrawer(null), [pathname]);

  const regions = (
    <div ref={ref} className={`workspace-regions ${className}`} data-docked-left={layout.left && left?.open || undefined}>
      {left && <SideRegion region={displayedRegion(left, "left")} side="left" docked={layout.left} />}
      <div className="workspace-center-pane">
        <ProductContent width={width}>{children}</ProductContent>
      </div>
      {right && <SideRegion region={displayedRegion(right, "right")} side="right" docked={layout.right} />}
    </div>
  );
  return renderHeader ? (
    <div className="product-framework">
      {renderHeader([regionAction("left"), right?.assistant ? null : regionAction("right")], right?.assistant ? regionAction("right") : undefined)}
      {regions}
    </div>
  ) : regions;
}
