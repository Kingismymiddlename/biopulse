# BioPulse v3 PRD: Signal-based account intelligence for life sciences sellers

23 Nov 2026 · Living version: https://claude.ai/artifact/Cb6aRcZ9RipLSE37anWCVw

## Summary

BioPulse v3 tells a life sciences services seller which of their accounts to contact this week, why now, and what to say, with every claim linked to a public source.

**The problem.** Sellers at data, AI and IT services firms that sell to pharma and biotech own 15 to 50 named accounts each. The moments that open a door (a new approval, a rejection, an acquisition, a financing, a leadership change, a surge in new trials) are scattered across FDA, ClinicalTrials.gov, trade press and deal news. Today the seller finds them by hand, late, and writes generic outreach.

**The bet.** Free public data, read per account and scored for what it means to a services buyer, is enough to prioritise outreach well. The value is not in the data, which anyone can read; it is in turning a trigger into a ranked account, a reason and a first message, every week, without the seller searching.

**What v3 ships.**

1. A private workspace (no passwords) holding the seller's accounts, firm profile and pipeline stage per account.
2. A signal engine that reads trade news, openFDA and ClinicalTrials.gov per account, classifies 14 signal types and scores each account 0 to 100 with a visible breakdown.
3. A This week home screen: accounts ranked by score, what changed since the last visit, and one-click outreach drafts grounded in the signal.
4. Account pages with a 90-day signal timeline, the live trial portfolio, FDA history and a sourced pre-call brief.
5. A weekly email digest of what changed on the seller's accounts.
6. The v2 market dashboard and 2027 event planner, kept as supporting context.

v2's dashboard becomes the Market tab. The product's centre of gravity moves from "what is happening in life sciences" to "what should I do about my accounts".

## Context and evidence

v2 fixed a broken site but kept a dashboard that answers no seller's question. It reads well and drives no action.

**Where v2 stands (23 Nov 2026).** v1 on GitHub Pages showed placeholder news and prices because its free CORS proxy had failed, its AI model (`llama-3.3-70b-versatile`) had been retired by Groq on 16 Aug 2026, and its map tiles needed a key. v2 added a Netlify backend that holds the Groq key and reads 8 RSS feeds, ClinicalTrials.gov, openFDA and quotes, with 38 unit tests and 63 browser checks. A live run returned 85 headlines, 65,228 recruiting trials across 40 countries, 17 novel FDA approvals in 60 days and 12 quotes.

**Product audit of v2, judged against the seller's job.**

| Panel | Seller value | Finding |
| --- | --- | --- |
| Account brief | High | Strongest feature, hidden in a side tab and run one company at a time |
| FDA approvals | Medium | Relevant trigger, not linked to the seller's accounts |
| Deal radar | Medium | Relevant, but the live run found 1 valued deal in 7 days: usually near-empty |
| Event planner | Medium | Useful a few times a year, not weekly |
| Daily brief | Low | Summarises the whole market; generic for any one seller |
| Pipeline heat | Low | A single 7-day count with no prior week, so it shows no change |
| Markets | Low | A share-price move is a weak trigger for a services sale |
| World map | Low | The hero panel, but no seller acts on a global trial count |

**Why the dashboard framing fails.**

- It is organised by data source, not by the seller's decision.
- Nothing brings the seller back: no alerts, no digest, no "what changed".
- The watchlist only filters headlines by text; there is no account view.
- State lives in one browser, so nothing follows the seller between laptop and phone.
- There is no measure of whether it helped anyone sell.

## Users and jobs to be done

The primary user is a proactive seller at a life sciences data, AI or IT services firm. Every design decision is judged by whether it gets that person to a well-timed, specific first conversation faster.

**Primary persona: the proactive seller.**

- Role: account executive, business development manager, or presales and pipeline-generation analyst (for example a team that qualifies opportunities before handing them to a sales team).
- Book: 15 to 50 named pharma, biotech or CRO accounts, often split by territory or practice.
- Goal: create qualified opportunities each month, measured by their own team.
- Current workflow: Google each account, skim trade newsletters, check ClinicalTrials.gov or press releases when a meeting is booked, keep notes in a spreadsheet, write outreach from scratch.
- Pain: triggers are found late or not at all; prep for one account takes 30 to 60 minutes of searching (assumption, to validate with users); outreach reads generic because the reason to reach out is weak.

**Secondary personas.**

| Persona | What they need from BioPulse | v3 support |
| --- | --- | --- |
| Sales or practice leader | See which accounts are heating up and where the team is in each | Ranked list, stage per account, CSV export |
| Field marketing | Decide which conferences to fund and what to say there | Event planner with fit scoring |
| Portfolio viewer (recruiter, hiring manager, prospect) | Understand the product in two minutes without setup | One-click demo workspace |

**Jobs to be done.**

1. When I plan my week, I want to see which of my accounts had a meaningful event, so I spend outreach time where timing is best.
2. When I reach out, I want a specific, sourced reason and a draft message, so my first touch is relevant, not generic.
3. Before a first meeting, I want a grounded brief on the account's pipeline, regulatory position and news, so I ask sharp questions.
4. When my accounts are quiet, I want to see strong signals elsewhere in the market, so I can add new accounts worth pursuing.
5. When I report to my manager, I want to show which accounts moved stage and why, so my pipeline story is backed by evidence.
6. When choosing events, I want to know which are worth budget for what my firm sells.

**What the seller does not want.** Another dashboard to check daily, contact scraping, or AI text they cannot trace to a source.

## Competitive landscape and positioning

BioPulse wins by being the only tool built for a services seller's account list: free sources, read per account, scored for what the event means to a services buyer, ending in a draft message. It does not compete on data depth.

| Alternative | What it is (per its own pages) | Built for | Gap for a services seller |
| --- | --- | --- | --- |
| [Citeline Pharmaprojects+](https://citeline.com/products/pharmaprojects/) (Norstella) | Expert-curated global pipeline data with analytics and an AI assistant | [Pipeline strategists, BD&L and competitive intelligence teams](https://www.citeline.com/en/resources/citeline-launches-pharmaprojects-plus) | Enterprise licence; answers asset questions, not "which account do I call" |
| [AlphaSense](https://www.alpha-sense.com/resources/product-articles/competitive-pipeline-intelligence-life-sciences) | AI market intelligence with real-time alerts on companies, assets and regulators | Life sciences strategy and CI teams | Paid research platform; alerts are not ranked by sales relevance or tied to outreach |
| [ZoomInfo Intent](https://www.zoominfo.com/offers/buyer-intent-data-platform) | Cross-industry buying-signal and intent data with lead scoring and CRM routing | B2B sales and marketing teams | Generic signals; does not read FDA, trial registries or pharma deal flow |
| [BioPharmCatalyst](https://www.biopharmcatalyst.com/) | FDA and PDUFA calendars plus a biotech company screener | Biotech investors and traders | Investor lens: price catalysts, not buying triggers |
| Trade newsletters (STAT, BioPharma Dive, Endpoints) | Daily editorial news | Everyone in the industry | Unfiltered; the seller still maps each story to an account by hand |

**Positioning statement.** For sellers at life sciences services firms who need to time outreach to real events, BioPulse is a free account-signal tool that ranks your accounts by public triggers and drafts a sourced first message. Unlike pipeline databases and intent platforms, it reads the sources that matter in pharma and judges them by what they mean for a services buyer.

**Where BioPulse will not compete.**

- Curated asset-level pipeline depth, forecasts or sales data.
- Contact data or people tracking.
- Paywalled content (earnings transcripts, broker research).
- CRM replacement.

The defensible part is the seller workflow and the scoring judgement, not the data. That is why the scoring model is explicit, editable over time and tuned by user feedback.

## Goals, non-goals and success metrics

The north star is **signal-sourced pipeline**: accounts a seller moved from Monitoring to Contacted or beyond within 14 days of a BioPulse signal. It is measured inside the product, because every account carries a stage and every stage change is timestamped.

**Goals for v3.**

1. A seller can go from "new workspace" to a ranked account list in under 3 minutes.
2. Every account score can be explained in one click, signal by signal, with source links.
3. A seller gets a weekly email without opening the app.
4. Outreach drafts are specific to one signal and one account, and cite it.
5. Nothing shown is invented: every number traces to a source or is labelled as AI or a heuristic.

**Non-goals for v3.**

- Contact or people data, LinkedIn scraping, or sending messages on the seller's behalf.
- CRM integration beyond CSV export.
- Team accounts, roles or shared workspaces.
- Paid data sources.
- Native mobile apps (the web app must work well on a phone).

**Metrics.**

| Metric | Type | Definition | Target, first 8 weeks after launch |
| --- | --- | --- | --- |
| Signal-sourced pipeline | North star | Stage moves out of Monitoring within 14 days of a signal on that account | 8 per active workspace per month |
| Weekly active workspaces | Input | Workspaces opened or emailed and clicked at least once in a week | Owner's workspace active 8 of 8 weeks |
| Outreach drafts | Input | Drafts generated per active workspace per week | 5 |
| Time to first ranked list | Input | Seconds from workspace creation to first scored list | Under 180 |
| Signal precision | Guardrail | Share of signals marked useful by users (thumbs up vs down) | 70% or higher |
| Source availability | Guardrail | Share of scheduled source fetches that succeed | 95% or higher |
| AI spend | Guardrail | Groq calls per day | Under the 800 daily cap |
| Load time | Guardrail | p95 time to first meaningful paint on desktop | Under 3 s |

Targets are starting assumptions for a single-owner launch and should be reset after 4 weeks of real data. BioPulse stores no analytics beyond workspace activity and stage history, so these metrics are computed from workspace data only.

## Product principles

Five rules settle design arguments. When two features compete, the one that better serves these wins.

1. **Account first.** Every screen answers a question about the seller's accounts. Market-wide views exist only to feed new accounts in.
2. **Actionable over interesting.** A panel earns its place by changing what the seller does this week. A striking chart that changes nothing goes in the Market tab or goes away.
3. **Cite everything.** Every signal links to its source. Every AI sentence that makes a claim points to the signal or headline it came from. Model background knowledge is labelled as possibly outdated.
4. **Honest by default.** No placeholder data, ever. When a source is down, the panel says so and shows the last good copy with its age. Scores are heuristics, and the product says so next to the score.
5. **Respect the seller's time and data.** No passwords, no tracking pixels, no contact scraping. The weekly digest has a one-click unsubscribe. The workspace can be exported or deleted at any time.

## Scope and requirements

v3 ships 15 features: 11 at P0 (launch blockers) and 4 at P1 (built in v3, can slip without blocking launch). P2 items are listed at the end and are out of scope.

| ID | Feature | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- | --- |
| F1 | Private workspace | P0 | Create a workspace with no password; its 22-character random ID in the URL (`#w=`) is the key. Stores profile, accounts, stages, digest settings, feedback | Same link opens the same accounts on another device; unknown or malformed IDs are refused; payload capped at 64 KB; creation limited to 5 per IP per hour |
| F2 | Onboarding | P0 | Three steps on first visit: what you sell, add accounts, optional digest email | A new user reaches a scored list in under 180 s; every step can be skipped; "Try the demo" is offered on step 1 |
| F3 | Account management | P0 | Add one account, paste a list (one per line), or add a starter pack. Each account has a display name, optional registry name and aliases, and a stage | Max 50 accounts; duplicates rejected case-insensitively; stage options Monitoring, Contacted, Meeting, Opportunity, Not a fit; stage changes timestamped |
| F4 | Signal engine | P0 | Per account, collect signals from the news feed (14 days), openFDA (90 days) and ClinicalTrials.gov (30 days); classify into the taxonomy in Signal taxonomy and scoring model | Each signal has type, date, title, source name and URL; registry data cached 12 h; 10 accounts score in under 8 s cold |
| F5 | Scoring and breakdown | P0 | Score 0 to 100 per account from weighted, time-decayed signals; band Hot, Warm or Cool | Clicking a score shows every contributing signal and its points; the label "heuristic score" is visible |
| F6 | This week home | P0 | Accounts ranked by score, top two signals each, "new since last visit" badges, filter by signal type, upcoming events in the next 60 days | Last-visit time stored in the workspace; empty state guides the user to add accounts; works at 390 px width |
| F7 | Account page | P0 | 90-day signal timeline, score breakdown, trial portfolio, FDA history, matching headlines, stage control, AI brief | Registry data visible even if AI fails; every timeline item links to its source |
| F8 | Outreach drafts | P0 | From a chosen signal: email subject and body (under 120 words), LinkedIn note (under 300 characters), call opener | Draft names the signal and links it; copy buttons; generated server-side from fixed templates; uses the firm profile |
| F9 | Weekly email digest | P0 | Monday 07:00 IST email listing accounts with new signals since the last digest, top signal each, links into the app | Sent through Resend; "Send test now" in Settings; one-click unsubscribe; no tracking pixels; skipped when nothing changed |
| F10 | Market tab | P0 | v2 dashboard: trials map, pipeline heat, FDA approvals, deal radar, news feed, quotes | All v2 browser checks still pass |
| F11 | Event planner | P0 | 12 verified 2027 conferences with AI fit scoring against the profile | Unchanged from v2; fits stored per workspace profile |
| F12 | Export and delete | P0 | CSV of accounts with score, stage and top signal; JSON of the whole workspace; delete workspace | Delete removes the server copy and the local copy; export works offline from the last load |
| F13 | Signal feedback | P1 | Thumbs up or down on any signal | Counts stored per signal type in the workspace and shown in Settings as precision per type |
| F14 | Market signals | P1 | High-weight signals from the feed and FDA approvals for companies not on the list, with "Add account" | FDA approvals prefill the sponsor name; news items open the add form |
| F15 | Demo workspace | P1 | Read-only workspace with 12 large pharma accounts, scored live | Opens with one click; edits prompt the user to create their own workspace |

**P2, out of scope for v3.** CRM sync (Salesforce, HubSpot), team workspaces, Microsoft Teams digest, share-price move signals, job-posting signals, conference exhibitor lists, week-over-week trend snapshots for pipeline heat.

## Signal taxonomy and scoring model

An account's score is the time-decayed, diminishing sum of its signal weights, mapped to 0 to 100. The weights below are product judgement about what opens a door for a services seller. They are initial heuristics, shown to the user as such, and are to be recalibrated from signal feedback after launch.

| Signal type | Source | Detection rule | Base weight | Why it matters to a services buyer |
| --- | --- | --- | --- | --- |
| Leadership change | News | Appoints, names, hires or taps a C-suite or head-of role; or an executive steps down or departs | 9 | New leaders reset priorities and revisit vendors |
| Acquisition (buyer) | News | M&A headline with the account before the deal verb | 9 | Integration of data, systems and commercial teams |
| FDA approval | openFDA original approval, or news approval | Original NDA or BLA approved in 90 days; or approval headline | 8 | Launch readiness: commercial analytics, safety scale-up |
| Financing | News | Raise, Series round, IPO, offering | 8 | New budget to build data and clinical capability |
| FDA rejection | News | Complete response letter, rejection, refusal to file | 7 | Remediation, data integrity, resubmission |
| AI or digital initiative | News | AI, machine learning, generative AI in the headline | 7 | Shows appetite and budget for data and AI work |
| Pivotal readout | News | Phase 3 or pivotal in the headline | 6 | Submission readiness, clinical data scale-up |
| New Phase 3 trials | ClinicalTrials.gov | More Phase 3 trials first posted in 30 days (as lead sponsor) than the account's own monthly average over the prior 90 days | 6, +1 per trial above average, max 9 | Large studies need data management and operations capacity |
| Restructuring | News | Layoffs, job cuts, restructuring | 6 | Cost pressure favours managed services and automation; can also freeze spend |
| Safety action | News | Recall, warning letter, clinical hold, boxed warning | 6 | Quality-system and pharmacovigilance remediation |
| Acquisition (target) | News | M&A headline with the account after the deal verb | 5 | Systems will be consolidated; spend may pause |
| Partnership | News | Licensing, collaboration, partnership | 5 | Data sharing and alliance operations |
| Trial surge | ClinicalTrials.gov | Five or more trials first posted in 30 days as lead sponsor, and at least 1.5 times the account's own monthly average | 5 | Rising clinical operations load |
| Phase 2 readout | News | Phase 2 in the headline | 4 | Programme decisions coming; earlier stage |
| General mention | News | Account named, no other type | 1 | Context only |

**Matching.** An account matches a headline when its display name, registry name or an alias appears as a whole word in the title (confidence 1.0) or only in the summary (confidence 0.6, counted as a general mention). Acquisition buyer or target is decided by which side of the deal verb the name falls. A financing counts only when the account leads the headline, because the raiser is the subject. Multi-story roundups (newsletter digests) count as general mentions. A short name is also derived by dropping corporate suffixes ("Capricor Therapeutics" matches "Capricor"), matched case-sensitively and only when it is one word of five or more letters. These rules and the sponsor baselines were added after the first live test on 23 Nov 2026, which scored a partner headline as the partner's financing, tagged every company in a roundup, and rated every large sponsor Warm on routine trial registrations.

**Score.** Each signal contributes its weight times its confidence, halved every 14 days of age, and halved again for each earlier signal of the same type on the account:

```latex
S = \sum_{i} w_i \, c_i \, 0.5^{a_i / 14} \, 0.5^{r_i}, \qquad \text{score} = \operatorname{round}\big(100\,(1 - e^{-S/15})\big)
```

Here w is the base weight, c the match confidence, a the age in days and r the number of stronger signals of the same type already counted. One fresh approval (S = 8) scores 41; an approval plus a leadership change in the same week (S = 17) scores 68.

**Bands.** Hot 60 to 100, Warm 30 to 59, Cool 1 to 29, Quiet 0.

**Explainability.** The breakdown lists each signal with its points (its contribution to S), so the seller sees exactly why an account ranks where it does.

## User experience

Five tabs, with This week as home. The seller should be able to act from the first screen without visiting any other.

| Tab | Purpose | Key elements |
| --- | --- | --- |
| This week (home) | Decide who to contact | Summary line ("6 of 24 accounts have new signals since Mon 16 Nov"), ranked account cards (score, band, top two signals, new badge, Draft outreach, stage), signal-type filter, market signals, upcoming events |
| Accounts | Manage the book | Table: name, stage, score, signals in 30 days, last signal date, actions; add one, paste a list, starter packs; CSV export |
| Market | Context and prospecting | v2 dashboard: trials map, pipeline heat, FDA approvals, deal radar, intel feed, quotes |
| Events | Plan the year | 2027 conference cards, fit verdicts, drawer with audience, angles and who to meet |
| Settings | Configure | Firm profile, workspace link, digest email and test send, signal precision, tickers, backend URL, export, delete |

**Account page** (opens as a panel over any tab, with its own URL so it can be shared to oneself): header with score, band and stage; score breakdown; 90-day signal timeline with thumbs up or down; outreach composer; trial portfolio; FDA history; headlines; AI brief.

**Primary flows.**

1. **First visit.** Onboarding step 1 (firm profile, or Try the demo), step 2 (add accounts: starter pack, paste list or one by one), step 3 (digest email, skippable). Workspace created, link shown with a copy button, This week loads and scores accounts in batches of 10.
2. **Monday.** Digest email lists changed accounts; each links to `#/week?w=<id>&a=<account>`, which opens that account page. The seller reads the signal, opens the composer, copies the email, and sets the stage to Contacted.
3. **Before a meeting.** Accounts tab, open account, generate brief, download Markdown.
4. **Prospecting.** Market signals on This week shows an FDA approval for a sponsor not on the list; Add account prefills the sponsor; the account is scored at once.

**Empty, loading and error states.**

- No accounts: This week shows the three ways to add accounts, not an empty table.
- Scoring: cards show skeletons and fill as each batch of 10 returns.
- An account with no signals: shown as Quiet with "Nothing in the last 30 days. Registry data is still on the account page."
- A source down: the account card says which source failed; the score uses what loaded and is flagged partial.
- AI not configured or over limit: a plain message saying what the owner must do; registry data and signals still show.
- Workspace link invalid: "This workspace doesn't exist or was deleted" with a button to start a new one.

Accounts with only general mentions fold into one collapsed "no triggers this week" group below the ranked cards, so This week leads with what the seller can act on.

## Data sources and data model

All data comes from public sources fetched server-side, cached, and stored as a last good copy. The only personal data stored is an optional digest email address.

| Source | Used for | Refresh / cache | Limit to respect |
| --- | --- | --- | --- |
| 8 RSS feeds: FDA press releases, STAT, BioPharma Dive, PharmaVoice, GEN, Pharmaceutical Technology, Drug Discovery & Development, Labiotech.eu | News signals, market feed, deal radar | 10 min CDN, 9 min store | Honest user agent; feeds that block server readers are dropped, never disguised |
| ClinicalTrials.gov API v2 | Sponsor portfolios, new-trial signals, map, pipeline heat | 12 h per account, 6 h aggregates | Concurrency 8 to 10 per request |
| openFDA Drugs@FDA | Approval signals, FDA history, approvals panel | 12 h per account, 3 h panel | 1,000 calls per day per IP without a key; `OPENFDA_API_KEY` raises it |
| Yahoo Finance, Stooq fallback | Market tab quotes | 5 min | Delayed, context only |
| Groq (`openai/gpt-oss-120b`) | Briefs, outreach drafts, event fit | Answer cache 30 min to 7 days by task | 40 calls per IP per hour, 800 per day site-wide |
| Resend | Weekly digest email | Weekly | Sender domain must be verified for external recipients |

**Entities.**

| Entity | Key fields | Stored in |
| --- | --- | --- |
| Workspace | id, createdAt, updatedAt, lastSeenAt, profile (firm, offering, focus), tickers, digest (email, enabled, token, lastSentAt), feedback counts | Netlify Blobs `biopulse-workspaces`, key = id |
| Account | id (slug), name, registryName, aliases, stage, stageHistory \[stage, at\], addedAt | Inside the workspace |
| Signal | id (hash of type + url or title), accountId, type, date, title, source, url, weight, confidence, points | Computed; cached per account in `biopulse-cache` |
| Digest snapshot | workspace id, signal ids sent | Inside the workspace (last 200 ids) |
| Event fit | event id, profile hash, verdict, score, reasons | Browser storage (per profile) |

**Retention.** Workspaces are kept until deleted by the user. A workspace untouched for 12 months is eligible for deletion (P2 clean-up job). Caches expire on their TTL. Server logs keep no request bodies.

## Architecture and technical design

v3 extends v2's static front end plus Netlify Functions. It adds three seller APIs, one scheduled function and a workspace store, with no new framework and no build step.

_Architecture diagram: see the living version linked above._

The browser talks only to Netlify. Keys for Groq, Resend and openFDA live in Netlify environment variables. The highlighted parts are new in v3.

**New endpoints.**

| Endpoint | Method | Purpose | Guards |
| --- | --- | --- | --- |
| `/api/workspace` | POST | Create a workspace from onboarding data; returns its ID | 5 per IP per hour; 64 KB cap; schema validation |
| `/api/workspace?id=` | GET, PUT, DELETE | Read, save (last write wins, with `updatedAt` check), delete | ID must be 22 base64url characters; unknown ID gives 404 |
| `/api/signals` | POST | Score up to 10 accounts per call: news matches, openFDA 90 days, ClinicalTrials.gov 30 days | 10 accounts per call; per-account registry cache 12 h |
| `/api/ai` (task `outreach`) | POST | Outreach email, LinkedIn note and call opener from one signal | Existing origin allow-list, rate limits, answer cache |
| `/api/digest` | POST | Send a test digest for a workspace now | 3 per workspace per hour; needs `RESEND_API_KEY` |
| `/api/unsubscribe?id=&t=` | GET | Turn the digest off with the token from the email | Token compared in constant time |
| `digest-weekly` | Scheduled | For each workspace with the digest on, score accounts, send new signals, store sent IDs | Runs hourly from 01:30 to 06:30 UTC on Mondays; each run sends only to workspaces not yet sent that week, so a run that hits the 30 s limit is finished by the next |

**Front end.** Native ES modules under `assets/js/` (router, API client, store, one module per view). Hash routes: `#/week`, `#/accounts`, `#/market`, `#/events`, `#/settings`, plus `&a=<account>` for the account panel. The workspace ID travels in the hash so it is never sent to servers in logs or `Referer` headers.

**AI usage.** Groq `openai/gpt-oss-120b` with low reasoning effort and JSON output; `openai/gpt-oss-20b` as fallback. Prompts are fixed server-side templates; the browser sends only task inputs. Every claim must cite a signal or headline index, and the server drops citations that point nowhere.

**Security.** Content Security Policy limits scripts to the site itself. All untrusted text is escaped before rendering. Links are restricted to http and https. The AI endpoint accepts allow-listed origins only. Workspace IDs are 128-bit random values: unguessable, but anyone holding the link can open the workspace, and the app says so.

**Cost.** Netlify free tier (functions, Blobs, scheduled functions), Groq free or pay-as-you-go tier within the 800 calls per day cap, Resend free tier for a single sender. Expected cost for one owner: zero, assuming usage stays within the free tiers.

## Non-functional requirements

The product must stay fast, honest under failure, and safe with the one secret it holds: the workspace link.

| Area | Requirement |
| --- | --- |
| Performance | p95 first meaningful paint under 3 s on desktop; This week shows cached scores instantly and refreshes in the background; 10 accounts score in under 8 s cold, under 1 s warm |
| Reliability | Every source has a last good copy; a source failure degrades one signal family, never the whole page; the digest retries a failed send once and logs the result |
| Accessibility | WCAG 2.1 AA intent: labelled inputs, keyboard-operable tabs and dialogs, visible focus, 4.5:1 text contrast, 34 px touch targets on touch screens, respects reduced motion |
| Responsiveness | Usable at 390 px, 1024 px and 1600 px widths with no horizontal scroll |
| Privacy | No analytics, cookies or tracking pixels; the only personal data is an optional digest email; workspace export and delete at any time; the ID never appears in a query string |
| Security | Strict Content Security Policy; output escaping everywhere; origin allow-list on AI and workspace writes; rate limits on creation, AI and test sends; secrets only in Netlify environment variables |
| Compliance | Digest emails carry a one-click unsubscribe; sources are cited; feeds that block server readers are not scraped; quotes labelled delayed and not investment advice |
| Observability | Functions log source failures and AI errors without request bodies; `/api/health` reports AI and email configuration; Settings shows source status and signal precision |
| Testing | Unit tests for every function and the scoring model; browser checks for every view at three widths; a live smoke test against real sources |

## Risks, assumptions and open questions

The biggest risk is thin signal: free feeds may not name a given account often enough to rank it meaningfully. Registry signals (trials, FDA) are the hedge because they exist for every sponsor.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Few news mentions per account; many accounts score Quiet | High | High | Registry signals for every sponsor; aliases and registry names per account; market signals to find active accounts |
| Wrong matches (a name inside another word, a namesake company) | Medium | Medium | Whole-word matching, aliases, summary matches down-weighted to 0.6, thumbs-down feedback |
| Wrong type (a headline that mentions approval in passing) | Medium | Medium | Rule order puts rejections before approvals; feedback per type; precision shown in Settings |
| A feed changes URL or starts blocking servers | Medium | Low | Per-feed status, last good copy, easy swap in one file |
| openFDA daily limit without a key | Medium | Medium | 12 h per-account cache; owner adds `OPENFDA_API_KEY` |
| Workspace link shared or leaked | Low | Medium | Clear warning in the UI; delete and recreate; no personal data beyond an email |
| Digest lands in spam or fails to send to others | Medium | Medium | Verified sender domain in Resend; plain-text alternative; no tracking pixels |
| Scheduled function times out with many workspaces | Low now | Medium | Process in turn, record progress, resume next run; move to a background function past 20 workspaces |
| AI drafts overstate a signal | Medium | Medium | Draft must quote the signal; server drops uncited claims; user edits before sending |

**Assumptions to validate.**

- Sellers prefer a weekly digest to a daily one.
- Weights in the scoring table rank accounts in an order sellers agree with (test: owner reviews the top 10 weekly for 4 weeks).
- Prep time saved per account is meaningful (target 30 minutes, to be measured).

**Open questions.**

- Sender address for the digest: a verified domain the owner controls, or Resend's test sender (delivers only to the Resend account owner)?
- Should the demo workspace be the GitHub Pages default view for portfolio visitors?

## Release plan, test plan and launch checklist

Build happens now, in this session. Each later phase starts only when the gate before it is met.

_Release roadmap diagram: see the living version linked above._

Phase 2 needs the owner's keys and accounts; the build cannot complete it alone. Status on 23 Nov 2026: phase 1 is complete. 59 unit tests, 74 browser checks and the live smoke test pass, and the code is on branch product-v3, waiting for the GitHub app so it can be pushed.

**Test plan.**

1. Unit tests (Node test runner, network mocked): workspace validation and storage, signal matching and classification, acquirer vs target, scoring maths against the worked examples, digest selection and unsubscribe tokens, every endpoint's guards.
2. Browser checks (Playwright, API mocked): onboarding to first ranked list, account page, outreach composer, stage changes, settings, export, delete, demo mode, XSS payloads in headlines and AI output, failure states, 390 px, 1024 px and 1600 px layouts, keyboard tabs, labelled inputs.
3. Live smoke test (real sources): score 6 large pharma accounts, confirm signals from at least two source families, and send one digest when `RESEND_API_KEY` is set.
4. Owner acceptance: create a workspace with real accounts, review the top 10, send a test digest, draft one outreach.

**Launch checklist.**

- [ ] All unit tests and browser checks pass
- [ ] Code pushed to GitHub and the PR merged
- [ ] Netlify site live with `GROQ_API_KEY`, `RESEND_API_KEY`, `DIGEST_FROM` and `OPENFDA_API_KEY` set
- [ ] `/api/health` shows AI and email configured
- [ ] Live smoke test passes against production
- [ ] Owner workspace created and a test digest received
- [ ] README and PRD copy in the repo updated

## Owner actions

Seven steps, about 30 minutes, in this order. Steps 1 to 4 are needed for launch; 5 and 6 can follow.

- [ ] **1. Connect GitHub.** Install the Claude GitHub app at https://github.com/apps/claude/installations/select\_target for the `Kingismymiddlename` account with access to the `biopulse` repo. Tell Claude when done; Claude pushes the `product-v3` branch and opens a pull request. Merge it into `main`.
- [ ] **2. Create the Netlify site.** app.netlify.com → Add new site → Import an existing project → GitHub → `biopulse`, branch `main`. Leave the build command empty and the publish directory as `.`. Deploy, then rename the site (Site configuration → Change site name).
- [ ] **3. Add the Groq key.** Netlify → Site configuration → Environment variables → add `GROQ_API_KEY` with your new `gsk_...` key, scope Functions.
- [ ] **4. Set up the digest email.** Create a free account at resend.com → API Keys → create a key with sending access. In Netlify add `RESEND_API_KEY` with that key. For email to yourself only, no domain is needed: Resend's test sender delivers to the address you signed up with. To send to other addresses, verify a domain you own in Resend (Domains → Add, then add its DNS records) and set `DIGEST_FROM` to `BioPulse <digest@yourdomain.com>`.
- [ ] **5. Raise the openFDA limit.** Request a free key at https://open.fda.gov/apis/authentication/ and add it as `OPENFDA_API_KEY`.
- [ ] **6. Point GitHub Pages at the backend.** In `assets/config.js` set `apiBase` to your Netlify URL and commit. The `kingismymiddlename.github.io` origin is already allowed.
- [ ] **7. Redeploy and hand back.** Netlify → Deploys → Trigger deploy. Open `https://<your-site>.netlify.app/api/health` and check that AI and email both show configured. Send Claude the site URL; Claude runs the live smoke test against production and reports.

Never paste a key into a file in the repo or into chat. Each key goes only into Netlify's environment variables.

## Sources

Competitor descriptions checked on 23 Nov 2026:

- [Citeline Pharmaprojects](https://citeline.com/products/pharmaprojects/) and [Pharmaprojects+ launch](https://www.citeline.com/en/resources/citeline-launches-pharmaprojects-plus)
- [AlphaSense: competitive pipeline intelligence in life sciences](https://www.alpha-sense.com/resources/product-articles/competitive-pipeline-intelligence-life-sciences)
- [ZoomInfo buyer intent data platform](https://www.zoominfo.com/offers/buyer-intent-data-platform)
- [BioPharmCatalyst](https://www.biopharmcatalyst.com/)

v2 figures come from the live smoke test run on 23 Nov 2026 against ClinicalTrials.gov, openFDA, the 8 RSS feeds and Yahoo Finance.
