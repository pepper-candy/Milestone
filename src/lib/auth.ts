export function invitationToEmail(code: string): string {
  return `${code.trim().toLowerCase()}@mvp.local`;
}

export function normalizeInvitationCode(code: string): string {
  return code.trim();
}

export function hasNickname(
  nickname: string | null | undefined,
): nickname is string {
  return typeof nickname === "string" && nickname.trim().length > 0;
}
