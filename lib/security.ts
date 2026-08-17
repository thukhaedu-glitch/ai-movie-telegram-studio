import { createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";
import type { ModelKey } from "./types";

export function signFalContext(chatId: number, userId: number, model: ModelKey): string {
  return createHmac("sha256", env("FAL_WEBHOOK_SECRET"))
    .update(`${chatId}:${userId}:${model}`).digest("hex");
}

export function verifyFalContext(chatId: number, userId: number, model: ModelKey, signature: string): boolean {
  const expected = signFalContext(chatId, userId, model);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
