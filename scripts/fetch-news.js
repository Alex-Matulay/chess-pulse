#!/usr/bin/env node
/**
 * Fetches chess news from several RSS/Atom feeds and writes data/news.json.
 * No dependencies — uses global fetch (Node 18+) and a small regex-based
 * XML item extractor that handles both RSS <item> and Atom <entry> formats.
 */

const fs = require("fs");
const path = require("path");

const FEEDS = [
  { source: "Chess.com", url: "https://www.chess.com/rss/news" },
  { source: "Lichess", url: "https://lichess.org/blog.atom" },
  { source: "ChessBase", url: "https://en.chessbase.com/feed" },
  { source: "FIDE", url: "https://fide.com/feed" },
  { source: "The Week in Chess", url: "https://theweekinchess.com/twic-rss-feed" },
  { source: "r/chess", url: "https://www.reddit.com/r/chess/top/.rss?t=day" },
];

const MAX_ITEMS = 80;
const MAX_AGE_DAYS = 45;
const FETCH_TIMEOUT_MS = 20000;

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function stripHtml(str) {
  return decodeEntities(decodeEntities(str))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : "";
}

function atomLink(block) {
  // Prefer rel="alternate", fall back to first <link href="...">
  const links = [...block.matchAll(/<link\b([^>]*)\/?>(?:<\/link>)?/gi)];
  let fallback = "";
  for (const [, attrs] of links) {
    const href = (attrs.match(/href="([^"]+)"/i) || [])[1] || "";
    if (!href) continue;
    if (!fallback) fallback = href;
    if (/rel="alternate"/i.test(attrs) || !/rel=/i.test(attrs)) return href;
  }
  return fallback;
}

function parseFeed(xml, source) {
  const blocks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ||
    xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ||
    [];
  const items = [];
  for (const block of blocks) {
    const title = stripHtml(tag(block, "title"));
    let link = decodeEntities(tag(block, "link")) || atomLink(block);
    link = link.trim();
    const dateRaw =
      tag(block, "pubDate") ||
      tag(block, "published") ||
      tag(block, "updated") ||
      tag(block, "dc:date");
    const summaryRaw =
      tag(block, "description") ||
      tag(block, "summary") ||
      tag(block, "content") ||
      tag(block, "media:description");
    const date = new Date(dateRaw);
    if (!title || !link || isNaN(date)) continue;
    let summary = stripHtml(summaryRaw)
      .replace(/\bsubmitted by\s+\/u\/\S+.*$/i, "")
      .replace(/\[link\]|\[comments\]/gi, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (summary.length > 260) summary = summary.slice(0, 257).trimEnd() + "…";
    items.push({ title, link, source, date: date.toISOString(), summary });
  }
  return items;
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "chess-pulse-news-bot/1.0 (+https://github.com/Alex-Matulay/chess-pulse)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseFeed(xml, feed.source);
  if (items.length === 0) throw new Error("no items parsed");
  return items;
}

async function main() {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const all = [];
  const sources = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`OK   ${FEEDS[i].source}: ${r.value.length} items`);
      all.push(...r.value);
      sources.push(FEEDS[i].source);
    } else {
      console.warn(`FAIL ${FEEDS[i].source}: ${r.reason.message}`);
    }
  });

  if (all.length === 0) {
    console.error("All feeds failed — keeping existing news.json");
    process.exit(1);
  }

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 3600 * 1000;
  const seen = new Set();
  const items = all
    .filter((it) => new Date(it.date).getTime() >= cutoff)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .filter((it) => {
      const key = it.title.toLowerCase().replace(/\W+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ITEMS);

  const out = {
    updated: new Date().toISOString(),
    sources,
    items,
  };

  const outPath = path.join(__dirname, "..", "data", "news.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${items.length} items from ${sources.length} feeds to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
