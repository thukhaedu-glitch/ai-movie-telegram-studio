import { env } from "./env";

async function telegram(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json() as { ok: boolean; description?: string; result?: unknown };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || "unknown error"}`);
  return data.result;
}

export async function sendMessage(chatId: number, text: string) {
  return telegram("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

export async function sendVideo(chatId: number, video: string, caption: string) {
  try {
    return await telegram("sendVideo", { chat_id: chatId, video, caption, supports_streaming: true });
  } catch {
    return sendMessage(chatId, `${caption}\n\nDownload: ${video}`);
  }
}

export async function downloadTelegramPhoto(fileId: string): Promise<{ blob: Blob; extension: string }> {
  const file = await telegram("getFile", { file_id: fileId }) as { file_path: string };
  const response = await fetch(`https://api.telegram.org/file/bot${env("TELEGRAM_BOT_TOKEN")}/${file.file_path}`);
  if (!response.ok) throw new Error("Could not download Telegram image.");
  const blob = await response.blob();
  const extension = file.file_path.split(".").pop() || "jpg";
  return { blob, extension };
}
