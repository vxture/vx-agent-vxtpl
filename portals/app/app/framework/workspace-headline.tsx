/**
 * Local-day workspace greeting rotation.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useState } from "react";
import { BRAND } from "@vxtpl/shared/brand";

const headings = [
  "\u4ece\u8fd9\u91cc\uff0c\u5f00\u59cb\u4eca\u5929\u7684\u5de5\u4f5c",
  "\u628a\u8ba1\u5212\u53d8\u6210\u4eca\u5929\u7684\u884c\u52a8",
  "\u7406\u6e05\u624b\u5934\u7684\u4e8b\uff0c\u518d\u5f80\u524d\u4e00\u6b65",
  "\u4eca\u5929\uff0c\u5148\u505a\u597d\u4e00\u4ef6\u91cd\u8981\u7684\u4e8b",
  "\u628a\u4eca\u5929\u7684\u91cd\u70b9\u6392\u4e00\u6392",
  "\u63a5\u7740\u4e0a\u6b21\u7684\u8fdb\u5ea6\uff0c\u7ee7\u7eed\u5411\u524d",
  "\u628a\u590d\u6742\u7684\u4e8b\u62c6\u6210\u4e0b\u4e00\u6b65",
  "\u96c6\u4e2d\u7cbe\u529b\uff0c\u89e3\u51b3\u773c\u524d\u7684\u95ee\u9898",
  "\u68b3\u7406\u8fdb\u5c55\uff0c\u5b89\u6392\u4e0b\u4e00\u6b65",
  "\u6309\u81ea\u5df1\u7684\u8282\u594f\uff0c\u628a\u4e8b\u60c5\u63a8\u8fdb",
] as const;

const key = `${BRAND.productCode}-home-headline-v1`;

function loadOrder(): number[] {
  const order = headings.map((_, index) => index);
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      Array.isArray(stored) && stored.length === order.length && new Set(stored).size === order.length &&
      stored.every((value: unknown) => typeof value === "number" && order.includes(value))
    ) return stored as number[];

    const shuffled = [...order];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    localStorage.setItem(key, JSON.stringify(shuffled));
    return shuffled;
  } catch {
    return order;
  }
}

export function WorkspaceHeadline() {
  const [heading, setHeading] = useState<typeof headings[number]>(headings[0]);
  useEffect(() => {
    const order = loadOrder();
    let timer: number | undefined;
    function update() {
      window.clearTimeout(timer);
      const now = new Date();
      const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000;
      const index = (day % order.length + order.length) % order.length;
      setHeading(headings[order[index]]);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(update, midnight.getTime() - now.getTime() + 20);
    }
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return <h1 lang="zh-CN">{heading}</h1>;
}
