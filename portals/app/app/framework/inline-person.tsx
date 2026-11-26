/**
 * Avatar and name sharing the line box of surrounding text.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import { useState } from "react";
import { avatarInitial } from "../auth/lib/display";

export function InlinePerson({ name, picture }: { name: string; picture?: string | null }) {
  const [failedPicture, setFailedPicture] = useState<string>();
  return (
    <span className="product-inline-person" title={name}>
      <span className="product-inline-avatar" aria-hidden="true">
        {picture && failedPicture !== picture ? (
          <img src={picture} alt="" onError={() => setFailedPicture(picture)} />
        ) : <span>{avatarInitial(name)}</span>}
      </span>
      <span className="product-inline-name">{name}</span>
    </span>
  );
}
