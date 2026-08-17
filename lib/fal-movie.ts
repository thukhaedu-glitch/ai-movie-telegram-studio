import { fal } from "@fal-ai/client";
import { env } from "./env";
import { signFalContext } from "./security";
import { resolveReference } from "./media";
import { buildPrompt } from "./prompt";
import type { Character, ModelKey, Shot } from "./types";

const endpoints: Record<ModelKey, { text: string; reference: string }> = {
  seedance: {
    text: "bytedance/seedance-2.5/text-to-video",
    reference: "bytedance/seedance-2.5/reference-to-video",
  },
  veo: {
    text: "fal-ai/veo3.1/fast",
    reference: "fal-ai/veo3.1/fast/image-to-video",
  },
  grok: {
    text: "xai/grok-imagine-video/v1.5/text-to-video",
    reference: "xai/grok-imagine-video/v1.5/reference-to-video",
  },
};

export async function submitShot(params: { chatId: number; userId: number; model: ModelKey; shot: Shot; characters: Character[] }) {
  const { chatId, userId, model, shot, characters } = params;
  if (model === "veo" && characters.length > 1 && !shot.continuityFrame) {
    throw new Error("Veo image-to-video accepts one main character reference in this MVP. Use Seedance for multi-character shots.");
  }

  const maxReferences = model === "seedance" ? 20 : model === "grok" ? 7 : 1;
  const selected: Array<{ character: Character; mediaIndex: number }> = [];
  const imageUrls: string[] = [];
  let continuityIndex: number | undefined;
  if (shot.continuityFrame) {
    imageUrls.push(await resolveReference(shot.continuityFrame));
    continuityIndex = 1;
  }
  for (const character of characters) {
    if (!character.references.length) throw new Error(`${character.name} has no reference image. Upload one with /charref.`);
    if (selected.length + imageUrls.length < maxReferences) selected.push({ character, mediaIndex: 0 });
  }
  for (let mediaIndex = 1; selected.length < maxReferences && mediaIndex < 4; mediaIndex++) {
    for (const character of characters) {
      if (selected.length >= maxReferences) break;
      if (character.references[mediaIndex]) selected.push({ character, mediaIndex });
    }
  }

  const referenceIndices: Record<string, number[]> = {};
  for (const item of selected.slice(0, maxReferences - imageUrls.length)) {
    imageUrls.push(await resolveReference(item.character.references[item.mediaIndex]));
    (referenceIndices[item.character.id] ||= []).push(imageUrls.length);
  }

  const { prompt, negative } = buildPrompt(shot, characters, referenceIndices, continuityIndex);
  const hasReferences = imageUrls.length > 0;
  const endpoint = hasReferences ? endpoints[model].reference : endpoints[model].text;

  const input: Record<string, unknown> = {
    prompt,
    duration: model === "veo"
      ? `${Math.min(8, Math.max(4, shot.duration % 2 === 0 ? shot.duration : 6))}s`
      : model === "seedance"
        ? String(Math.min(30, Math.max(4, shot.duration)))
        : Math.min(15, Math.max(5, shot.duration)),
    aspect_ratio: model === "veo" && shot.aspectRatio === "1:1" ? "16:9" : shot.aspectRatio,
   resolution: model === "veo" ? "720p" : "480p",
    generate_audio: true,
    end_user_id: String(userId),
  };

  if (shot.seed) input.seed = shot.seed;
  if (model === "veo") input.negative_prompt = negative;
  if (hasReferences && model === "seedance") input.image_urls = imageUrls;
  if (hasReferences && model === "grok") input.reference_image_urls = imageUrls.slice(0, 7);
  if (hasReferences && model === "veo") {
    input.image_url = imageUrls[0];
    delete input.end_user_id;
  }
  if (model !== "seedance") delete input.end_user_id;

  const signature = signFalContext(chatId, userId, model);
  const webhook = new URL("/api/fal", env("PUBLIC_BASE_URL"));
  webhook.searchParams.set("c", String(chatId));
  webhook.searchParams.set("u", String(userId));
  webhook.searchParams.set("m", model);
  webhook.searchParams.set("s", signature);

  const result = await fal.queue.submit(endpoint, { input, webhookUrl: webhook.toString() });
  return { requestId: result.request_id, endpoint, prompt };
}
