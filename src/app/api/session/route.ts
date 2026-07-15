import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseUtcMs, toUtcIso } from "@/lib/datetime";
import {
  LOCATION_CONSISTENCY_METERS,
  calculateSessionExp,
  distanceMeters,
} from "@/lib/scoring";
import { resolvePrimaryChildId } from "@/lib/user-tasks";
import type { ActiveSessionState } from "@/types";

function toActive(
  row: {
    id: string;
    started_at: string;
    is_tutorial: boolean | null;
  },
  serverNow: string,
): ActiveSessionState {
  return {
    sessionId: row.id,
    startedAt: toUtcIso(row.started_at),
    serverNow,
    isTutorial: Boolean(row.is_tutorial),
  };
}

/** Open session owned by user, or conducted by parent on a child record. */
async function fetchOpenSession(supabase: SupabaseClient, userId: string) {
  const { data: asOwner, error: ownerError } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ownerError) return { data: null, error: ownerError };
  if (asOwner) return { data: asOwner, error: null };

  const { data: asConductor, error: conductorError } = await supabase
    .from("sessions")
    .select("*")
    .eq("conducted_by_user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data: asConductor, error: conductorError };
}

// ============================================================
// GET: Active session + server clock for duration sync
// ============================================================
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("❌ GET /api/session: Unauthorized", userError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverNow = new Date().toISOString();
    const { data: open, error: fetchError } = await fetchOpenSession(
      supabase,
      user.id,
    );

    if (fetchError) {
      console.error("❌ GET /api/session: DB error", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const active = open ? toActive(open, serverNow) : null;
    return NextResponse.json({ active, serverNow });
  } catch (error) {
    console.error("❌ GET /api/session: Unhandled error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================
// POST: Start or end a session
// ============================================================
export async function POST(request: Request) {
  try {
    console.log("🔍 POST /api/session called");

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("❌ POST /api/session: Unauthorized", userError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
      action: "start" | "end";
      photo_url?: string;
      latitude?: number;
      longitude?: number;
      is_tutorial?: boolean;
    };

    try {
      body = await request.json();
    } catch (parseError) {
      console.error("❌ POST /api/session: Invalid JSON", parseError);
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    console.log("📦 Session body:", JSON.stringify(body, null, 2));

    if (!body.action) {
      return NextResponse.json(
        { error: "Missing 'action' field" },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_child, nickname, linked_children")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("❌ POST /api/session: Profile fetch error", profileError);
      return NextResponse.json(
        { error: "Could not fetch profile" },
        { status: 500 },
      );
    }

    const isChild = profile?.is_child ?? true;
    const isTutorial = Boolean(body.is_tutorial) && !isChild;
    const nickname = (profile?.nickname as string | null) ?? null;

    console.log(
      `👤 User ${user.id}, isChild: ${isChild}, isTutorial: ${isTutorial}`,
    );

    // ----------------------------------------------------------
    // Start
    // ----------------------------------------------------------
    if (body.action === "start") {
      if (!isTutorial) {
        if (body.latitude == null || body.longitude == null) {
          return NextResponse.json(
            { error: "GPS is required to start" },
            { status: 400 },
          );
        }
      }

      const { data: existing, error: existingError } = await fetchOpenSession(
        supabase,
        user.id,
      );

      if (existingError) {
        console.error(
          "❌ POST /api/session: Check existing error",
          existingError,
        );
        return NextResponse.json(
          { error: existingError.message },
          { status: 500 },
        );
      }

      if (existing) {
        return NextResponse.json(
          { error: "A session is already running" },
          { status: 409 },
        );
      }

      // Parents always credit the linked child's record (tutorial ×3).
      let ownerUserId = user.id;
      let conductedBy: string | null = null;
      let conductorNickname: string | null = null;

      if (isTutorial) {
        const childId = await resolvePrimaryChildId(
          supabase,
          profile?.linked_children,
        );
        if (!childId) {
          return NextResponse.json(
            { error: "Link a child before starting a tutorial session" },
            { status: 400 },
          );
        }
        ownerUserId = childId;
        conductedBy = user.id;
        conductorNickname = nickname;
      }

      const startedAt = new Date().toISOString();

      const { data: inserted, error: insertError } = await supabase
        .from("sessions")
        .insert({
          user_id: ownerUserId,
          started_at: startedAt,
          start_photo_url: body.photo_url ?? null,
          start_latitude: body.latitude ?? null,
          start_longitude: body.longitude ?? null,
          is_tutorial: isTutorial,
          is_paused: false,
          paused_ms: 0,
          conducted_by_user_id: conductedBy,
          conductor_nickname: conductorNickname,
        })
        .select("*")
        .single();

      if (insertError) {
        console.error("❌ POST /api/session: Insert error", insertError);
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 },
        );
      }

      return NextResponse.json({
        active: toActive(inserted, startedAt),
        session: inserted,
      });
    }

    // ----------------------------------------------------------
    // End
    // ----------------------------------------------------------
    if (body.action === "end") {
      const { data: open, error: openError } = await fetchOpenSession(
        supabase,
        user.id,
      );

      if (openError) {
        console.error(
          "❌ POST /api/session: Fetch open session error",
          openError,
        );
        return NextResponse.json(
          { error: openError.message },
          { status: 500 },
        );
      }

      if (!open) {
        return NextResponse.json(
          { error: "No active session" },
          { status: 404 },
        );
      }

      const isTutorialSession = Boolean(open.is_tutorial);
      if (!isTutorialSession) {
        if (body.latitude == null || body.longitude == null) {
          return NextResponse.json(
            { error: "GPS is required to end" },
            { status: 400 },
          );
        }
      }

      const endedAt = new Date();
      const durationSeconds = Math.max(
        0,
        Math.floor((endedAt.getTime() - parseUtcMs(open.started_at)) / 1000),
      );
      const expEarned = calculateSessionExp(durationSeconds, isTutorialSession);

      let locationConsistent: boolean | null = null;
      if (
        open.start_latitude != null &&
        open.start_longitude != null &&
        body.latitude != null &&
        body.longitude != null
      ) {
        const dist = distanceMeters(
          Number(open.start_latitude),
          Number(open.start_longitude),
          body.latitude,
          body.longitude,
        );
        locationConsistent = dist <= LOCATION_CONSISTENCY_METERS;
      }

      const { data: updated, error: endError } = await supabase
        .from("sessions")
        .update({
          ended_at: endedAt.toISOString(),
          duration_seconds: durationSeconds,
          end_photo_url: body.photo_url ?? null,
          end_latitude: body.latitude ?? null,
          end_longitude: body.longitude ?? null,
          exp_earned: expEarned,
          is_paused: false,
          paused_at: null,
          location_consistent: locationConsistent,
        })
        .eq("id", open.id)
        .select("*")
        .single();

      if (endError) {
        console.error("❌ POST /api/session: End error", endError);
        return NextResponse.json({ error: endError.message }, { status: 500 });
      }

      return NextResponse.json({ session: updated, active: null });
    }

    return NextResponse.json(
      { error: "Unknown action. Allowed: start, end" },
      { status: 400 },
    );
  } catch (error) {
    console.error("❌ POST /api/session: Unhandled error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
