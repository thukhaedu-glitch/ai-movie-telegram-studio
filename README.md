# AI Movie Telegram Studio

An MVP production system for creating character-consistent AI movie shots through Telegram. It uses:

- Telegram as the team interface
- Vercel/Next.js as the secure webhook backend
- Firebase Firestore for movie, character, scene, shot, quota and job state
- Firebase Storage for durable reference images
- fal.ai for Seedance 2.5, Veo 3.1 Fast and Grok Imagine 1.5 rendering

## Why this is not a one-prompt bot

Movie continuity needs persistent identity and shot data. The system stores a character bible, multiple clean reference angles, scene context, shot grammar, negative constraints, the chosen model and the generated job. It generates short controlled shots and returns them to Telegram for approval and editing.

## Setup

1. Create a Telegram bot with `@BotFather` and copy the bot token.
2. Create a fal.ai API key and add billing credit.
3. Create a Firebase project. Enable Firestore. For durable assets, enable Storage and use the Blaze plan; small usage can remain within no-cost quotas.
4. Create a Firebase service account and copy its project ID, client email and private key.
5. Deploy this repository to Vercel.
6. Add every variable from `.env.example` in Vercel Project Settings → Environment Variables.
7. Redeploy, confirm `https://YOUR-DOMAIN/api/health`, then run `npm run set-webhook` with the same environment variables locally.
8. Send `/myid` to the bot, place that numeric ID in `ALLOWED_TELEGRAM_USER_IDS`, and redeploy. Add team IDs separated by commas.

Never paste API keys into source code or Telegram messages.

## Telegram workflow

```text
/newmovie The Last Signal
/character Maya | fictional woman, 28, oval face, brown eyes, shoulder-length black hair, charcoal field jacket, red scarf
```

Send 3–5 clean reference images (front, 3/4, profile, full body) with this caption:

```text
/charref Maya
```

Create a scene:

```text
/scene Rooftop Discovery | Rainy Dubai rooftop at midnight; Maya finds the hidden transmitter.
```

Create a controlled shot. Fields are separated by `|`:

```text
/shot Maya | Maya walks toward the transmitter, kneels and reaches for it cautiously | medium close-up | low three-quarter angle | 50mm | slow dolly-in | cool moonlight with warm red practical light | wet rooftop, Dubai skyline, light rain | Maya whispers "I found it" | heavy rain on face, camera shake | 6 | 16:9
```

The bot returns a shot ID. Generate it:

```text
/generate SHOT_ID seedance
```

When the result is good, approve it with the full fal request ID shown by the bot:

```text
/approve FULL_REQUEST_ID
```

The bot uses fal's FFmpeg frame extractor to capture the last frame, stores it as the continuity anchor, and automatically sends it as the first visual reference for the next `/shot`. This carries forward pose, facial identity, wardrobe, lighting, set and camera position. Use `/resetcontinuity` before a hard cut or unrelated scene.

Models:

- `seedance`: best default for multi-reference character continuity and camera direction
- `veo`: strong cinematic dialogue/audio; first reference image is used
- `grok`: useful for faster drafts and lower-cost exploration

## Character consistency rules

1. Use fictional or properly licensed/consented identities.
2. Build one canonical character sheet before video: front, 3/4, profile, full body, neutral expression and fixed wardrobe.
3. Keep the exact character description unchanged across shots.
4. Use 4–8 second shots while locking the visual language.
5. Approve a generation to automatically reuse its last frame as the next shot's first continuity reference.
6. Draft at 480p where supported, keep the winning seed, and render the approved version at 720p.
7. Assemble approved shots in a timeline editor or FFmpeg/Remotion; do not ask one generation to make an entire movie.

## Cost control

- `DAILY_GENERATION_LIMIT` prevents accidental team overuse.
- Telegram update IDs and fal request IDs are stored to reduce duplicate paid generations.
- Seedance 2.5 is premium. Use Grok or 480p Seedance drafts for composition, then render approved shots at production quality.

## Current MVP boundaries

- Command-based UI; an inline-button Telegram interface can be added next.
- The renderer uses up to four angles per character within each model's reference limit. Manual per-shot reference weighting is the next upgrade.
- Final timeline assembly, subtitles, music mastering and upscaling are not yet automated.
- Provider content and likeness policies still apply to every generation.
