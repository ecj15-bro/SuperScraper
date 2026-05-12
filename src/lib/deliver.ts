import { getEnv } from "./env";
import { sendEmail } from "./email";
import { sendTeamsMessage } from "./teams";
import { getBrandConfig } from "./brand";

export interface DeliveryPayload {
  companyName: string;
  decisionMaker: string;
  title: string;
  linkedinUrl?: string;
  companyWebsite?: string;
  companyProfile: string;
  personProfile: string;
  pitch: string;
  newsTitle: string;
  newsSource: string;
}

export async function deliverReport(payload: DeliveryPayload): Promise<void> {
  const env = getEnv();
  const brand = await getBrandConfig();

  const subject = `[${brand.companyName}] New VAR Lead: ${payload.companyName}`;

  const html = `
<h2>${payload.companyName}</h2>
<p><strong>Decision Maker:</strong> ${payload.decisionMaker} — ${payload.title}</p>
${payload.linkedinUrl ? `<p><strong>LinkedIn:</strong> <a href="${payload.linkedinUrl}">${payload.linkedinUrl}</a></p>` : ""}
${payload.companyWebsite ? `<p><strong>Website:</strong> ${payload.companyWebsite}</p>` : ""}
<hr/>
<h3>Company Profile</h3><p>${payload.companyProfile}</p>
<h3>Person Profile</h3><p>${payload.personProfile}</p>
<h3>News Trigger</h3><p>${payload.newsTitle} — <a href="${payload.newsSource}">${payload.newsSource}</a></p>
<hr/>
<h3>Pitch</h3><pre style="white-space:pre-wrap">${payload.pitch}</pre>
`.trim();

  const text = [
    `${payload.companyName} — ${payload.decisionMaker} (${payload.title})`,
    payload.linkedinUrl ?? "",
    "",
    payload.companyProfile,
    "",
    "NEWS TRIGGER:",
    payload.newsTitle,
    "",
    "PITCH:",
    payload.pitch,
  ].join("\n");

  const promises: Promise<void>[] = [];

  if (env.enableEmailDelivery && env.reportToEmail) {
    promises.push(sendEmail({ to: env.reportToEmail, subject, html, text }));
  }

  if (env.teamsWebhookUrl) {
    promises.push(sendTeamsMessage(`**${subject}**\n\n${payload.pitch.slice(0, 500)}`));
  }

  if (env.slackWebhookUrl) {
    promises.push(
      fetch(env.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `*${subject}*\n${payload.pitch.slice(0, 500)}` }),
      }).then(() => void 0)
    );
  }

  await Promise.allSettled(promises);
}
