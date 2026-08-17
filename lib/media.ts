import { fal } from "@fal-ai/client";
import { bucket } from "./firebase";
import type { MediaRef } from "./types";

export async function persistReference(blob: Blob, path: string, label: string): Promise<MediaRef> {
  const storage = bucket();
  if (storage) {
    const file = storage.file(path);
    await file.save(Buffer.from(await blob.arrayBuffer()), { contentType: blob.type || "image/jpeg", resumable: false });
    return { source: "firebase", path, label, createdAt: new Date().toISOString() };
  }
  const url = await fal.storage.upload(blob);
  return { source: "fal", url, label, createdAt: new Date().toISOString() };
}

export async function resolveReference(media: MediaRef): Promise<string> {
  if (media.source === "fal" && media.url) return media.url;
  if (media.source === "firebase" && media.path) {
    const storage = bucket();
    if (!storage) throw new Error("Firebase Storage is not configured.");
    const [url] = await storage.file(media.path).getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
    return url;
  }
  throw new Error("Invalid reference media record.");
}

export async function persistGeneratedVideo(sourceUrl: string, path: string): Promise<{ deliveryUrl: string; storagePath?: string }> {
  const storage = bucket();
  if (!storage) return { deliveryUrl: sourceUrl };
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error("Could not download generated video for durable storage.");
  const file = storage.file(path);
  await file.save(Buffer.from(await response.arrayBuffer()), { contentType: "video/mp4", resumable: false });
  const [deliveryUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  return { deliveryUrl, storagePath: path };
}

export async function resolveStoredVideo(storagePath: string | undefined, fallbackUrl: string): Promise<string> {
  if (!storagePath) return fallbackUrl;
  const storage = bucket();
  if (!storage) return fallbackUrl;
  const [url] = await storage.file(storagePath).getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
  return url;
}

export async function persistRemoteImage(sourceUrl: string, path: string, label: string): Promise<MediaRef> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error("Could not download the extracted continuity frame.");
  return persistReference(await response.blob(), path, label);
}
