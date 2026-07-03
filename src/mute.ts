import { getState, setState } from "./db";
import type { App } from "@slack/bolt";

const MUTE_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 3;

let muteTimer: NodeJS.Timeout | null = null;
let muteAttempts = 0;
let muteChannelId: string | null = null;

const MUTE_TRIGGERS = [
  "sona nepis",
  "nepis teraz",
  "ticho",
  "mute",
  "bud ticho",
  "shut up",
  "stisni sa",
];

const UNMUTE_TRIGGERS = ["ano", "yes", "ok", "mozes", "pis", "unmute", "zapni sa"];

export function isMuteTrigger(text: string): boolean {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return MUTE_TRIGGERS.some((t) => lower.includes(t));
}

export function isUnmuteTrigger(text: string): boolean {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return UNMUTE_TRIGGERS.some((t) => lower.includes(t));
}

export async function activateMute(app: App, channelId: string) {
  await setState("mute", { active: true, since: new Date().toISOString() });
  muteAttempts = 0;
  muteChannelId = channelId;

  if (muteTimer) clearTimeout(muteTimer);
  scheduleMuteCheck(app);
}

export async function deactivateMute() {
  await setState("mute", { active: false });
  muteAttempts = 0;
  muteChannelId = null;
  if (muteTimer) {
    clearTimeout(muteTimer);
    muteTimer = null;
  }
}

export async function isMuted(): Promise<boolean> {
  const state = await getState("mute");
  return state?.active === true;
}

function scheduleMuteCheck(app: App) {
  muteTimer = setTimeout(async () => {
    muteAttempts++;
    if (muteAttempts > MAX_ATTEMPTS) {
      // Stop asking, wait for Natka to initiate
      console.log("[mute] Max attempts reached, waiting for user to unmute");
      return;
    }

    if (muteChannelId) {
      try {
        await app.client.chat.postMessage({
          channel: muteChannelId,
          text: "Mozem uz pisat? 🤫",
        });
      } catch (err) {
        console.error("[mute] Failed to send check:", err);
      }
    }

    // Schedule next check
    scheduleMuteCheck(app);
  }, MUTE_CHECK_INTERVAL);
}
