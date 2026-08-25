import { NextRequest, NextResponse } from "next/server";
import { verifyFalContext } from "@/lib/security";
import { claimJobDelivery, finishJob } from "@/lib/store";
import { sendMessage, sendVideo } from "@/lib/telegram";
import { persistGeneratedVideo } from "@/lib/media";
import type { ModelKey } from "@/lib/types";

export const runtime = "nodejs";

interface FalWebhook {
  request_id: string;
  status: "OK" | "ERROR";
  payload?: { video?: { url?: string }; error?: unknown; detail?: unknown };
  error?: unknown;
  detail?: unknown;
}

function errorText(body: FalWebhook): string {
  const error = body.error ?? body.detail ?? body.payload?.error ?? body.payload?.detail;
  if (!error) return "No video returned.";
  if (typeof error === "string") return error;
  try { return JSON.stringify(error).slice(0, 3000); }
  catch { return String(error); }
}

export async function POST(request: NextRequest) {
  const chatId = Number(request.nextUrl.searchParams.get("c"));
  const userId = Number(request.nextUrl.searchParams.get("u"));
  const model = request.nextUrl.searchParams.get("m") as ModelKey;
  const signature = request.nextUrl.searchParams.get("s") || "";
  if (!chatId || !userId || !["seedance", "veo", "grok", "kling"].includes(model) || !verifyFalContext(chatId, userId, model, signature)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json() as FalWebhook;
  const job = await claimJobDelivery(body.request_id);
  if (!job) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const videoUrl = body.payload?.video?.url;
    if (body.status !== "OK" || !videoUrl) {
      const message = errorText(body);
      await sendMessage(chatId, `❌ ${model} generation failed.\n${message}`);
      await finishJob(body.request_id, "error", { error: message });
      return NextResponse.json({ ok: true });
    }
    const stored = await persistGeneratedVideo(videoUrl, `movies/${job.movieId}/shots/${job.shotId}/generations/${body.request_id}.mp4`);
    await sendVideo(chatId, stored.deliveryUrl, `✅ ${model.toUpperCase()} shot ready\nShot: ${job.shotId}\nRequest ID: ${body.request_id}\n\nApprove:\n/approve ${body.request_id}`);
    await finishJob(body.request_id, "delivered", { sourceVideoUrl: videoUrl, storagePath: stored.storagePath || null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await finishJob(body.request_id, "error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
