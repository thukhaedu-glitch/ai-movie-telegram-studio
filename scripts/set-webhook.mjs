const required = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "PUBLIC_BASE_URL"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);

const url = `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/telegram`;
const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  }),
});
const result = await response.json();
if (!response.ok || !result.ok) throw new Error(JSON.stringify(result));
console.log(`Webhook set: ${url}`);
