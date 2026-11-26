/**
 * Full-viewport stage with independently controlled focus and native fullscreen.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Layout
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BRAND } from "@vxtpl/shared/brand";
import { ShellBrand, ShellIconButton, ShellIconGroup } from "../ds";
import { ProductSession, SessionControl } from "../session-control";
import { ProductHeaderFrame } from "./product-chrome";
import { productRoutes } from "./product-experience";
import "./canvas-workspace.css";

interface CanvasWorkspaceProps {
  readonly title: string;
  readonly view: string;
  readonly children: ReactNode;
  readonly information?: ReactNode;
  readonly tools?: ReactNode;
}

export function CanvasWorkspace({ title, view, children, information, tools }: CanvasWorkspaceProps) {
  const [focused, setFocused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showInformation, setShowInformation] = useState(false);
  const [error, setError] = useState("");
  const focusAction = useRef<HTMLSpanElement>(null);
  const restoreAction = useRef<HTMLSpanElement>(null);
  const movedFocus = useRef(false);
  const ownsFullscreen = useRef(false);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === document.documentElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      if (ownsFullscreen.current && document.fullscreenElement === document.documentElement) {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!movedFocus.current) return;
    const action = focused ? restoreAction : focusAction;
    action.current?.querySelector("button")?.focus();
  }, [focused]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || document.fullscreenElement || event.defaultPrevented) return;
      if (focused) setFocused(false);
      else if (showInformation) setShowInformation(false);
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [focused, showInformation]);

  async function toggleFullscreen() {
    setError("");
    try {
      // The document root keeps Design System popovers in the native fullscreen subtree.
      if (fullscreen) {
        await document.exitFullscreen();
        ownsFullscreen.current = false;
      } else {
        await document.documentElement.requestFullscreen();
        ownsFullscreen.current = true;
      }
    } catch {
      setError("Browser fullscreen is unavailable for this view.");
    }
  }

  function toggleFocus() {
    movedFocus.current = true;
    setFocused((current) => !current);
  }

  return (
    <div className="product-framework canvas-workspace dark">
      <main id="canvas-stage" className="canvas-stage" aria-label={title}>{children}</main>
      <ProductSession>
        <div className="canvas-chrome" hidden={focused}>
          <ProductHeaderFrame
            variant="canvas"
            leading={
              <>
                <ShellBrand
                  href={productRoutes.home}
                  logoSrc="/logo.svg"
                  label={<span className="canvas-brand-title">{title}</span>}
                  className="canvas-brand"
                />
                <div className="canvas-brand-aux"><strong>{BRAND.displayName}</strong><span>Fullscreen view</span></div>
                <div className="canvas-view-label">{view}</div>
              </>
            }
            tools={
              <>
                {tools}
                <ShellIconGroup label="Canvas controls" className="product-display-controls">
                  {information && (
                    <ShellIconButton
                      icon="info"
                      label="View information"
                      className="product-display-control"
                      active={showInformation}
                      onClick={() => setShowInformation((current) => !current)}
                    />
                  )}
                  <span className="canvas-focus-action" ref={focusAction}>
                    <ShellIconButton icon="corners-out" label="Focus mode" className="product-display-control" onClick={toggleFocus} />
                  </span>
                  <ShellIconButton
                    icon={fullscreen ? "minimize" : "maximize"}
                    label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    className="product-display-control"
                    active={fullscreen}
                    onClick={toggleFullscreen}
                  />
                </ShellIconGroup>
                <SessionControl />
              </>
            }
          />
          {showInformation && <aside className="canvas-information" aria-label="View information">{information}</aside>}
        </div>
        {focused && (
          <span className="canvas-restore" ref={restoreAction}>
            <ShellIconButton icon="corners-in" label="Restore canvas controls" onClick={toggleFocus} />
          </span>
        )}
      </ProductSession>
      {error && <p role="status" className="canvas-status">{error}</p>}
    </div>
  );
}
