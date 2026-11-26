/**
 * Shares one revocation stream between session-aware views in a browser tab.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Session
 * @author AI-Generated
 * @date 2026-11-26
 */

"use client";

import { useEffect, useRef } from "react";

const listeners = new Set<() => void>();
let source: EventSource | undefined;
export const SESSION_REVOKED_EVENT = "vxtpl:session-revoked";

function connect() {
  if (!source || source.readyState === EventSource.CLOSED) {
    const stream = new EventSource("/auth/events");
    source = stream;
    stream.addEventListener("revoked", () => {
      stream.close();
      if (source === stream) source = undefined;
      for (const notify of listeners) notify();
      window.dispatchEvent(new Event(SESSION_REVOKED_EVENT));
    });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  connect();
  window.addEventListener("online", connect);
  window.addEventListener("focus", connect);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      source?.close();
      source = undefined;
      window.removeEventListener("online", connect);
      window.removeEventListener("focus", connect);
    }
  };
}

export function useSessionRevocation(enabled: boolean, onRevoked: () => void) {
  const callback = useRef(onRevoked);
  callback.current = onRevoked;
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    return subscribe(() => callback.current());
  }, [enabled]);
}
