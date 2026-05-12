import { db } from "../db/client";
import { alerts } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getEnv } from "../env";

export async function dispatchPendingAlerts() {
  const pending = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.delivered, false)))
    .limit(100);

  let dispatched = 0;

  for (const alert of pending) {
    const channels: string[] = [];
    const payload = alert.payload as any;
    const message = [
      `[${alert.severity.toUpperCase()}] ${alert.type.replace(/_/g, " ")}`,
      payload?.companyName ? `Company: ${payload.companyName}` : "",
      payload?.amount ? `Amount: $${Number(payload.amount).toLocaleString()}` : "",
      payload?.agency ? `Agency: ${payload.agency}` : "",
      payload?.description ? `Description: ${payload.description}` : "",
    ].filter(Boolean).join("\n");

    const env = getEnv();

    if (env.slackWebhookUrl) {
      try {
        await fetch(env.slackWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message }),
        });
        channels.push("slack");
      } catch (e) {
        console.error("Slack alert failed", e);
      }
    }

    if (env.teamsWebhookUrl) {
      try {
        await fetch(env.teamsWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message }),
        });
        channels.push("teams");
      } catch (e) {
        console.error("Teams alert failed", e);
      }
    }

    await db.update(alerts).set({
      delivered: true,
      deliveredChannels: channels,
    }).where(eq(alerts.id, alert.id));

    dispatched++;
  }

  return { attempted: pending.length, dispatched };
}
