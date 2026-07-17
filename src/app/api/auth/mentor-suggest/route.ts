import {
  isInviteCodeAvailable,
  suggestAvailableInviteCode,
} from "@/lib/invitation-code";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Public: suggest an unused invite code for "Start as a Mentor". */
export async function GET() {
  try {
    const supabase = await createClient();
    const code = await suggestAvailableInviteCode(supabase);
    const available = await isInviteCodeAvailable(supabase, code);
    return NextResponse.json({ code, available });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not suggest a code";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
