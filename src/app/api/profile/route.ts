import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasNickname } from "@/lib/auth";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    nickname?: string;
    avatar_url?: string | null;
  };

  const nickname = (body.nickname ?? "").trim();
  if (!nickname) {
    return NextResponse.json({ error: "Nickname is required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", user.id)
    .maybeSingle();

  if (hasNickname(existing?.nickname)) {
    return NextResponse.json(
      { error: "Nickname cannot be changed" },
      { status: 403 },
    );
  }

  const meta = user.user_metadata ?? {};
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    invitation_code:
      (meta.invitation_code as string | undefined) ??
      user.email?.split("@")[0]?.toUpperCase() ??
      "UNKNOWN",
    nickname,
    avatar_url: body.avatar_url ?? null,
    is_child: meta.is_child ?? true,
    linked_parents: meta.linked_parents ?? [],
    linked_children: meta.linked_children ?? [],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also stamp nickname into auth metadata for LOGIN-FLOW compatibility
  await supabase.auth.updateUser({
    data: { nickname },
  });

  return NextResponse.json({ ok: true, nickname });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({ profile, user: { id: user.id, email: user.email } });
}
