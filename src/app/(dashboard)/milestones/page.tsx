import { redirect } from "next/navigation";

/** Milestones stay on the dashboard path. */
export default function MilestonesPage() {
  redirect("/dashboard");
}
