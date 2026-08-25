import type { Character, ModelKey, Shot } from "./types";

export const defaultNegative = [
  "identity drift", "face morphing", "different person", "age change", "hairstyle change",
  "wardrobe change", "body proportion change", "duplicate person", "extra limbs", "extra fingers",
  "deformed hands", "asymmetrical eyes", "flicker", "jitter", "frame warping", "floating objects",
  "unwanted text", "subtitles", "logo", "watermark", "low detail", "plastic skin", "oversharpening"
].join(", ");

export function buildPrompt(
  shot: Shot,
  characters: Character[],
  referenceIndices: Record<string, number[]>,
  continuityIndex?: number,
  model?: ModelKey,
) {
  const characterBlock = characters.map((character, index) =>
    `${model === "kling"
      ? `@Element${index + 1}`
      : (referenceIndices[character.id] || []).map((imageIndex) => `[Image${imageIndex}]`).join(", ")} shows the same character: ${character.name}. Identity lock: ${character.description}. Keep the exact same face, age, body proportions, hair and wardrobe throughout the entire shot.`
  ).join("\n");

  const dialogue = shot.dialogue ? `Dialogue/audio: ${shot.dialogue}` : "No spoken dialogue unless implied by the action.";
  const negative = [defaultNegative, shot.negativePrompt].filter(Boolean).join(", ");

  const prompt = [
    "Create one coherent cinematic movie shot. Character identity and continuity have higher priority than stylization.",
    continuityIndex
      ? model === "kling"
        ? "The start image is the exact final frame of the previous approved shot. Begin from that exact composition, character pose, facial identity, wardrobe, lighting, environment and camera position, then continue the new action naturally."
        : `[Image${continuityIndex}] is the exact final frame of the previous approved shot. Begin this new shot from that exact composition, character pose, facial identity, wardrobe, lighting, environment and camera position, then continue the new action naturally.`
      : "This is a fresh shot without a previous-frame continuity anchor.",
    characterBlock,
    `Environment: ${shot.environment}.`,
    `Action and performance: ${shot.action}.`,
    `Composition: ${shot.shotSize} shot, ${shot.cameraAngle} camera angle, ${shot.lens} lens.`,
    `Camera movement: ${shot.cameraMovement}. Movement must be smooth, intentional and physically plausible.`,
    `Lighting and color: ${shot.lighting}. Preserve the same color palette and production design.`,
    dialogue,
    "Maintain facial identity in every frame, including during head turns, occlusion and motion blur.",
    `Avoid: ${negative}.`,
  ].filter(Boolean).join("\n");

  return { prompt, negative };
}
