/**
 * Local-time display for server-rendered work records.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useState } from "react";

const dateOptions: Intl.DateTimeFormatOptions = { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

export function WorkTime({ iso }: { iso: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const formatter = new Intl.DateTimeFormat("zh-CN", mounted ? dateOptions : { ...dateOptions, timeZone: "UTC" });
  return <time dateTime={iso} title={iso}>{formatter.format(new Date(iso))}</time>;
}
