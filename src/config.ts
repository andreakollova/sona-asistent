function env(key: string, fallback?: string): string {
  const val = process.env[key] || fallback;
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

export const config = {
  slack: {
    botToken: env("SLACK_BOT_TOKEN"),
    appToken: env("SLACK_APP_TOKEN"),
    signingSecret: env("SLACK_SIGNING_SECRET"),
  },
  openaiApiKey: env("OPENAI_API_KEY"),
  supabase: {
    url: env("SUPABASE_URL"),
    key: env("SUPABASE_SERVICE_KEY"),
  },
  serperApiKey: process.env.SERPER_API_KEY || "",
  nataliaUserId: env("NATALIA_USER_ID"),
  timezone: "Europe/Bratislava",
};
