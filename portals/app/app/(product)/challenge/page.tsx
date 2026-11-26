import { redirect } from "next/navigation";
import { productRoutes } from "../../framework/product-experience";

export default async function ChallengeRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, item);
    }
  }
  const search = query.toString();
  redirect(search ? `${productRoutes.play}?${search}` : productRoutes.play);
}
