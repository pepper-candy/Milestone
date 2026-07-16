import type { SupabaseClient } from "@supabase/supabase-js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 5;
const CODE_PATTERN = /^[A-Z0-9]{5}$/;

export function normalizeInviteCodeInput(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function isInviteCodeFormatValid(code: string): boolean {
  return CODE_PATTERN.test(normalizeInviteCodeInput(code));
}

export function generateRandomInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function isInviteCodeAvailable(
  supabase: SupabaseClient,
  code: string,
): Promise<boolean> {
  const normalized = normalizeInviteCodeInput(code);
  if (!isInviteCodeFormatValid(normalized)) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("invitation_code", normalized)
    .maybeSingle();

  return !profile;
}

export async function suggestAvailableInviteCode(
  supabase: SupabaseClient,
): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = generateRandomInviteCode();
    if (await isInviteCodeAvailable(supabase, candidate)) {
      return candidate;
    }
  }
  throw new Error("Could not generate an available invitation code");
}
