import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    photo_url?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
  };

  if (!body.photo_url || body.latitude == null || body.longitude == null) {
    return NextResponse.json(
      { error: "Photo and GPS are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("location_proofs")
    .insert({
      user_id: user.id,
      photo_url: body.photo_url,
      latitude: body.latitude,
      longitude: body.longitude,
      notes: body.notes ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ proof: data });
}
