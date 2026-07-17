import { invitationToEmail } from "@/lib/auth";
import {
  isInviteCodeFormatValid,
  normalizeInviteCodeInput,
  suggestAvailableInviteCode,
} from "@/lib/invitation-code";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Ensure the signed-in mentor has a first linked mentee.
 * Idempotent: if linked_children already has entries, returns those codes.
 * Does not seed user_tasks — mentee starts blank.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let admin;
    try {
      admin = createAdminClient();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Service role unavailable";
      return NextResponse.json({ error: message }, { status: 503 });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, invitation_code, is_child, linked_children, selected_child_code")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: profileError?.message || "Profile not found" },
        { status: profileError ? 500 : 404 },
      );
    }

    if (profile.is_child) {
      return NextResponse.json(
        { error: "Only mentors can create a first mentee" },
        { status: 403 },
      );
    }

    const parentCode = normalizeInviteCodeInput(
      (profile.invitation_code as string) ?? "",
    );
    const existingChildren =
      ((profile.linked_children as string[] | null) ?? []).filter(Boolean);

    if (existingChildren.length > 0) {
      return NextResponse.json({
        ok: true,
        parentCode,
        childCode: existingChildren[0],
        created: false,
      });
    }

    const childCode = await suggestAvailableInviteCode(admin);
    if (!isInviteCodeFormatValid(childCode)) {
      return NextResponse.json(
        { error: "Could not generate a mentee code" },
        { status: 500 },
      );
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: invitationToEmail(childCode),
        password: childCode,
        email_confirm: true,
        user_metadata: {
          invitation_code: childCode,
          is_child: true,
          linked_parents: [parentCode],
          linked_children: [],
          nickname: "",
        },
      });

    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message || "Could not create mentee" },
        { status: 500 },
      );
    }

    const newUserId = created.user.id;
    const { error: insertError } = await admin.from("profiles").insert({
      id: newUserId,
      invitation_code: childCode,
      nickname: null,
      avatar_url: null,
      is_child: true,
      linked_parents: [parentCode],
      linked_children: [],
    });

    if (insertError) {
      await admin.auth.admin.deleteUser(newUserId);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { error: linkError } = await admin
      .from("profiles")
      .update({
        linked_children: [childCode],
        selected_child_code: childCode,
      })
      .eq("id", user.id);

    if (linkError) {
      await admin.auth.admin.deleteUser(newUserId);
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      parentCode,
      childCode,
      created: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create first mentee";
    const status = message.includes("SERVICE_ROLE") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
