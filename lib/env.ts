export function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function allowedUserIds(): Set<number> {
  return new Set((process.env.ALLOWED_TELEGRAM_USER_IDS || "")
    .split(",").map((v) => Number(v.trim())).filter(Number.isFinite));
}

export function isAllowed(userId: number): boolean {
  const ids = allowedUserIds();
  return ids.size === 0 || ids.has(userId);
}

export function dailyLimit(): number {
  const parsed = Number(process.env.DAILY_GENERATION_LIMIT || "10");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}
