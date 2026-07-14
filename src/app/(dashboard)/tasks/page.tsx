import { redirect } from "next/navigation";

/** Tasks stay on the main dashboard. */
export default function TasksPage() {
  redirect("/dashboard");
}
