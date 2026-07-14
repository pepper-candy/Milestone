import { redirect } from "next/navigation";

/** Shop lives on the dashboard for now. */
export default function ShopPage() {
  redirect("/dashboard");
}
