// Signal engine: match news to accounts, classify signals, add registry signals,
// and score accounts. The weights are product heuristics documented in the PRD.
import { createHash } from 'node:crypto';
import { sponsorNewTrials, sponsorApprovals } from './sources.mjs';
import { classify } from './news.mjs';

export const TYPES = {
  leadership: { label: 'Leadership change', weight: 9, family: 'org', why: 'New leaders reset priorities and revisit vendors.' },
  acquirer: { label: 'Acquisition (buyer)', weight: 9, family: 'deals', why: 'Integration of data, systems and commercial teams.' },
  fda_approval: { label: 'FDA approval', weight: 8, family: 'regulatory', why: 'Launch readiness: commercial analytics and safety scale-up.' },
  financing: { label: 'Financing', weight: 8, family: 'deals', why: 'New budget to build data and clinical capability.' },
  fda_rejection: { label: 'FDA rejection', weight: 7, family: 'regulatory', why: 'Remediation, data integrity and resubmission work.' },
  ai_initiative: { label: 'AI or digital initiative', weight: 7, family: 'ai', why: 'Shows appetite and budget for data and AI work.' },
  pivotal: { label: 'Pivotal readout', weight: 6, family: 'clinical', why: 'Submission readiness and clinical data scale-up.' },
  new_phase3: { label: 'New Phase 3 trials', weight: 6, family: 'clinical', why: 'Large studies need data management and operations capacity.' },
  restructuring: { label: 'Restructuring', weight: 6, family: 'org', why: 'Cost pressure favours managed services and automation; spend can also freeze.' },
  safety: { label: 'Safety action', weight: 6, family: 'regulatory', why: 'Quality-system and pharmacovigilance remediation.' },
  acquired: { label: 'Acquisition (target)', weight: 5, family: 'deals', why: 'Systems will be consolidated; spend may pause.' },
  partnership: { label: 'Partnership', weight: 5, family: 'deals', why: 'Data sharing and alliance operations.' },
  trial_surge: { label: 'Trial surge', weight: 5, family: 'clinical', why: 'Rising clinical operations load.' },
  phase2: { label: 'Phase 2 readout', weight: 4, family: 'clinical', why: 'Programme decisions coming; earlier stage.' },
  mention: { label: 'In the news', weight: 1, family: 'news', why: 'Context only.' },
};

const HALF_LIFE_DAYS = 14;
const SCALE = 15;

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words that identify an account in text, longest first. */
export function accountTerms(acct) {
  const terms = [acct.name, acct.registryName, ...(acct.aliases || [])]
    .filter(Boolean)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return [...new Set(terms)].sort((a, b) => b.length - a.length);
}

function termRegex(terms) {
  if (!terms.length) return null;
  return new RegExp('(^|[^A-Za-z0-9])(' + terms.map(reEsc).join('|') + ')(?=$|[^A-Za-z0-9])', 'i');
}

const SUFFIX = /\s+(therapeutics|pharmaceuticals?|pharma|biosciences?|biotherapeutics|biotech|biologics|bio|biopharma|holdings|group|corporation|corp|inc|ltd|plc|ag|sa|se|nv|a\/s|llc|co|company)\.?$/i;

/** Short name derived from the display name ("Capricor Therapeutics" -> "Capricor"). */
export function shortName(name) {
  let n = String(name || '').trim();
  for (let i = 0; i < 3 && SUFFIX.test(n); i++) n = n.replace(SUFFIX, '').trim();
  return n !== name && /^[A-Z][A-Za-z0-9-]{4,}$/.test(n) ? n : null;
}

/** Find where an account is named in text, honouring exclusions. Returns index or -1. */
export function findAccount(text, acct) {
  if (!text) return -1;
  let t = text;
  for (const ex of acct.exclude || []) {
    if (ex) t = t.replace(new RegExp(reEsc(ex), 'gi'), (m) => ' '.repeat(m.length));
  }
  const m = termRegex(accountTerms(acct))?.exec(t);
  if (m) return m.index + m[1].length;
  // Derived short name: proper noun, so match case-sensitively.
  const sn = shortName(acct.name);
  if (sn) {
    const m2 = new RegExp('(^|[^A-Za-z0-9])(' + reEsc(sn) + ')(?=$|[^A-Za-z0-9])').exec(t);
    if (m2) return m2.index + m2[1].length;
  }
  return -1;
}

const LEADER_IN = /\b(appoints?|appointed|names?|named|hires?|hired|taps?|tapped|promotes?|promoted|welcomes?)\b[^.]{0,80}\b(CEO|CFO|COO|CIO|CTO|CDO|CMO|CCO|CSO|chief|president|head of|chair(man|woman)?)\b/i;
const LEADER_OUT = /\b(CEO|CFO|CIO|CTO|CDO|CMO|chief [a-z ]{0,30}officer|president|chair(man|woman)?)\b[^.]{0,60}\b(steps? down|to step down|resigns?|resigned|retires?|to retire|departs?|departing|exits?|ousted|to leave|leaves)\b/i;
const NEW_CEO = /\bnew (CEO|chief executive|CFO|CIO|CDO|CTO|chief [a-z]+ officer)\b/i;
const MA_VERB = /\b(to acquire|acquires|acquired|acquiring|acquisition of|to buy|buys|bought|snaps up|takeover of|buyout of|to merge with|merges with|merger with|eyes|eyeing|eyed|bids? for|offer for|in talks (to buy|to acquire|for)|weighs (a )?(bid|deal|offer)|pursues|pursuing)\b/i;
const ROUNDUP = /\b(pharmalittle|roundup|round-up|briefing|newsletter|week in review|what we're reading|we\u2019re reading|we're reading|stockwatch|the readout|chart of the week|top stories|news in brief)\b/i;
const PARTNER = /\b(partner(s|ed|ing|ship)?|collaborat(e|es|ion)|licens(e|es|ing)|join(s)? forces|team(s)? up|alliance|pact|co-develop)\b/i;
const FIN_VERB = /\b(raises?|raised|financing|series [a-f]\b|funding|IPO|public offering|seed round)\b/i;
const MA_PASSIVE = /\b(acquired by|to be acquired|sells (itself|to)|sold to|takeover (bid|offer|interest) (from|by))\b/i;

/** Classify a headline into a signal type for a given account (or null). */
export function classifySignal(title, acct, idx) {
  const tag = classify(title, 'news');
  if (tag === 'CRL') return 'fda_rejection';
  if (tag === 'SAFETY') return 'safety';
  if (LEADER_IN.test(title) || LEADER_OUT.test(title) || NEW_CEO.test(title)) return 'leadership';
  if (tag === 'M&A' || /\b(takeover|buyout)\b/i.test(title)) return acquisitionSide(title, acct, idx);
  if (tag === 'FINANCING') {
    // The raiser is the grammatical subject: the account must lead the headline.
    const fin = FIN_VERB.exec(title);
    if (idx >= 0 && idx <= 3 && (!fin || idx < fin.index)) return 'financing';
    return PARTNER.test(title) ? 'partnership' : 'mention';
  }
  if (tag === 'APPROVAL') return 'fda_approval';
  if (tag === 'PHASE 3') return 'pivotal';
  if (tag === 'LAYOFFS') return 'restructuring';
  if (tag === 'LICENSING' || PARTNER.test(title)) return 'partnership';
  if (tag === 'AI') return 'ai_initiative';
  if (tag === 'PHASE 2') return 'phase2';
  return 'mention';
}

export function acquisitionSide(title, acct, idx = findAccount(title, acct)) {
  const terms = accountTerms(acct);
  // "... by <account>" means the account is the buyer.
  const byRe = new RegExp('\\bby\\s+(the\\s+)?(' + terms.map(reEsc).join('|') + ')(?=$|[^A-Za-z0-9])', 'i');
  if (byRe.test(title)) return 'acquirer';
  // "<account> takeover" / "<account> buyout": the account is the target.
  const targetRe = new RegExp('(' + terms.map(reEsc).join('|') + ')(\u2019s|\'s)?\\s+(takeover|buyout|acquisition)\\b', 'i');
  if (targetRe.test(title)) return 'acquired';
  const passive = MA_PASSIVE.exec(title);
  if (passive) return idx >= 0 && idx < passive.index ? 'acquired' : 'acquirer';
  const verb = MA_VERB.exec(title);
  if (verb && idx >= 0) return idx < verb.index ? 'acquirer' : 'acquired';
  return 'acquired';
}

export function signalId(type, key) {
  return type + ':' + createHash('sha1').update(String(key)).digest('hex').slice(0, 12);
}

/** News signals for one account from the shared feed items. */
export function newsSignals(acct, items, now = Date.now()) {
  const out = [];
  const seen = new Set();
  const cutoff = now - 14 * 86400000;
  for (const it of items || []) {
    if (it.date && Date.parse(it.date) < cutoff) continue;
    const idx = findAccount(it.title, acct);
    let confidence = 1;
    let type;
    if (idx < 0) {
      // Named only in the summary: keep as context, never as a typed trigger.
      if (findAccount(it.summary, acct) < 0) continue;
      confidence = 0.6;
      type = 'mention';
    } else if (ROUNDUP.test(it.title) && !/^stockwatch/i.test(it.title)) {
      // Multi-story roundups name many companies; treat as context.
      confidence = 0.6;
      type = 'mention';
    } else {
      type = classifySignal(it.title, acct, idx);
    }
    const id = signalId(type, it.link || it.title);
    if (seen.has(it.link)) continue;
    seen.add(it.link);
    out.push({
      id,
      type,
      family: 'news',
      date: it.date || new Date(now).toISOString(),
      title: it.title,
      source: it.source,
      url: it.link,
      confidence,
    });
  }
  return out;
}

/** Registry signals (openFDA, ClinicalTrials.gov) from a cached registry snapshot. */
export function registrySignals(reg) {
  const out = [];
  for (const a of reg?.fda?.originals || []) {
    out.push({
      id: signalId('fda_approval', a.application + a.date),
      type: 'fda_approval',
      family: 'fda',
      date: a.date + 'T12:00:00.000Z',
      title: `FDA approved ${a.brand || a.application}${a.ingredient ? ` (${a.ingredient.toLowerCase()})` : ''}${a.type ? `, ${a.type.replace(/^Type \d+ - /, '').toLowerCase()}` : ''}`,
      source: 'openFDA',
      url: a.url,
      confidence: 1,
    });
  }
  const trials = reg?.trials?.trials || [];
  const base = reg?.trials?.baseline || {};
  const p3 = trials.filter((t) => t.phases.includes('PHASE3'));
  // Only Phase 3 activity above the sponsor's own monthly average counts as a signal.
  const p3Avg = base.phase3PerMonth ?? 0;
  if (p3.length && p3.length > p3Avg) {
    out.push({
      id: signalId('new_phase3', p3.map((t) => t.nct).join(',')),
      type: 'new_phase3',
      family: 'trials',
      date: (p3[0].posted || reg.trials.since) + 'T12:00:00.000Z',
      title: `${p3.length} new Phase 3 trial${p3.length > 1 ? 's' : ''} registered: ${p3[0].title}`,
      source: 'ClinicalTrials.gov',
      url: `https://clinicaltrials.gov/study/${p3[0].nct}`,
      confidence: 1,
      extraWeight: Math.min(3, Math.max(0, Math.round(p3.length - Math.max(1, p3Avg)))),
      context: p3Avg ? `Above its average of ${Math.round(p3Avg * 10) / 10} a month over the prior 90 days` : 'No Phase 3 registrations in the prior 90 days',
      items: p3.slice(0, 5).map(({ nct, title }) => ({ nct, title })),
    });
  }
  const total = reg?.trials?.total || 0;
  const avg = base.perMonth ?? 0;
  if (total >= 5 && total >= 1.5 * avg) {
    out.push({
      id: signalId('trial_surge', `${reg.trials.since}:${total}`),
      type: 'trial_surge',
      family: 'trials',
      date: (trials[0]?.posted || reg.trials.since) + 'T12:00:00.000Z',
      title: `${total} new trials registered as lead sponsor since ${reg.trials.since}${avg ? `, vs about ${Math.round(avg)} a month before` : ''}`,
      source: 'ClinicalTrials.gov',
      url: trials[0] ? `https://clinicaltrials.gov/study/${trials[0].nct}` : 'https://clinicaltrials.gov/',
      confidence: 1,
      items: trials.slice(0, 5).map(({ nct, title }) => ({ nct, title })),
    });
  }
  return out;
}

/** Score signals per the PRD formula. Mutates nothing; returns scored copies. */
export function scoreSignals(signals, now = Date.now()) {
  const withRaw = signals.map((s) => {
    const t = TYPES[s.type] || TYPES.mention;
    const weight = t.weight + (s.extraWeight || 0);
    const age = Math.max(0, (now - Date.parse(s.date)) / 86400000);
    const raw = weight * (s.confidence ?? 1) * Math.pow(0.5, age / HALF_LIFE_DAYS);
    return { ...s, label: t.label, why: t.why, weight, ageDays: Math.round(age * 10) / 10, raw };
  });
  withRaw.sort((a, b) => b.raw - a.raw);
  const seenType = {};
  let S = 0;
  const scored = withRaw.map((s) => {
    const r = seenType[s.type] || 0;
    seenType[s.type] = r + 1;
    const points = s.raw * Math.pow(0.5, r);
    S += points;
    const { raw, ...rest } = s;
    return { ...rest, points: Math.round(points * 10) / 10 };
  });
  const score = Math.round(100 * (1 - Math.exp(-S / SCALE)));
  scored.sort((a, b) => b.points - a.points);
  return { score, band: band(score), S: Math.round(S * 10) / 10, signals: scored };
}

export function band(score) {
  if (score >= 60) return 'Hot';
  if (score >= 30) return 'Warm';
  if (score >= 1) return 'Cool';
  return 'Quiet';
}

/** Registry snapshot for an account: new trials (30 d) and FDA originals (90 d). */
export async function fetchRegistry(acct, now = new Date()) {
  const sponsor = acct.registryName || acct.name;
  const [trials, fda] = await Promise.allSettled([sponsorNewTrials(sponsor, 30, now), sponsorApprovals(sponsor, now, 90)]);
  if (trials.status === 'rejected' && fda.status === 'rejected') throw new Error('Registries unavailable');
  return {
    sponsor,
    trials: trials.status === 'fulfilled' ? trials.value : null,
    fda: fda.status === 'fulfilled' ? fda.value : null,
    errors: [trials.status === 'rejected' ? 'ClinicalTrials.gov' : null, fda.status === 'rejected' ? 'openFDA' : null].filter(Boolean),
  };
}

/** Full scoring for one account. */
export function buildAccountResult(acct, newsItems, reg, now = Date.now()) {
  const sigs = [...newsSignals(acct, newsItems, now), ...registrySignals(reg)];
  const res = scoreSignals(sigs, now);
  return {
    id: acct.id,
    name: acct.name,
    ...res,
    sources: {
      news: Array.isArray(newsItems),
      trials: Boolean(reg?.trials),
      fda: Boolean(reg?.fda),
    },
    partial: !Array.isArray(newsItems) || !reg?.trials || !reg?.fda,
  };
}
