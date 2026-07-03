import cron from "node-cron";
import { chat } from "./llm";
import { config } from "./config";
import { getState } from "./db";
import type { App } from "@slack/bolt";

const PROJECT_CHANNELS: Record<string, string> = {
  woeva: "woeva-general",
  fondre: "fondre-general",
  szph: "szph-general",
  drixton: "drixton-general",
};

export function startProactiveScheduler(app: App) {
  // Morning briefing — 9:00 Bratislava (7:00 UTC in summer)
  cron.schedule(
    "0 9 * * *",
    () => runProactive(app, "morning"),
    { timezone: config.timezone }
  );

  // Midday check — 13:00 Bratislava
  cron.schedule(
    "0 13 * * *",
    () => runProactive(app, "midday"),
    { timezone: config.timezone }
  );

  // Evening wrap — 18:00 Bratislava
  cron.schedule(
    "0 18 * * *",
    () => runProactive(app, "evening"),
    { timezone: config.timezone }
  );

  console.log("[proactive] Scheduler started: 9:00, 13:00, 18:00 Europe/Bratislava");
}

async function runProactive(app: App, slot: "morning" | "midday" | "evening") {
  // Check mute
  const mute = await getState("mute");
  if (mute?.active) {
    console.log(`[proactive] Muted, skipping ${slot}`);
    return;
  }

  const prompts: Record<string, string> = {
    morning: `Slot: morning. Sprav ranny briefing.
1. Pouzij query_tasks pre kazdy projekt (woeva, fondre, szph, drixton) a zisti otvorene tasky.
2. Pouzij web_search pre "UI UX design trends news today" a "Figma updates news" — vyber 1-2 zaujimave veci.
3. Priprav celkovy briefing pre #today a kratke per-project zhrnutia.
4. Ak je piatok, pripomen Weekly Review. Ak je koniec mesiaca, pripomen Monthly Review.
Odpoved formatuj ako JSON: {"today": "...", "projects": {"woeva": "...", "fondre": "...", "szph": "...", "drixton": "..."}}
Ak nemas co povedat pre projekt, vynechaj ho z projects. Ak nemas co povedat vobec, vrat [TICHO].`,

    midday: `Slot: midday. Check-in.
1. Pouzij query_tasks pre ulohy s dnesnym terminom alebo po termine.
2. Pouzij web_search pre "digital marketing trends news today" — vyber 1 zaujimavu vec ak stoji za to.
3. Ozvi sa LEN ak je dovod (horaci termin, zaujimava novinka). Inak vrat [TICHO].
Odpoved formatuj ako JSON: {"today": "..."} alebo [TICHO].`,

    evening: `Slot: evening. Vecerny wrap-up.
1. Pouzij query_tasks(status=done) pre dnes dokoncene tasky a query_tasks(status=open) pre otvorene.
2. Pouzij web_search pre "Formula 1 F1 news Hamilton today" — vyber 1-2 zaujimave veci.
3. Priprav kratke zhrnutie dna + F1 novinky. Ak bol dobry den (vela dokoncenych taskov), priprav aj win spravu.
Odpoved formatuj ako JSON: {"today": "...", "wins": "..." alebo null, "f1": "..."} alebo [TICHO].`,
  };

  try {
    const response = await chat(prompts[slot], [], {
      mode: "proactive",
      slot,
    });

    if (response.trim() === "[TICHO]") {
      console.log(`[proactive] ${slot}: silence`);
      return;
    }

    // Try to parse structured response
    let parsed: any;
    try {
      // Extract JSON from response (might be wrapped in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      // If not JSON, just post the raw response to #today
      parsed = null;
    }

    if (parsed) {
      // Post overall briefing to #today
      if (parsed.today) {
        await postToChannel(app, "today", parsed.today);
      }

      // Post per-project briefings to their general channels
      if (parsed.projects) {
        for (const [project, message] of Object.entries(parsed.projects)) {
          const channel = PROJECT_CHANNELS[project];
          if (channel && message) {
            await postToChannel(app, channel, message as string);
          }
        }
      }

      // Post wins
      if (parsed.wins) {
        await postToChannel(app, "wins", parsed.wins);
      }
    } else {
      // Fallback: post raw response to #today
      await postToChannel(app, "today", response);
    }

    console.log(`[proactive] ${slot}: posted`);
  } catch (err) {
    console.error(`[proactive] ${slot} error:`, err);
  }
}

async function postToChannel(app: App, channelName: string, text: string) {
  try {
    // Find channel by name
    const result = await app.client.conversations.list({ types: "public_channel,private_channel", limit: 200 });
    const channel = result.channels?.find((c) => c.name === channelName);
    if (!channel?.id) {
      console.warn(`[proactive] Channel #${channelName} not found`);
      return;
    }
    await app.client.chat.postMessage({ channel: channel.id, text });
  } catch (err) {
    console.error(`[proactive] Failed to post to #${channelName}:`, err);
  }
}
