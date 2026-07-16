import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasNickname } from "@/lib/auth";
import type { LinkedAccount, Profile } from "@/types";

async function resolveLinkedAccounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  codes: string[],
): Promise<LinkedAccount[]> {
  const filtered = codes.filter(Boolean);
  if (filtered.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, invitation_code, nickname, avatar_url")
    .in("invitation_code", filtered);

  if (error) {
    console.warn("Error loading linked accounts:", error.message);
    return [];
  }

  const byCode = new Map(
    (data ?? []).map((row) => [row.invitation_code as string, row]),
  );

  return filtered
    .map((code) => byCode.get(code))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      id: row.id as string,
      invitation_code: row.invitation_code as string,
      nickname: (row.nickname as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
    }));
}

/**
 * Mentors for a child = linked_parents.
 * Co-mentors for a parent = other parents listed on shared mentees' linked_parents.
 */
async function resolveLinkedMentors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: Profile,
): Promise<LinkedAccount[]> {
  if (profile.is_child) {
    return resolveLinkedAccounts(supabase, profile.linked_parents ?? []);
  }

  const childCodes = (profile.linked_children ?? []).filter(Boolean);
  if (childCodes.length === 0) return [];

  const { data: children, error } = await supabase
    .from("profiles")
    .select("linked_parents")
    .in("invitation_code", childCodes);

  if (error) {
    console.warn("Error loading co-mentors:", error.message);
    return [];
  }

  const mentorCodes = new Set<string>();
  for (const child of children ?? []) {
    const parents = (child.linked_parents as string[] | null) ?? [];
    for (const code of parents) {
      if (code && code !== profile.invitation_code) {
        mentorCodes.add(code);
      }
    }
  }

  return resolveLinkedAccounts(supabase, [...mentorCodes]);
}

async function loadLinkedLists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: Profile,
) {
  const linkedMentees = profile.is_child
    ? []
    : await resolveLinkedAccounts(supabase, profile.linked_children ?? []);
  const linkedMentors = await resolveLinkedMentors(supabase, profile);
  return { linkedMentees, linkedMentors };
}

function buildProfileResponse(
  profile: Profile,
  linkedMentees: LinkedAccount[],
  linkedMentors: LinkedAccount[],
) {
  const isChild = profile.is_child;
  const codes = isChild ? profile.linked_parents : profile.linked_children;
  let selectedChildCode = profile.selected_child_code ?? null;

  if (!isChild && !selectedChildCode && codes.length > 0) {
    selectedChildCode = codes[0] ?? null;
  }

  return {
    profile,
    roleLabel: isChild ? ("Mentee" as const) : ("Mentor" as const),
    selectedChildCode,
    linkedMentees,
    linkedMentors,
  };
}

/** Initial setup only — nickname locked after first set. */
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

  await supabase.auth.updateUser({
    data: { nickname },
  });

  return NextResponse.json({ ok: true, nickname });
}

/** Profile page updates — nickname, avatar, and parent child selection. */
export async function PATCH(request: Request) {
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
    selected_child_code?: string | null;
  };

  const { data: existing, error: loadError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (loadError || !existing) {
    return NextResponse.json(
      { error: loadError?.message || "Profile not found" },
      { status: loadError ? 500 : 404 },
    );
  }

  const updates: Record<string, unknown> = {};

  if (body.nickname !== undefined) {
    const nickname = body.nickname.trim();
    if (!nickname) {
      return NextResponse.json({ error: "Nickname is required" }, { status: 400 });
    }
    updates.nickname = nickname;
  }

  if (body.avatar_url !== undefined) {
    updates.avatar_url = body.avatar_url;
  }

  if (body.selected_child_code !== undefined) {
    if (existing.is_child) {
      return NextResponse.json(
        { error: "Only mentors can select a mentee" },
        { status: 403 },
      );
    }

    const code = body.selected_child_code?.trim() || null;
    const linked = (existing.linked_children as string[] | null) ?? [];

    if (code && !linked.includes(code)) {
      return NextResponse.json(
        { error: "Selected mentee is not linked to your account" },
        { status: 400 },
      );
    }

    updates.selected_child_code = code;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (typeof updates.nickname === "string") {
    await supabase.auth.updateUser({
      data: { nickname: updates.nickname as string },
    });
  }

  const profile = updated as Profile;
  const { linkedMentees, linkedMentors } = await loadLinkedLists(
    supabase,
    profile,
  );

  return NextResponse.json(
    buildProfileResponse(profile, linkedMentees, linkedMentors),
  );
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const typedProfile = profile as Profile;
  const { linkedMentees, linkedMentors } = await loadLinkedLists(
    supabase,
    typedProfile,
  );

  return NextResponse.json(
    buildProfileResponse(typedProfile, linkedMentees, linkedMentors),
  );
}
