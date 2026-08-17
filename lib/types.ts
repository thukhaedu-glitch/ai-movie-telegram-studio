export type ModelKey = "seedance" | "veo" | "grok";

export interface TelegramPhoto { file_id: string; file_size?: number; width: number; height: number; }
export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; first_name: string; username?: string };
  text?: string;
  caption?: string;
  photo?: TelegramPhoto[];
}
export interface TelegramUpdate { update_id: number; message?: TelegramMessage; }

export interface MediaRef {
  source: "firebase" | "fal";
  path?: string;
  url?: string;
  label?: string;
  createdAt: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  references: MediaRef[];
}

export interface Shot {
  id: string;
  sceneId: string;
  characterNames: string[];
  action: string;
  shotSize: string;
  cameraAngle: string;
  lens: string;
  cameraMovement: string;
  lighting: string;
  environment: string;
  dialogue: string;
  negativePrompt: string;
  duration: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  seed?: number;
  continuityFrame?: MediaRef;
  previousShotId?: string;
  createdAt: string;
}
