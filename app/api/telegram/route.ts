import { NextRequest, NextResponse } from "next/server";
import { isAllowed, env } from "@/lib/env";
import { downloadTelegramPhoto, sendMessage } from "@/lib/telegram";
import { persistReference } from "@/lib/media";
import {
  activeMovieId, addCharacterReference, approveContinuity, claimUpdate, consumeQuota, createMovie, createScene, createShot,
  finishUpdate, generationForApproval, getCharacters, getShot, listMovies, resetContinuity, saveJob, upsertCharacter, useMovie,
} from "@/lib/store";
import { submitShot } from "@/lib/fal-movie";
import { fal } from "@fal-ai/client";
import { persistRemoteImage, resolveStoredVideo } from "@/lib/media";
import type { ModelKey, Shot, TelegramMessage, TelegramUpdate } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const help = `🎬 AI Movie Studio

1. /newmovie Movie Title
2. /character Name | fixed identity description + wardrobe
3. Send a clear reference photo with caption: /charref Name
   Add front, 3/4, profile and full-body photos one at a time.
4. /scene Scene Title | environment and story purpose
5. Create a shot:
/shot Character1,Character2 | action | shot size | camera angle | lens | movement | lighting | environment | dialogue | negative prompt | duration | aspect ratio
6. /generate SHOT_ID seedance
7. When it looks right: /approve FULL_REQUEST_ID
   The bot extracts its last frame and anchors the next /shot to it.

Models: seedance (best continuity), veo (cinematic dialogue), grok (fast drafts)
Other: /movies, /use MOVIE_ID, /resetcontinuity, /myid`;

const textOf = (message: TelegramMessage) => (message.text || message.caption || "").trim();
const splitArgs = (value: string) => value.split("|").map((part) => part.trim());

async function handle(message: TelegramMessage) {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  if (!userId) return;
  if (!isAllowed(userId)) return sendMessage(chatId, `Access denied. Your Telegram ID is ${userId}.`);
  const text = textOf(message);

  if (/^\/(start|help)(?:@\w+)?$/i.test(text)) return sendMessage(chatId, help);
  if (/^\/myid(?:@\w+)?$/i.test(text)) return sendMessage(chatId, `Your Telegram user ID: ${userId}`);

  let match = text.match(/^\/newmovie(?:@\w+)?\s+(.+)$/is);
  if (match) {
    const id = await createMovie(userId, match[1].trim());
    return sendMessage(chatId, `✅ Movie created and selected.\nTitle: ${match[1].trim()}\nMovie ID: ${id}`);
  }

  if (/^\/movies(?:@\w+)?$/i.test(text)) {
    const movies = await listMovies();
    return sendMessage(chatId, movies.length ? movies.map((m) => `${m.id} — ${m.title}`).join("\n") : "No movies yet.");
  }

  match = text.match(/^\/use(?:@\w+)?\s+(\S+)$/i);
  if (match) { await useMovie(userId, match[1]); return sendMessage(chatId, `✅ Active movie: ${match[1]}`); }

  match = text.match(/^\/character(?:@\w+)?\s+(.+)$/is);
  if (match) {
    const [name, description] = splitArgs(match[1]);
    if (!name || !description) throw new Error("Use: /character Name | detailed fixed appearance and wardrobe");
    const movieId = await activeMovieId(userId);
    await upsertCharacter(movieId, name, description);
    return sendMessage(chatId, `✅ Character saved: ${name}\nNow send reference photos with caption: /charref ${name}`);
  }

  match = text.match(/^\/charref(?:@\w+)?\s+(.+)$/is);
  if (match) {
    if (!message.photo?.length) throw new Error("Attach a photo and put /charref Character Name in its caption.");
    const name = match[1].trim();
    const movieId = await activeMovieId(userId);
    const photo = message.photo[message.photo.length - 1];
    const { blob, extension } = await downloadTelegramPhoto(photo.file_id);
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const media = await persistReference(blob, `movies/${movieId}/characters/${safeName}/${Date.now()}.${extension}`, name);
    await addCharacterReference(movieId, name, media);
    return sendMessage(chatId, `✅ Reference added for ${name}. Add 3–5 clean angles for stronger consistency.`);
  }

  match = text.match(/^\/scene(?:@\w+)?\s+(.+)$/is);
  if (match) {
    const [title, description] = splitArgs(match[1]);
    if (!title || !description) throw new Error("Use: /scene Title | environment and story purpose");
    const id = await createScene(userId, title, description);
    return sendMessage(chatId, `✅ Scene created and selected. Scene ID: ${id}`);
  }

  match = text.match(/^\/shot(?:@\w+)?\s+(.+)$/is);
  if (match) {
    const parts = splitArgs(match[1]);
    if (parts.length < 8) throw new Error("Shot needs at least 8 fields. Use /help for the format.");
    const [names, action, shotSize, cameraAngle, lens, cameraMovement, lighting, environment, dialogue = "", negativePrompt = "", durationText = "6", ratio = "16:9"] = parts;
    const duration = Number(durationText);
    const aspectRatio = (["16:9", "9:16", "1:1"].includes(ratio) ? ratio : "16:9") as Shot["aspectRatio"];
    const input = {
      characterNames: names.split(",").map((n) => n.trim()).filter(Boolean), action, shotSize, cameraAngle, lens,
      cameraMovement, lighting, environment, dialogue, negativePrompt,
      duration: Number.isFinite(duration) ? Math.min(30, Math.max(4, duration)) : 6, aspectRatio,
    };
    const result = await createShot(userId, input);
    return sendMessage(chatId, `✅ Shot saved.\nShot ID: ${result.shotId}\nGenerate: /generate ${result.shotId} seedance`);
  }

  match = text.match(/^\/generate(?:@\w+)?\s+(\S+)\s+(seedance|veo|grok)$/i);
  if (match) {
    const shotId = match[1];
    const model = match[2].toLowerCase() as ModelKey;
    const quota = await consumeQuota(userId);
    if (!quota.allowed) throw new Error(`Daily limit reached (${quota.used}/${quota.limit}).`);
    const { movieId, shot } = await getShot(userId, shotId);
    const characters = await getCharacters(movieId, shot.characterNames);
    const job = await submitShot({ chatId, userId, model, shot, characters });
    await saveJob(job.requestId, { chatId, userId, model, movieId, shotId });
    return sendMessage(chatId, `🎞 Rendering with ${model.toUpperCase()}…\nShot: ${shotId}\nDaily usage: ${quota.used}/${quota.limit}\nRequest ID: ${job.requestId}\n\nWhen ready and approved, use:\n/approve ${job.requestId}`);
  }

  match = text.match(/^\/approve(?:@\w+)?\s+(\S+)$/i);
  if (match) {
    const requestId = match[1];
    const generation = await generationForApproval(userId, requestId);
    const videoUrl = await resolveStoredVideo(generation.storagePath, generation.sourceVideoUrl);
    const extracted = await fal.subscribe("fal-ai/ffmpeg-api/extract-frame", {
      input: { video_url: videoUrl, frame_type: "last" },
    });
    const lastFrameUrl = (extracted.data as { images?: Array<{ url?: string }> }).images?.[0]?.url;
    if (!lastFrameUrl) throw new Error("Could not extract the last frame.");
    const frame = await persistRemoteImage(lastFrameUrl, `movies/${generation.movieId}/shots/${generation.shotId}/continuity/${requestId}.jpg`, "approved-last-frame");
    await approveContinuity(userId, requestId, generation.movieId, generation.shotId, frame);
    return sendMessage(chatId, `✅ Shot approved. Its final frame is now the continuity anchor.\nYour next /shot will begin from this exact frame.\nUse /resetcontinuity when you want a clean scene cut.`);
  }

  if (/^\/resetcontinuity(?:@\w+)?$/i.test(text)) {
    await resetContinuity(userId);
    return sendMessage(chatId, "✅ Continuity anchor cleared. The next shot will start fresh.");
  }

  return sendMessage(chatId, `Command not recognized.\n\n${help}`);
}

export async function POST(request: NextRequest) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== env("TELEGRAM_WEBHOOK_SECRET")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await request.json() as TelegramUpdate;
  if (!(await claimUpdate(update.update_id))) return NextResponse.json({ ok: true, duplicate: true });
  try {
    if (update.message) await handle(update.message);
    await finishUpdate(update.update_id, "completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (update.message) await sendMessage(update.message.chat.id, `❌ ${message}`);
    await finishUpdate(update.update_id, "failed", message);
  }
  return NextResponse.json({ ok: true });
}
