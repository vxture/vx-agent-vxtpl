/**
 * Public product entry.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Page
 * @author AI-Generated
 * @date 2026-11-25
 */

import { redirect } from "next/navigation";
import { EntryShell } from "./access/entry-shell";
import { defaultProductPath, productExperience, productGateHref } from "./framework/product-experience";

export default function LandingPage() {
  if (productExperience.homeMode === "direct") redirect(productGateHref(defaultProductPath()));

  return <EntryShell destination={defaultProductPath()} landing />;
}
