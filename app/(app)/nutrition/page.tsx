import { redirect } from "next/navigation";

export default async function NutritionPage({
  searchParams
}: {
  searchParams?: {
    fatsecret?: string;
  };
}) {
  const params = new URLSearchParams();

  if (searchParams?.fatsecret === "connected" || searchParams?.fatsecret === "error") {
    params.set("fatsecret", searchParams.fatsecret);
  }

  redirect(params.size ? `/meals?${params.toString()}` : "/meals");
}
