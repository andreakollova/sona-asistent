import { config } from "./config";

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

export async function webSearch(query: string, num = 5): Promise<SearchResult[]> {
  if (config.serperApiKey) {
    return serperSearch(query, num);
  }
  return duckDuckGoSearch(query, num);
}

async function serperSearch(query: string, num: number): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": config.serperApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res.ok) throw new Error(`Serper error: ${res.status}`);
  const data: any = await res.json();
  return (data.organic || []).map((r: any) => ({
    title: r.title,
    snippet: r.snippet,
    link: r.link,
  }));
}

async function duckDuckGoSearch(query: string, num: number): Promise<SearchResult[]> {
  // DuckDuckGo lite/html fallback (no API key needed)
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SonaBot/1.0)" },
  });
  if (!res.ok) return [];
  const html = await res.text();

  const results: SearchResult[] = [];
  const linkRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>(.+?)<\/a>/g;
  const snippetRegex = /<a class="result__snippet"[^>]*>(.+?)<\/a>/gs;

  const links = [...html.matchAll(linkRegex)];
  const snippets = [...html.matchAll(snippetRegex)];

  for (let i = 0; i < Math.min(links.length, num); i++) {
    results.push({
      link: links[i][1],
      title: links[i][2].replace(/<[^>]+>/g, ""),
      snippet: snippets[i]?.[1]?.replace(/<[^>]+>/g, "") || "",
    });
  }
  return results;
}
