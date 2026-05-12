import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "./env";

let _client: Anthropic | null = null;

function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: getEnv().anthropicApiKey });
  return _client;
}

export async function askClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const msg = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Claude returned non-text block");
  return block.text;
}
