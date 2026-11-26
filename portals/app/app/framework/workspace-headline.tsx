/**
 * Client-side workspace title driven by the product rotation schedule.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-26
 */

"use client";

import { useEffect, useState } from "react";
import { BRAND } from "@vxtpl/shared/brand";
import { createHeadlineRotation } from "./headline-rotation";
import { productExperience } from "./product-experience";

const settings = productExperience.homeHeadline;
const storageKey = `${BRAND.productCode}-home-headline-order-v2`;

export function WorkspaceHeadline() {
  const [heading, setHeading] = useState(settings.pool[0]);
  useEffect(() => createHeadlineRotation(settings, storageKey).watch(setHeading), []);
  return <h1 lang="zh-CN">{heading}</h1>;
}
