/**
 * Product navigation with a route-aware selected link.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Component
 * @author AI-Generated
 * @date 2026-11-25
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { productExperience, productRoutes } from "./product-experience";

const navigation = [
  { label: "Home", href: productRoutes.home },
  ...(productExperience.example ? [productExperience.example] : []),
  { label: "Chat", href: productRoutes.chat },
  { label: "\u5e73\u53f0\u63a5\u5165\u6f14\u793a", href: productRoutes.platformCheck },
];

export function ProductNavigation() {
  const pathname = usePathname();
  return (
    <nav className="product-framework-nav" aria-label="Product">
      {navigation.map(({ label, href }) => (
        <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
