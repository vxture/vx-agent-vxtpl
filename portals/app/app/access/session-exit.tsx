/**
 * Returns ordinary product pages to the gate when a live session ends.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Session
 * @author AI-Generated
 * @date 2026-11-26
 */

"use client";

import { useEffect } from "react";
import { SESSION_REVOKED_EVENT } from "../auth/session-events-client";
import { productGateHref } from "../framework/product-experience";

export function SessionExit() {
  useEffect(() => {
    function onRevoked() {
      const { pathname, search, hash } = window.location;
      window.location.replace(productGateHref(pathname + search + hash));
    }
    window.addEventListener(SESSION_REVOKED_EVENT, onRevoked);
    return () => window.removeEventListener(SESSION_REVOKED_EVENT, onRevoked);
  }, []);
  return null;
}
