/**
 * Shared public chrome for the landing and gate pages.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Layout
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useState } from "react";
import { BRAND } from "@vxtpl/shared/brand";
import { ShellLocaleSwitcher } from "../ds";
import { ProductFooter, ProductHeader } from "../framework/product-chrome";
import type { EntryLocale } from "./entry-copy";
import type { GateFailure } from "./destination";
import { ProductGate } from "./product-gate";

const LOCALE_STORAGE = `${BRAND.productCode}-entry-locale`;

export function EntryShell({ destination, failure, landing = false }: {
  destination: string;
  failure?: GateFailure;
  landing?: boolean;
}) {
  const [locale, setLocale] = useState<EntryLocale>("zh-CN");
  useEffect(() => {
    try {
      if (localStorage.getItem(LOCALE_STORAGE) === "en-US") setLocale("en-US");
    } catch {
      // Locale switching remains usable within this page.
    }
  }, []);
  return (
    <div className="product-framework">
      <ProductHeader entryLocaleControl={
        <ShellLocaleSwitcher
          currentLocale={locale}
          options={[{ locale: "zh-CN", nativeName: "\u7b80\u4f53\u4e2d\u6587" }, { locale: "en-US", nativeName: "English" }]}
          panelLabel={locale === "zh-CN" ? "\u8bed\u8a00\u9009\u62e9" : "Language"}
          buttonLabel={locale === "zh-CN" ? "\u5207\u6362\u8bed\u8a00" : "Change language"}
          buttonClassName="product-display-control"
          onLocaleChange={(value) => {
            setLocale(value);
            try { localStorage.setItem(LOCALE_STORAGE, value); } catch {}
          }}
        />
      } />
      <ProductGate productName={BRAND.displayName} destination={destination} failure={failure} locale={locale} landing={landing} />
      <ProductFooter />
    </div>
  );
}
