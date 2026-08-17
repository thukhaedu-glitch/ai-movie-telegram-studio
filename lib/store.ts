import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firebase";
import { dailyLimit } from "./env";
import type { Character, MediaRef, Shot, ModelKey } from "./types";

const now = () => new Date().toISOString();
const slug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function claimUpdate(updateId: number): Promise<boolean> {
  const ref = db().collection("telegram_updates").doc(String(updateId));
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.status !== "failed") return false;
    tx.set(ref, { status: "processing", updatedAt: now() }, { merge: true });
    return true;
  });
}

export async function finishUpdate(updateId: number, status: "completed" | "failed", error?: string) {
  await db().collection("telegram_updates").doc(String(updateId)).set({ status, error: error || null, updatedAt: now() }, { merge: true });
}

export async function createMovie(userId: number, title: string) {
  const ref = db().collection("movies").doc();
  await ref.set({ title, createdBy: userId, createdAt: now(), updatedAt: now() });
  await db().collection("users").doc(String(userId)).set({ activeMovieId: ref.id }, { merge: true });
  return ref.id;
}

export async function activeMovieId(userId: number): Promise<string> {
  const snap = await db().collection("users").doc(String(userId)).get();
  const movieId = snap.data()?.activeMovieId as string | undefined;
  if (!movieId) throw new Error("No active movie. Use /newmovie Movie Title first.");
  return movieId;
}

export async function useMovie(userId: number, movieId: string) {
  const snap = await db().collection("movies").doc(movieId).get();
  if (!snap.exists) throw new Error("Movie ID not found.");
  await db().collection("users").doc(String(userId)).set({ activeMovieId: movieId }, { merge: true });
}

export async function listMovies() {
  const snap = await db().collection("movies").orderBy("updatedAt", "desc").limit(10).get();
  return snap.docs.map((d) => ({ id: d.id, title: d.data().title as string }));
}

export async function upsertCharacter(movieId: string, name: string, description: string) {
  const id = slug(name);
  if (!id) throw new Error("Character name must contain letters or numbers.");
  const ref = db().doc(`movies/${movieId}/characters/${id}`);
  const existing = await ref.get();
  await ref.set({ name, description, references: existing.data()?.references || [], updatedAt: now() }, { merge: true });
  return id;
}

export async function addCharacterReference(movieId: string, name: string, media: MediaRef) {
  const ref = db().doc(`movies/${movieId}/characters/${slug(name)}`);
  if (!(await ref.get()).exists) throw new Error(`Character “${name}” not found. Create it with /character first.`);
  await ref.update({ references: FieldValue.arrayUnion(media), updatedAt: now() });
}

export async function getCharacters(movieId: string, names: string[]): Promise<Character[]> {
  const result: Character[] = [];
  for (const name of names) {
    const snap = await db().doc(`movies/${movieId}/characters/${slug(name)}`).get();
    if (!snap.exists) throw new Error(`Character “${name}” not found.`);
    result.push({ id: snap.id, ...(snap.data() as Omit<Character, "id">) });
  }
  return result;
}

export async function createScene(userId: number, title: string, description: string) {
  const movieId = await activeMovieId(userId);
  const ref = db().collection(`movies/${movieId}/scenes`).doc();
  await ref.set({ title, description, createdAt: now() });
  await db().collection("users").doc(String(userId)).set({ activeSceneId: ref.id }, { merge: true });
  return ref.id;
}

export async function createShot(userId: number, input: Omit<Shot, "id" | "sceneId" | "createdAt">) {
  const movieId = await activeMovieId(userId);
  const user = await db().collection("users").doc(String(userId)).get();
  const sceneId = user.data()?.activeSceneId as string | undefined;
  if (!sceneId) throw new Error("No active scene. Use /scene Title | Description first.");
  const ref = db().collection(`movies/${movieId}/shots`).doc();
  const continuityFrame = user.data()?.continuityFrame as MediaRef | undefined;
  const previousShotId = user.data()?.previousShotId as string | undefined;
  await ref.set({ ...input, sceneId, continuityFrame: continuityFrame || null, previousShotId: previousShotId || null, createdAt: now(), status: "draft" });
  return { movieId, shotId: ref.id };
}

export async function getShot(userId: number, shotId: string): Promise<{ movieId: string; shot: Shot }> {
  const movieId = await activeMovieId(userId);
  const snap = await db().doc(`movies/${movieId}/shots/${shotId}`).get();
  if (!snap.exists) throw new Error("Shot ID not found in the active movie.");
  return { movieId, shot: { id: snap.id, ...(snap.data() as Omit<Shot, "id">) } };
}

export async function consumeQuota(userId: number): Promise<{ allowed: boolean; used: number; limit: number }> {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const ref = db().collection("daily_usage").doc(`${date}_${userId}`);
  const limit = dailyLimit();
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = Number(snap.data()?.used || 0);
    if (used >= limit) return { allowed: false, used, limit };
    tx.set(ref, { userId, date, used: used + 1, updatedAt: now() }, { merge: true });
    return { allowed: true, used: used + 1, limit };
  });
}

export async function saveJob(requestId: string, data: { chatId: number; userId: number; model: ModelKey; movieId: string; shotId: string }) {
  await db().collection("generation_jobs").doc(requestId).set({ ...data, status: "queued", createdAt: now() });
}

export async function claimJobDelivery(requestId: string): Promise<{ movieId: string; shotId: string } | null> {
  const ref = db().collection("generation_jobs").doc(requestId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || ["delivering", "delivered"].includes(snap.data()?.status)) return null;
    const data = snap.data()!;
    tx.update(ref, { status: "delivering", updatedAt: now() });
    return { movieId: data.movieId as string, shotId: data.shotId as string };
  });
}

export async function finishJob(requestId: string, status: "delivered" | "error", details?: Record<string, unknown>) {
  await db().collection("generation_jobs").doc(requestId).set({ status, ...details, updatedAt: now() }, { merge: true });
}

export async function generationForApproval(userId: number, requestId: string) {
  const snap = await db().collection("generation_jobs").doc(requestId).get();
  if (!snap.exists) throw new Error("Generation request not found.");
  const data = snap.data()!;
  if (data.userId !== userId) throw new Error("This generation belongs to another user.");
  if (data.status !== "delivered" || !data.sourceVideoUrl) throw new Error("Generation is not ready for approval yet.");
  return {
    movieId: data.movieId as string,
    shotId: data.shotId as string,
    sourceVideoUrl: data.sourceVideoUrl as string,
    storagePath: data.storagePath as string | undefined,
  };
}

export async function approveContinuity(userId: number, requestId: string, movieId: string, shotId: string, frame: MediaRef) {
  await db().collection("generation_jobs").doc(requestId).set({ approved: true, approvedAt: now(), lastFrame: frame }, { merge: true });
  await db().doc(`movies/${movieId}/shots/${shotId}`).set({ status: "approved", approvedGenerationId: requestId, lastFrame: frame }, { merge: true });
  await db().collection("users").doc(String(userId)).set({ continuityFrame: frame, previousShotId: shotId }, { merge: true });
}

export async function resetContinuity(userId: number) {
  await db().collection("users").doc(String(userId)).set({ continuityFrame: FieldValue.delete(), previousShotId: FieldValue.delete() }, { merge: true });
}
