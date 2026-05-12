import { getEnv } from "./env";

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  source?: string;
  date?: string;
}

function tbsParam(maxAgeDays: number): string | undefined {
  if (maxAgeDays <= 1)   return "qdr:d";
  if (maxAgeDays <= 7)   return "qdr:w";
  if (maxAgeDays <= 30)  return "qdr:m";
  if (maxAgeDays <= 365) return "qdr:y";
  return undefined;
}

export async function searchNews(query: string, num = 10, maxAgeDays = 30): Promise<SearchResult[]> {
  const body: Record<string, unknown> = { q: query, num };
  const tbs = tbsParam(maxAgeDays);
  if (tbs) body.tbs = tbs;

  const res = await fetch("https://google.serper.dev/news", {
    method: "POST",
    headers: { "X-API-KEY": getEnv().serperApiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Serper news error: ${res.status}`);
  const data = await res.json();

  const cutoffMs = Date.now() - maxAgeDays * 86_400_000;

  return (data.news ?? [])
    .map((r: any): SearchResult => ({
      title:   r.title,
      link:    r.link,
      snippet: r.snippet,
      source:  r.source,
      date:    r.date ?? undefined,
    }))
    .filter((r: SearchResult) => {
      if (!r.date) return true;
      const t = new Date(r.date).getTime();
      return isNaN(t) || t >= cutoffMs;
    });
}

export async function searchWeb(query: string, num = 10): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": getEnv().serperApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res.ok) throw new Error(`Serper error: ${res.status}`);
  const data = await res.json();

  return (data.organic ?? []).map((r: any): SearchResult => ({
    title:   r.title,
    link:    r.link,
    snippet: r.snippet,
    source:  r.displayLink,
  }));
}
