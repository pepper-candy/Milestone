import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: milestones } = await supabase
    .from("milestones")
    .select("*")
    .order("gem_threshold");

  const { data: userMilestones } = await supabase
    .from("user_milestones")
    .select("*")
    .eq("user_id", user.id);

  const { data: sessions } = await supabase
    .from("sessions")
    .select("exp_earned")
    .eq("user_id", user.id)
    .not("ended_at", "is", null);

  const sessionExp = (sessions ?? []).reduce(
    (sum, s) => sum + Number(s.exp_earned ?? 0),
    0,
  );

  return NextResponse.json({
    milestones: milestones ?? [],
    userMilestones: userMilestones ?? [],
    sessionExp,
  });
}
