import { redirect } from "next/navigation";

export default async function PhasesPage() {
  redirect("/settings/phases");
}
