import { config } from "./config";

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

export async function webSearch(query: string, num = 5): Promise<SearchResult[]> {
  // Try Serper first (if key exists), then Brave, then Google scrape
  if (config.serperApiKey) {
    try {
      return await serperSearch(query, num);
    } catch (e) {
      console.error("[search] Serper failed:", e);
    }
  }

  // Brave Search API (free, no key needed for basic)
  try {
    return await braveSearch(query, num);
  } catch (e) {
    console.error("[search] Brave failed:", e);
  }

  // Google scrape fallback
  try {
    return await googleScrape(query, num);
  } catch (e) {
    console.error("[search] Google scrape failed:", e);
  }

  return [];
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

async function braveSearch(query: string, num: number): Promise<SearchResult[]> {
  const url = `https://search.brave.com/api/suggest?q=${encodeURIComponent(query)}`;
  // Use Brave's web search page and parse results
  const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
  const res = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Brave error: ${res.status}`);
  const html = await res.text();

  const results: SearchResult[] = [];

  // Parse Brave search results
  const titleRegex = /<a[^>]*class="[^"]*heading-serpresult[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/g;
  const snippetRegex = /<p class="snippet-description"[^>]*>([\s\S]*?)<\/p>/g;

  const titles = [...html.matchAll(titleRegex)];
  const snippets = [...html.matchAll(snippetRegex)];

  for (let i = 0; i < Math.min(titles.length, num); i++) {
    results.push({
      link: titles[i][1],
      title: titles[i][2].replace(/<[^>]+>/g, "").trim(),
      snippet: snippets[i]?.[1]?.replace(/<[^>]+>/g, "").trim() || "",
    });
  }

  if (results.length > 0) return results;

  // Fallback: try simpler regex patterns
  const altRegex = /<a[^>]*href="(https?:\/\/(?!search\.brave)[^"]+)"[^>]*>[\s]*<span[^>]*class="title"[^>]*>([\s\S]*?)<\/span>/g;
  const altMatches = [...html.matchAll(altRegex)];
  for (let i = 0; i < Math.min(altMatches.length, num); i++) {
    results.push({
      link: altMatches[i][1],
      title: altMatches[i][2].replace(/<[^>]+>/g, "").trim(),
      snippet: "",
    });
  }

  if (results.length > 0) return results;
  throw new Error("No results parsed from Brave");
}

async function googleScrape(query: string, num: number): Promise<SearchResult[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&hl=en`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Google error: ${res.status}`);
  const html = await res.text();

  const results: SearchResult[] = [];
  // Match Google result blocks: <a href="/url?q=..."><h3>title</h3></a>
  const regex = /<a[^>]*href="\/url\?q=([^&"]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g;
  const matches = [...html.matchAll(regex)];

  for (let i = 0; i < Math.min(matches.length, num); i++) {
    results.push({
      link: decodeURIComponent(matches[i][1]),
      title: matches[i][2].replace(/<[^>]+>/g, "").trim(),
      snippet: "",
    });
  }

  if (results.length === 0) throw new Error("No results from Google scrape");
  return results;
}
