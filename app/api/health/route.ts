import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const checks = {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    fal: Boolean(process.env.FAL_KEY),
    firebase: Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY),
    storage: Boolean(process.env.FIREBASE_STORAGE_BUCKET),
    publicUrl: Boolean(process.env.PUBLIC_BASE_URL),
  };
  return NextResponse.json({ ok: Object.values(checks).every(Boolean), checks, service: "ai-movie-telegram-studio" });
}
