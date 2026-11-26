/**
 * Theme switch for the product header.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useState } from "react";
import { ShellThemeToggle, useTheme } from "../ds";

export function ThemeControl() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <ShellThemeToggle
      className="product-display-control"
      buttonLabel="Change theme"
      lightLabel="Light"
      darkLabel="Dark"
      currentTheme={mounted ? theme : "light"}
      onThemeChange={setTheme}
    />
  );
}
