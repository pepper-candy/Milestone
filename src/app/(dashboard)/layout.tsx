import { hasNickname } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasNickname(profile?.nickname)) {
    redirect("/setup");
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[475px] flex-col bg-[#f7f0e6] shadow-[0_0_40px_rgba(200,146,42,0.08)]">
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
