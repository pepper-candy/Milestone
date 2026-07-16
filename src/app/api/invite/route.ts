import { invitationToEmail } from "@/lib/auth";
import {
  isInviteCodeAvailable,
  isInviteCodeFormatValid,
  normalizeInviteCodeInput,
  suggestAvailableInviteCode,
} from "@/lib/invitation-code";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type InviteRole = "mentee" | "mentor";

async function requireParent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return {
      error: NextResponse.json(
        { error: error?.message || "Profile not found" },
        { status: error ? 500 : 404 },
      ),
    };
  }

  if (profile.is_child) {
    return {
      error: NextResponse.json(
        { error: "Only mentors can create invitation codes" },
        { status: 403 },
      ),
    };
  }

  return { profile, userId: user.id };
}

/** Random unused code, or validate a candidate. */
export async function GET(request: Request) {
  try {
    const parent = await requireParent();
    if ("error" in parent && parent.error) return parent.error;

    const { searchParams } = new URL(request.url);
    const supabase = await createClient();

    if (searchParams.get("suggest") === "1") {
      const code = await suggestAvailableInviteCode(supabase);
      return NextResponse.json({ code, valid: true, available: true });
    }

    const raw = searchParams.get("code") ?? "";
    const code = normalizeInviteCodeInput(raw);

    if (!code) {
      return NextResponse.json({
        code,
        valid: false,
        available: false,
        reason: "Enter an invitation code",
      });
    }

    if (!isInviteCodeFormatValid(code)) {
      return NextResponse.json({
        code,
        valid: false,
        available: false,
        reason: "Use 5 letters or numbers",
      });
    }

    const available = await isInviteCodeAvailable(supabase, code);
    return NextResponse.json({
      code,
      valid: available,
      available,
      reason: available ? "Available" : "This code is already used",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not check invitation code";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Provision auth user + profile and link to the inviting parent. */
export async function POST(request: Request) {
  try {
    const parent = await requireParent();
    if ("error" in parent && parent.error) return parent.error;

    const body = (await request.json()) as {
      code?: string;
      role?: InviteRole;
    };

    const code = normalizeInviteCodeInput(body.code ?? "");
    const role: InviteRole = body.role === "mentor" ? "mentor" : "mentee";

    if (!isInviteCodeFormatValid(code)) {
      return NextResponse.json(
        { valid: false, reason: "Use 5 letters or numbers" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const available = await isInviteCodeAvailable(supabase, code);
    if (!available) {
      return NextResponse.json(
        { valid: false, available: false, reason: "This code is already used" },
        { status: 409 },
      );
    }

    let admin;
    try {
      admin = createAdminClient();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invite provisioning unavailable";
      return NextResponse.json({ error: message }, { status: 503 });
    }

    const inviter = parent.profile;
    const inviterCode = inviter.invitation_code as string;
    const inviterChildren = (inviter.linked_children as string[] | null) ?? [];

    const isChild = role === "mentee";
    const linkedParents = isChild ? [inviterCode] : [];
    const linkedChildren = !isChild ? [...inviterChildren] : [];

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: invitationToEmail(code),
        password: code,
        email_confirm: true,
        user_metadata: {
          invitation_code: code,
          is_child: isChild,
          linked_parents: linkedParents,
          linked_children: linkedChildren,
          nickname: "",
        },
      });

    if (createError || !created.user) {
      const msg = createError?.message?.toLowerCase() ?? "";
      if (msg.includes("already") || msg.includes("registered")) {
        return NextResponse.json(
          { valid: false, available: false, reason: "This code is already used" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: createError?.message || "Could not create invite" },
        { status: 500 },
      );
    }

    const newUserId = created.user.id;

    const { error: profileError } = await admin.from("profiles").insert({
      id: newUserId,
      invitation_code: code,
      nickname: null,
      avatar_url: null,
      is_child: isChild,
      linked_parents: linkedParents,
      linked_children: linkedChildren,
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(newUserId);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (isChild) {
      const nextChildren = [...inviterChildren, code];
      await admin
        .from("profiles")
        .update({ linked_children: nextChildren })
        .eq("id", parent.userId);
    } else {
      for (const childCode of inviterChildren) {
        const { data: childProfile } = await admin
          .from("profiles")
          .select("linked_parents")
          .eq("invitation_code", childCode)
          .maybeSingle();

        if (!childProfile) continue;
        const parents = (childProfile.linked_parents as string[] | null) ?? [];
        if (parents.includes(code)) continue;

        await admin
          .from("profiles")
          .update({ linked_parents: [...parents, code] })
          .eq("invitation_code", childCode);
      }
    }

    return NextResponse.json({
      ok: true,
      code,
      valid: true,
      available: true,
      role,
      reason: "Invitation created",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create invitation";
    const status = message.includes("SERVICE_ROLE") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
