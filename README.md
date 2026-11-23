# BioPulse

**Live life sciences market intelligence.** One screen that shows where clinical development is moving, what the FDA just approved, which deals were announced, and what the trade press is saying. It also writes sourced AI briefs on the day's news and on any pharma or biotech account.

Live: https://kingismymiddlename.github.io/biopulse/ (front end) · backend on Netlify

![BioPulse dashboard](docs/screenshot.png)

## What it does

| Panel | What you see | Source |
|---|---|---|
| Recruiting trials map | Recruiting trials in 40 countries, shaded on a log scale | ClinicalTrials.gov API v2 |
| Pipeline heat | New trials posted in the last 7 days and recruiting trials, by therapy area | ClinicalTrials.gov API v2 |
| FDA approvals | Novel NDA/BLA approvals in the last 60 days, with priority review flag and a link to Drugs@FDA | openFDA |
| Intel feed | 8 trade and regulator feeds, de-duplicated, tagged (approval, CRL, M&A, financing, Phase 3, policy…), searchable, filterable | FDA, STAT, BioPharma Dive, PharmaVoice, GEN, Pharmaceutical Technology, Drug Discovery & Development, Labiotech.eu |
| Deal signals and deal radar | Headlines from the last 7 days with a disclosed deal value, ranked by size | Parsed from the feed |
| Biotech markets | XBI, IBB, Nasdaq Biotech Index and a configurable ticker list (delayed) | Yahoo Finance, with Stooq as fallback |
| Daily brief (AI) | Lead story, 3 themes, watchlist notes and 2 opportunities for your firm. Every point cites the headline it came from | Groq, run on the server |
| Account brief (AI) | Lead-sponsor trial portfolio, phase mix, top conditions, FDA approvals over 24 months, matching headlines, then a pre-call brief with discovery questions and a pitch angle. Exports to Markdown | ClinicalTrials.gov, openFDA, feed, Groq |
| Event planner | 12 major 2027 life sciences conferences with checked dates, plus an AI go/watch/skip fit score against your firm profile | Curated list in `data/conferences.json`, Groq |

Every panel shows its source, when it was last updated, and whether it is live, a saved copy, or unavailable. Nothing is invented: if a source is down, the panel says so.

## Architecture

```
Browser (index.html + assets/app.js, no build step)
   │  fetch /api/*
   ▼
Netlify Functions (netlify/functions/*.mjs)
   ├─ /api/news      8 RSS feeds → parse, tag, de-dupe, extract deals    CDN cache 10 min
   ├─ /api/trials    ClinicalTrials.gov counts by area / country          CDN cache 3 h
   ├─ /api/fda       openFDA recent novel approvals                       CDN cache 3 h
   ├─ /api/quotes    Yahoo Finance → Stooq fallback                       CDN cache 5 min
   ├─ /api/company   sponsor trial portfolio + FDA history                CDN cache 6 h
   ├─ /api/ai        Groq (server-side key, fixed prompt templates,
   │                 per-IP and daily limits, answer cache)
   └─ /api/health    is the AI key configured?
Netlify Blobs: last good copy of every source (served if an upstream goes down), rate-limit counters, AI answer cache.
```

Why a backend: the Groq key must never be in the page (anyone can read it). The backend also replaces the free CORS proxy the first version relied on, which was failing and was the reason the old site showed placeholder news and prices.

The AI endpoint only accepts three task types (`dailyBrief`, `prospect`, `eventFit`) and builds the prompts itself, so nobody can use your key as a free general-purpose LLM.

## Deploy (about 10 minutes)

### 1. Create the Netlify site
1. Log in at [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub** → pick `Kingismymiddlename/biopulse`.
2. Branch to deploy: `main`. Leave **Build command** empty and **Publish directory** as `.`. Netlify reads `netlify.toml` and picks up the functions automatically.
3. Click **Deploy**. Note the site URL, e.g. `https://biopulse-xyz.netlify.app` (you can rename it under **Site configuration → Change site name**).

### 2. Add your Groq key
1. Netlify → your site → **Site configuration → Environment variables → Add a variable**.
2. Key: `GROQ_API_KEY`, value: your new `gsk_...` key. Scope: Functions.
3. **Deploys → Trigger deploy → Deploy site** (environment variables apply on the next deploy).
4. Check: open `https://<your-site>.netlify.app/api/health`. It should show `"configured": true`.

Never paste the key into any file in this repo.

### 3. Point GitHub Pages at the backend (optional)
The Netlify URL is a complete site on its own. To keep `kingismymiddlename.github.io/biopulse` working as well, edit `assets/config.js`:

```js
window.BIOPULSE_CONFIG = { apiBase: 'https://<your-site>.netlify.app' };
```

Commit to `main`. The `kingismymiddlename.github.io` origin is already allowed. For any other domain, add it to the `ALLOWED_ORIGINS` environment variable (comma-separated).

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GROQ_API_KEY` | yes, for AI | none | Groq key, read only by the functions |
| `GROQ_MODEL` | no | `openai/gpt-oss-120b` | Primary model |
| `GROQ_FALLBACK_MODEL` | no | `openai/gpt-oss-20b` | Used if the primary model is unavailable |
| `AI_HOURLY_LIMIT_PER_IP` | no | `40` | AI calls per visitor IP per hour |
| `AI_DAILY_LIMIT` | no | `800` | AI calls per day for the whole site (protects your Groq quota) |
| `ALLOWED_ORIGINS` | no | GitHub Pages origin + this Netlify site | Extra origins allowed to call `/api/ai` |
| `OPENFDA_API_KEY` | no | none | Raises openFDA rate limits (free at open.fda.gov) |

Groq retired `llama-3.3-70b-versatile` (the model v1 used) on 16 Aug 2026. To change models later, set `GROQ_MODEL`; no code change needed.

## Run locally

```bash
npm install
GROQ_API_KEY=gsk_... node scripts/dev-server.mjs   # http://localhost:8888
```
`netlify dev` also works if you have the Netlify CLI.

## Tests

```bash
npm test                          # 38 unit tests: parsers, prompts, Groq client, every function (network mocked)
python3 tests/e2e/test_ui.py      # 63 browser checks: desktop, tablet, mobile, XSS, failure modes, GitHub Pages mode
node tests/live-smoke.mjs         # hits the real upstream APIs (add GROQ_API_KEY to include AI)
```

## Limits and honest caveats
- **Deal values** come from headlines, so only deals with a dollar figure in the headline or summary appear. "Up to" figures include milestones.
- **Therapy areas** are keyword searches on conditions, so a trial can count in more than one area.
- **Country counts** are recruiting trials with at least one site in that country. Multinational trials count in every country they recruit in.
- **openFDA** can lag FDA announcements by a few days.
- **Quotes** are delayed and for context only. Not investment advice.
- **AI text** is generated from the data shown and labelled as AI. Background facts in account briefs come from model knowledge and are flagged as possibly outdated.
- Fierce Pharma, Fierce Biotech and Endpoints block server-side feed readers, so they are not included.
- Conference dates in `data/conferences.json` were checked on 23 Nov 2026. Update the file each year.
