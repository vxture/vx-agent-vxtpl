/**
 * Expand the Design System search field in the workspace header.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-26
 */

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShellIconButton, ShellSearchBox } from "../ds";
import { productExperience, productRoutes } from "./product-experience";

// Search uses the public route registry. Products supply their own authorized work results.
const pages = [
  { label: "\u5de5\u4f5c\u9996\u9875", keywords: "\u9996\u9875 home", href: productRoutes.home },
  { label: "\u6211\u7684\u5de5\u4f5c", keywords: "\u5168\u90e8\u5de5\u4f5c work", href: productRoutes.work },
  { label: "AI \u5bf9\u8bdd", keywords: "\u804a\u5929 chat", href: productRoutes.chat },
  { label: "\u5e73\u53f0\u63a5\u5165\u6f14\u793a", keywords: "\u9a8c\u6536 atlas runos", href: productRoutes.platformCheck },
  ...(productExperience.example ? [{ ...productExperience.example, keywords: "" }] : []),
];

const labels = {
  placeholder: "\u641c\u7d22\u4ea7\u54c1\u9875\u9762",
  empty: "\u6ca1\u6709\u5339\u914d\u7684\u9875\u9762",
  resultsLabel: "\u641c\u7d22\u7ed3\u679c",
};

export function ProductHeaderSearch() {
  const root = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const fieldId = useId();
  const [query, setQuery] = useState("");
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const expanded = expandedPath !== null && expandedPath === pathname;

  function close(returnFocus = false) {
    setExpandedPath(null);
    setQuery("");
    restoreFocus.current = returnFocus;
  }

  useEffect(() => {
    const container = root.current;
    if (!expanded) {
      if (restoreFocus.current) container?.querySelector<HTMLButtonElement>("[data-search-trigger]")?.focus();
      restoreFocus.current = false;
      return;
    }
    container?.querySelector<HTMLInputElement>("input")?.focus();
    function dismiss(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || container?.contains(target)) return;
      // Portalled DS options need the pointer event to finish selecting.
      if (target instanceof Element && target.closest("[cmdk-list]")) return;
      setExpandedPath(null);
      setQuery("");
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [expanded]);

  useEffect(() => {
    setExpandedPath(null);
    setQuery("");
  }, [pathname]);

  const needle = query.trim().toLowerCase();
  const items = needle
    ? pages.filter(({ label, href, keywords }) => [label, href, keywords].some((value) => value.toLowerCase().includes(needle)))
      .map(({ label, href }) => ({ key: href, label, onSelect: () => {
        close(true);
        router.push(href);
      } }))
    : [];

  return (
    <div ref={root} className="product-header-search" role="search" aria-label="Product search" data-expanded={expanded || undefined}
      onKeyDownCapture={(event) => {
        if (!expanded || event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }}
    >
      <ShellIconButton icon="search" label="Search product pages" className="product-header-search-trigger"
        data-search-trigger aria-expanded={expanded} aria-controls={fieldId}
        onClick={() => { setQuery(""); setExpandedPath(pathname); }} />
      <div id={fieldId} className="product-header-search-field" hidden={!expanded}>
        {expanded && (
          <>
            <ShellSearchBox query={query} onQueryChange={setQuery} shortcutKey={null} labels={labels}
              groups={[{ key: "pages", heading: "\u4ea7\u54c1\u9875\u9762", items }]} />
            <ShellIconButton icon="x" label="Close search" onClick={() => close(true)} />
          </>
        )}
      </div>
    </div>
  );
}
