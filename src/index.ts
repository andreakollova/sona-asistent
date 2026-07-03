import "dotenv/config";
import { App } from "@slack/bolt";
import { config } from "./config";
import { chat } from "./llm";
import { saveMessage, getRecentContext, getState } from "./db";
import {
  isMuteTrigger,
  isUnmuteTrigger,
  activateMute,
  deactivateMute,
  isMuted,
} from "./mute";
import { startProactiveScheduler } from "./proactive";

const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  socketMode: true,
  signingSecret: config.slack.signingSecret,
});

let botUserId: string | null = null;

// ── Handle all messages (DMs + mentions) ──

// Log ALL incoming events for debug
app.use(async (args) => {
  const event = (args as any).event;
  if (event) console.log(`[debug] Event: ${event.type} | channel_type: ${event.channel_type} | text: ${(event.text || "").slice(0, 50)}`);
  await args.next();
});

app.event("message", async ({ event, say }) => {
  console.log("[debug] message event received:", JSON.stringify(event).slice(0, 300));
  // Ignore bot messages and message changes
  if ((event as any).bot_id || (event as any).subtype) return;

  const msg = event as any;
  const text: string = msg.text || "";
  const userId: string = msg.user;
  const channelId: string = msg.channel;
  const channelType: string = msg.channel_type; // im = DM, channel, group

  // Respond to ALL messages in channels where Sona is a member + DMs
  const isDM = channelType === "im";
  const isMention = botUserId ? text.includes(`<@${botUserId}>`) : false;

  // Skip if it's a mention — app_mention handler takes care of those to avoid duplicates
  if (isMention && !isDM) return;

  // Clean mention from text
  const cleanText = botUserId
    ? text.replace(new RegExp(`<@${botUserId}>`, "g"), "").trim()
    : text;

  if (!cleanText) return;

  // Handle mute
  if (isMuteTrigger(cleanText)) {
    await activateMute(app, channelId);
    await say("Ok, som ticho. Ozvem sa o 15 min ci uz mozem.");
    return;
  }

  // Handle unmute
  const muteState = await getState("mute");
  if (muteState?.active && isUnmuteTrigger(cleanText)) {
    await deactivateMute();
    await say("Super, som spat! Co potrebujes?");
    return;
  }

  // If muted, ignore (unless unmute trigger above caught it)
  if (await isMuted()) return;

  // Get user info for name
  let userName = "user";
  try {
    const userInfo = await app.client.users.info({ user: userId });
    userName =
      userInfo.user?.real_name || userInfo.user?.name || "user";
  } catch {}

  // Save user message
  await saveMessage({
    user_id: userId,
    user_name: userName,
    channel_id: channelId,
    role: "user",
    content: cleanText,
  });

  // Get conversation history for context
  const history = await getRecentContext(channelId, 20);
  const conversationMessages = history.slice(0, -1).map((m) => ({
    role: m.role as "user" | "assistant",
    content:
      m.role === "user"
        ? `[${m.user_name || "user"}]: ${m.content}`
        : m.content,
  }));

  // Determine if we should use Opus (deep analysis requests)
  const useOpus = shouldUseOpus(cleanText);

  try {
    // Add typing indicator
    // (Slack Bolt doesn't have a direct typing API, but the response time should be fast enough)

    const response = await chat(
      `[${userName}]: ${cleanText}`,
      conversationMessages,
      { mode: "reactive", useOpus }
    );

    if (response && response.trim() !== "[TICHO]") {
      await say(response);

      // Save assistant response
      await saveMessage({
        user_id: "sona",
        channel_id: channelId,
        role: "assistant",
        content: response,
      });
    }
  } catch (err) {
    console.error("[message] Error:", err);
    await say("Ups, nieco sa pokazilo. Skus to znova za chvilu.");
  }
});

// ── App mention handler (for channels) ──

app.event("app_mention", async ({ event, say }) => {
  console.log("[debug] app_mention received:", JSON.stringify(event).slice(0, 300));
  const text: string = (event as any).text || "";
  const userId: string = (event as any).user;
  const channelId: string = (event as any).channel;

  // Clean mention from text
  const cleanText = botUserId
    ? text.replace(new RegExp(`<@${botUserId}>`, "g"), "").trim()
    : text;

  if (!cleanText) return;

  // Handle mute
  if (isMuteTrigger(cleanText)) {
    await activateMute(app, channelId);
    await say("Ok, som ticho. Ozvem sa o 15 min ci uz mozem.");
    return;
  }

  const muteState = await getState("mute");
  if (muteState?.active && isUnmuteTrigger(cleanText)) {
    await deactivateMute();
    await say("Super, som spat! Co potrebujes?");
    return;
  }
  if (await isMuted()) return;

  let userName = "user";
  try {
    const userInfo = await app.client.users.info({ user: userId });
    userName = userInfo.user?.real_name || userInfo.user?.name || "user";
  } catch {}

  await saveMessage({
    user_id: userId,
    user_name: userName,
    channel_id: channelId,
    role: "user",
    content: cleanText,
  });

  const history = await getRecentContext(channelId, 20);
  const conversationMessages = history.slice(0, -1).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.role === "user" ? `[${m.user_name || "user"}]: ${m.content}` : m.content,
  }));

  const useOpus = shouldUseOpus(cleanText);

  try {
    const response = await chat(
      `[${userName}]: ${cleanText}`,
      conversationMessages,
      { mode: "reactive", useOpus }
    );

    if (response && response.trim() !== "[TICHO]") {
      await say(response);
      await saveMessage({
        user_id: "sona",
        channel_id: channelId,
        role: "assistant",
        content: response,
      });
    }
  } catch (err) {
    console.error("[app_mention] Error:", err);
    await say("Ups, nieco sa pokazilo. Skus to znova za chvilu.");
  }
});

function shouldUseOpus(text: string): boolean {
  const opusTriggers = [
    "analyzuj",
    "analyze",
    "deep dive",
    "strategia",
    "strategy",
    "weekly review",
    "monthly review",
    "quarterly",
    "rozhodnutie",
    "decision",
    "vyhodnot",
    "evaluate",
    "porovnaj",
    "compare",
  ];
  const lower = text.toLowerCase();
  return opusTriggers.some((t) => lower.includes(t));
}

// ── Start ──

(async () => {
  await app.start();

  // Get bot user ID
  const auth = await app.client.auth.test();
  botUserId = auth.user_id || null;
  console.log(`[sona] Bot started as <@${botUserId}>`);

  // Start proactive scheduler
  startProactiveScheduler(app);

  console.log("[sona] Sona is online and ready!");
})();
