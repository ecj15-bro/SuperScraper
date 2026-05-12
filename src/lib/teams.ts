import { getEnv } from "./env";

export async function sendTeamsMessage(text: string): Promise<void> {
  const url = getEnv().teamsWebhookUrl;
  if (!url) return;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
