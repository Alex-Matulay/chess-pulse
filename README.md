# ♞ Chess Pulse

Hourly-updated chess news site, hosted on GitHub Pages.

**Live site:** https://alex-matulay.github.io/chess-pulse/

## How it works

- A static site (plain HTML/CSS/JS) renders headlines from [`data/news.json`](data/news.json).
- [`scripts/fetch-news.js`](scripts/fetch-news.js) (dependency-free Node) pulls RSS/Atom feeds from:
  - Chess.com news
  - Lichess blog
  - ChessBase
  - FIDE
  - The Week in Chess
- A [GitHub Actions workflow](.github/workflows/update-news.yml) runs **every hour, on the hour (UTC)**, refreshes the news data, commits it (only when something changed), and redeploys the site to GitHub Pages. It can also be triggered manually from the Actions tab.
- The "Top players" leaderboard is fetched live from the public Lichess API on every page visit.
- The daily puzzle is embedded via Lichess's official puzzle frame, so it rolls over automatically each day.
- The 2026 event calendar is rendered from [`data/events.json`](data/events.json) — edit that file to add or correct events; ongoing/upcoming/past status is computed client-side.

## Run locally

```sh
node scripts/fetch-news.js   # refresh data/news.json
# then serve the folder with any static server, e.g.:
npx serve .
```

## Adding a feed

Add an entry to the `FEEDS` array in `scripts/fetch-news.js`. Both RSS (`<item>`) and Atom (`<entry>`) feeds are supported. Feeds that fail are skipped gracefully.
