/**
 * Modal entry state which preserves only the verified workspace's mounted UI.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useEffect, useId, useRef } from "react";
import { BRAND } from "@vxtpl/shared/brand";
import { EntryCard, type EntryAction } from "./entry-card";
import type { EntryStatus } from "./entry-copy";

export function RecoveryDialog({ status, actions }: {
  status: EntryStatus;
  actions: ReadonlyArray<EntryAction>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="vx-entry-recovery"
      aria-labelledby={title}
      onCancel={(event) => event.preventDefault()}
    >
      <EntryCard productName={BRAND.displayName} locale="en-US" status={status} actions={actions} overlay titleId={title} />
    </dialog>
  );
}
