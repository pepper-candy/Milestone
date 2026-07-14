import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasNickname } from "@/lib/auth";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasNickname(profile?.nickname)) redirect("/setup");
  redirect("/dashboard");
}
