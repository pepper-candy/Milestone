import { invitationToEmail } from "@/lib/auth";
import {
  isInviteCodeAvailable,
  isInviteCodeFormatValid,
  normalizeInviteCodeInput,
  suggestAvailableInviteCode,
} from "@/lib/invitation-code";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureUserTasks } from "@/lib/user-tasks";
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

      // Seed catalog as available (unchecked) — never pending.
      // Admin client bypasses RLS so rows exist before the mentee logs in.
      const seed = await ensureUserTasks(admin, newUserId);
      if (seed.error) {
        console.warn("Invite task seed warning:", seed.error);
      }
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

/**
 * Delete an unused linked invite (no nickname yet) that this mentor created by
 * accident — removes link + auth user so the code can be reused.
 * Supports unused mentees and unused co-mentors.
 */
export async function DELETE(request: Request) {
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
        { error: "Invalid invitation code" },
        { status: 400 },
      );
    }

    let admin;
    try {
      admin = createAdminClient();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invite deletion unavailable";
      return NextResponse.json({ error: message }, { status: 503 });
    }

    const inviter = parent.profile;
    const inviterChildren = (inviter.linked_children as string[] | null) ?? [];

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, nickname, is_child, linked_parents, linked_children")
      .eq("invitation_code", code)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 });
    }
    if (!target) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const nickname = target.nickname as string | null;
    if (typeof nickname === "string" && nickname.trim().length > 0) {
      return NextResponse.json(
        {
          error:
            "This account is already set up. Only unused invites can be removed.",
        },
        { status: 403 },
      );
    }

    if (role === "mentee") {
      if (!inviterChildren.includes(code) || !target.is_child) {
        return NextResponse.json(
          { error: "This mentee is not linked to your account" },
          { status: 403 },
        );
      }

      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(
        target.id as string,
      );
      if (deleteAuthError) {
        return NextResponse.json(
          { error: deleteAuthError.message },
          { status: 500 },
        );
      }

      const nextChildren = inviterChildren.filter((c) => c !== code);
      const selected =
        (inviter.selected_child_code as string | null | undefined) ?? null;
      const nextSelected =
        selected === code ? (nextChildren[0] ?? null) : selected;

      await admin
        .from("profiles")
        .update({
          linked_children: nextChildren,
          selected_child_code: nextSelected,
        })
        .eq("id", parent.userId);

      const { data: otherMentors } = await admin
        .from("profiles")
        .select("id, linked_children, selected_child_code")
        .contains("linked_children", [code]);

      for (const mentor of otherMentors ?? []) {
        if (mentor.id === parent.userId) continue;
        const kids = (mentor.linked_children as string[] | null) ?? [];
        const filtered = kids.filter((c) => c !== code);
        const sel = mentor.selected_child_code as string | null;
        await admin
          .from("profiles")
          .update({
            linked_children: filtered,
            selected_child_code: sel === code ? (filtered[0] ?? null) : sel,
          })
          .eq("id", mentor.id);
      }

      return NextResponse.json({ ok: true, code, role, removed: true });
    }

    // Unused co-mentor — must appear on at least one shared mentee's linked_parents
    if (target.is_child) {
      return NextResponse.json(
        { error: "This account is not a mentor invite" },
        { status: 400 },
      );
    }

    if (inviterChildren.length === 0) {
      return NextResponse.json(
        { error: "No shared mentees to unlink this mentor from" },
        { status: 403 },
      );
    }

    const { data: children, error: childrenError } = await admin
      .from("profiles")
      .select("id, invitation_code, linked_parents")
      .in("invitation_code", inviterChildren);

    if (childrenError) {
      return NextResponse.json({ error: childrenError.message }, { status: 500 });
    }

    const linkedOn = (children ?? []).filter((child) => {
      const parents = (child.linked_parents as string[] | null) ?? [];
      return parents.includes(code);
    });

    if (linkedOn.length === 0) {
      return NextResponse.json(
        { error: "This mentor is not linked through your mentees" },
        { status: 403 },
      );
    }

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(
      target.id as string,
    );
    if (deleteAuthError) {
      return NextResponse.json(
        { error: deleteAuthError.message },
        { status: 500 },
      );
    }

    for (const child of linkedOn) {
      const parents = (child.linked_parents as string[] | null) ?? [];
      await admin
        .from("profiles")
        .update({ linked_parents: parents.filter((p) => p !== code) })
        .eq("id", child.id);
    }

    return NextResponse.json({ ok: true, code, role, removed: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not remove invitation";
    const status = message.includes("SERVICE_ROLE") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
