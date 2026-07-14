import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasNickname, invitationToEmail, normalizeInvitationCode } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string };
    const code = normalizeInvitationCode(body.code ?? "");
    if (!code) {
      return NextResponse.json(
        { error: "Please enter your invitation code first." },
        { status: 400 },
      );
    }

    const email = invitationToEmail(code);
    const password = code;
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      const message = error?.message?.toLowerCase() ?? "";
      if (
        message.includes("already logged") ||
        message.includes("session") ||
        message.includes("another device")
      ) {
        return NextResponse.json(
          { error: "Already logged in on another device" },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    const user = data.user;
    const meta = user.user_metadata ?? {};

    // Ensure a profile row exists (created manually in Supabase for invites)
    const { data: existing } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    let nickname = existing?.nickname as string | null | undefined;
    if (nickname == null || nickname === "") {
      nickname = (meta.nickname as string | undefined) || null;
    }

    if (!existing) {
      await supabase.from("profiles").upsert({
        id: user.id,
        invitation_code: code.toUpperCase(),
        nickname: hasNickname(nickname) ? nickname : null,
        avatar_url: null,
        is_child: meta.is_child ?? true,
        linked_parents: meta.linked_parents ?? [],
        linked_children: meta.linked_children ?? [],
      });
    }

    return NextResponse.json({
      ok: true,
      nickname: hasNickname(nickname) ? nickname : null,
      needsSetup: !hasNickname(nickname),
    });
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
