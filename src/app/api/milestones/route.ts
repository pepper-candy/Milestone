import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  fetchMenteePrizePath,
  replaceMenteePrizePath,
  saveMentorPrizePathDefault,
  validatePrizePathStops,
  type PrizePathStopInput,
} from "@/lib/prize-path";
import {
  resolveLinkedChildIds,
  resolveSelectedChildId,
} from "@/lib/user-tasks";
import type { SupabaseClient } from "@supabase/supabase-js";

function writeClient(supabase: SupabaseClient): {
  client: SupabaseClient;
  viaAdmin: boolean;
} {
  try {
    return { client: createAdminClient(), viaAdmin: true };
  } catch (err) {
    console.warn(
      "[milestones write] admin client unavailable, using user session:",
      err instanceof Error ? err.message : err,
    );
    return { client: supabase, viaAdmin: false };
  }
}

async function resolveSubjectUserId(
  supabase: SupabaseClient,
  userId: string,
  profile: {
    is_child: boolean;
    linked_children?: string[] | null;
    selected_child_code?: string | null;
  },
  requestedUserId: string | null,
): Promise<{ subjectId: string | null; error?: string; status?: number }> {
  if (profile.is_child) {
    if (requestedUserId && requestedUserId !== userId) {
      return {
        subjectId: null,
        error: "Children can only view their own prize path",
        status: 403,
      };
    }
    return { subjectId: userId };
  }

  const linkedChildIds = await resolveLinkedChildIds(
    supabase,
    profile.linked_children,
  );

  if (requestedUserId) {
    if (!linkedChildIds.includes(requestedUserId)) {
      return {
        subjectId: null,
        error: "Mentee is not linked to this mentor",
        status: 403,
      };
    }
    return { subjectId: requestedUserId };
  }

  const selected = await resolveSelectedChildId(supabase, profile);
  return { subjectId: selected };
}

/** GET prize path for selected mentee (parent) or self (child). */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_child, linked_children, selected_child_code")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const requestedUserId = url.searchParams.get("user_id");

  const resolved = await resolveSubjectUserId(
    supabase,
    user.id,
    profile,
    requestedUserId,
  );
  if (resolved.error) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status ?? 400 },
    );
  }
  if (!resolved.subjectId) {
    return NextResponse.json({ milestones: [], userMilestones: [] });
  }

  const { milestones, error } = await fetchMenteePrizePath(
    supabase,
    resolved.subjectId,
  );
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const { data: userMilestones } = await supabase
    .from("user_milestones")
    .select("*")
    .eq("user_id", resolved.subjectId);

  return NextResponse.json({
    milestones,
    userMilestones: userMilestones ?? [],
    userId: resolved.subjectId,
  });
}

/** PUT — replace stops for one mentee (parents only). */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_child, linked_children, selected_child_code")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  if (profile.is_child) {
    return NextResponse.json(
      { error: "Only parents can edit prize paths" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    user_id?: string;
    stops?: PrizePathStopInput[];
  };

  const menteeUserId = body.user_id?.trim() || null;
  if (!menteeUserId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const linkedChildIds = await resolveLinkedChildIds(
    supabase,
    profile.linked_children,
  );
  if (!linkedChildIds.includes(menteeUserId)) {
    return NextResponse.json(
      { error: "Mentee is not linked to this mentor" },
      { status: 403 },
    );
  }

  const validated = validatePrizePathStops(body.stops ?? []);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { client } = writeClient(supabase);
  const result = await replaceMenteePrizePath(
    client,
    menteeUserId,
    validated.stops,
  );
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const { milestones } = await fetchMenteePrizePath(client, menteeUserId);
  return NextResponse.json({ ok: true, milestones });
}

/**
 * POST actions:
 * - apply_all: copy stops to every linked mentee + save mentor default
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_child, linked_children, selected_child_code")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  if (profile.is_child) {
    return NextResponse.json(
      { error: "Only parents can manage prize paths" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    action?: string;
    stops?: PrizePathStopInput[];
  };

  if (body.action !== "apply_all") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const validated = validatePrizePathStops(body.stops ?? []);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const linkedChildIds = await resolveLinkedChildIds(
    supabase,
    profile.linked_children,
  );
  if (linkedChildIds.length === 0) {
    return NextResponse.json(
      { error: "No linked mentees" },
      { status: 400 },
    );
  }

  const { client } = writeClient(supabase);

  for (const childId of linkedChildIds) {
    const result = await replaceMenteePrizePath(
      client,
      childId,
      validated.stops,
    );
    if (result.error) {
      return NextResponse.json(
        { error: `Failed for mentee ${childId}: ${result.error}` },
        { status: 500 },
      );
    }
  }

  const defaultResult = await saveMentorPrizePathDefault(
    client,
    user.id,
    validated.stops,
  );
  if (defaultResult.error) {
    return NextResponse.json(
      { error: defaultResult.error },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    updated: linkedChildIds.length,
    milestones: validated.stops,
  });
}
