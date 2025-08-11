# GSMArena Scraper (Node + Playwright + Cheerio + Express + SQLite)

**Features**
- Scrape **brands** from GSMArena
- Explore **models by brand** (with pagination)
- Click **Insert** to scrape and save a model into SQLite
- **Bulk insert by brand** (all pages) with throttled scraping & live progress via SSE
- EJS views, simple styling, and a Saved list

> ⚠️ Scraping may violate a site's Terms of Service. Use responsibly: throttle, cache, identify your bot via a polite User-Agent, and keep traffic low.

## Setup
```bash
npm i
npm run prepare   # installs Chromium for Playwright
cp .env.example .env
```

## Run
```bash
npm run start
# open http://localhost:3000/brands
```

## Flow
- **/brands** → scrape brands from makers page
- Click **Explore** → show models for that brand (+ pagination)
- Click **Insert** on a model → scrape full details & save to SQLite
- **Bulk Insert All Pages** → scrapes & inserts *every* model for that brand (with progress)
- **/saved** shows everything in DB

## Environment
- `BASE_URL`: default `https://www.gsmarena.com`
- `DATABASE_FILE`: default `./phones.db`
- `SCRAPER_DELAY_MS`: delay between page navigations (ms)
- `SCRAPER_BULK_DELAY_MS`: additional delay between each phone insert (ms)

## Notes
- Be polite: respect ToS, rate-limit, and cache if you scale up.
- You can change DB path in `.env` (`DATABASE_FILE`).
- For production, consider adding an in-memory queue and persistence for bulk job state.
