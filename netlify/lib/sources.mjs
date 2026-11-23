// ClinicalTrials.gov v2, openFDA and market-quote clients.
import { fetchJSON, fetchWithTimeout, mapLimit } from './http.mjs';

const CTG = 'https://clinicaltrials.gov/api/v2/studies';

export const AREAS = [
  { id: 'onc', name: 'Oncology', cond: 'cancer OR neoplasm OR tumor OR oncology OR lymphoma OR leukemia' },
  { id: 'cns', name: 'Neuroscience', cond: "alzheimer OR parkinson OR multiple sclerosis OR epilepsy OR ALS OR neurodegenerative" },
  { id: 'cardio', name: 'Cardiovascular', cond: 'heart failure OR cardiovascular OR atrial fibrillation OR hypertension OR cardiomyopathy' },
  { id: 'metab', name: 'Metabolic', cond: 'obesity OR type 2 diabetes OR MASH OR NASH OR metabolic syndrome' },
  { id: 'immuno', name: 'Immunology', cond: 'rheumatoid arthritis OR lupus OR psoriasis OR crohn OR ulcerative colitis OR atopic dermatitis' },
  { id: 'infect', name: 'Infectious Disease', cond: 'HIV OR hepatitis OR tuberculosis OR influenza OR RSV OR COVID-19 OR bacterial infection' },
  { id: 'rare', name: 'Rare / Genetic', cond: 'muscular dystrophy OR cystic fibrosis OR hemophilia OR sickle cell OR spinal muscular atrophy OR lysosomal' },
  { id: 'psych', name: 'Psychiatry', cond: 'depression OR schizophrenia OR bipolar OR anxiety OR PTSD' },
];

// ISO 3166-1 numeric codes match the world-atlas TopoJSON ids used by the map.
export const COUNTRIES = [
  ['840', 'United States', 'United States'], ['156', 'China', 'China'], ['250', 'France', 'France'],
  ['276', 'Germany', 'Germany'], ['724', 'Spain', 'Spain'], ['380', 'Italy', 'Italy'],
  ['826', 'United Kingdom', 'United Kingdom'], ['124', 'Canada', 'Canada'], ['392', 'Japan', 'Japan'],
  ['410', 'South Korea', 'Korea'], ['036', 'Australia', 'Australia'], ['056', 'Belgium', 'Belgium'],
  ['528', 'Netherlands', 'Netherlands'], ['616', 'Poland', 'Poland'], ['076', 'Brazil', 'Brazil'],
  ['356', 'India', 'India'], ['376', 'Israel', 'Israel'], ['792', 'Türkiye', 'Turkey'],
  ['818', 'Egypt', 'Egypt'], ['158', 'Taiwan', 'Taiwan'], ['756', 'Switzerland', 'Switzerland'],
  ['208', 'Denmark', 'Denmark'], ['752', 'Sweden', 'Sweden'], ['040', 'Austria', 'Austria'],
  ['484', 'Mexico', 'Mexico'], ['032', 'Argentina', 'Argentina'], ['203', 'Czechia', 'Czechia'],
  ['348', 'Hungary', 'Hungary'], ['300', 'Greece', 'Greece'], ['643', 'Russia', 'Russia'],
  ['710', 'South Africa', 'South Africa'], ['586', 'Pakistan', 'Pakistan'], ['364', 'Iran', 'Iran'],
  ['578', 'Norway', 'Norway'], ['246', 'Finland', 'Finland'], ['620', 'Portugal', 'Portugal'],
  ['372', 'Ireland', 'Ireland'], ['764', 'Thailand', 'Thailand'], ['704', 'Vietnam', 'Vietnam'],
  ['682', 'Saudi Arabia', 'Saudi Arabia'],
].map(([id, name, q]) => ({ id, name, q }));

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

export async function ctgCount(params) {
  const qs = new URLSearchParams({ ...params, countTotal: 'true', pageSize: '1', fields: 'NCTId' });
  const d = await fetchJSON(`${CTG}?${qs}`, { timeoutMs: 7000 });
  if (typeof d.totalCount !== 'number') throw new Error('No totalCount from ClinicalTrials.gov');
  return d.totalCount;
}

export async function trialAreas(now = new Date()) {
  const since = isoDay(new Date(now.getTime() - 7 * 86400000));
  const jobs = AREAS.flatMap((a) => [
    { a, kind: 'recruiting', params: { 'query.cond': a.cond, 'filter.overallStatus': 'RECRUITING' } },
    { a, kind: 'new7d', params: { 'query.cond': a.cond, 'filter.advanced': `AREA[StudyFirstPostDate]RANGE[${since},MAX]` } },
  ]);
  jobs.push({ a: null, kind: 'total', params: { 'filter.overallStatus': 'RECRUITING' } });
  jobs.push({ a: null, kind: 'totalNew7d', params: { 'filter.advanced': `AREA[StudyFirstPostDate]RANGE[${since},MAX]` } });
  const res = await mapLimit(jobs, 8, (j) => ctgCount(j.params));
  const areas = AREAS.map((a) => ({ id: a.id, name: a.name, recruiting: null, new7d: null }));
  let total = null;
  let totalNew7d = null;
  jobs.forEach((j, i) => {
    const v = typeof res[i] === 'number' ? res[i] : null;
    if (j.kind === 'total') total = v;
    else if (j.kind === 'totalNew7d') totalNew7d = v;
    else areas.find((x) => x.id === j.a.id)[j.kind] = v;
  });
  const okCount = res.filter((r) => typeof r === 'number').length;
  if (okCount === 0) throw new Error('ClinicalTrials.gov unavailable');
  return { since, total, totalNew7d, areas, partial: okCount < jobs.length };
}

export async function trialCountries() {
  const res = await mapLimit(COUNTRIES, 10, (c) =>
    ctgCount({ 'query.locn': c.q, 'filter.overallStatus': 'RECRUITING' }),
  );
  const countries = COUNTRIES.map((c, i) => ({
    id: c.id,
    name: c.name,
    recruiting: typeof res[i] === 'number' ? res[i] : null,
  }));
  const okCount = countries.filter((c) => c.recruiting !== null).length;
  if (okCount === 0) throw new Error('ClinicalTrials.gov unavailable');
  return { countries, partial: okCount < COUNTRIES.length };
}

/** Lead-sponsor trial portfolio for a company. */
export async function sponsorTrials(sponsor) {
  const qs = new URLSearchParams({
    'query.term': `AREA[LeadSponsorName]"${sponsor.replace(/"/g, '')}"`,
    'filter.overallStatus': 'RECRUITING,NOT_YET_RECRUITING,ACTIVE_NOT_RECRUITING',
    countTotal: 'true',
    pageSize: '100',
    fields: 'NCTId,BriefTitle,Phase,Condition,OverallStatus,LastUpdatePostDate,LeadSponsorName,StartDate',
    sort: 'LastUpdatePostDate:desc',
  });
  const d = await fetchJSON(`${CTG}?${qs}`, { timeoutMs: 8000 });
  const studies = (d.studies || []).map((s) => {
    const p = s.protocolSection || {};
    return {
      nct: p.identificationModule?.nctId,
      title: p.identificationModule?.briefTitle,
      phases: p.designModule?.phases || [],
      conditions: p.conditionsModule?.conditions || [],
      status: p.statusModule?.overallStatus,
      updated: p.statusModule?.lastUpdatePostDateStruct?.date,
      sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name,
    };
  });
  const phases = {};
  const conds = {};
  for (const s of studies) {
    for (const ph of s.phases.length ? s.phases : ['NA']) phases[ph] = (phases[ph] || 0) + 1;
    for (const c of s.conditions.slice(0, 3)) {
      const k = c.trim();
      conds[k] = (conds[k] || 0) + 1;
    }
  }
  const topConditions = Object.entries(conds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, n]) => ({ name, n }));
  return {
    activeTotal: d.totalCount ?? studies.length,
    sampled: studies.length,
    phases,
    topConditions,
    sponsorNames: [...new Set(studies.map((s) => s.sponsor).filter(Boolean))].slice(0, 5),
    recent: studies.slice(0, 6).map(({ nct, title, phases, status, updated }) => ({ nct, title, phases, status, updated })),
  };
}

/** Trials first posted in the last `days` with this lead sponsor. */
export async function sponsorNewTrials(sponsor, days = 30, now = new Date()) {
  const since = isoDay(new Date(now.getTime() - days * 86400000));
  const qs = new URLSearchParams({
    'query.term': `AREA[LeadSponsorName]"${sponsor.replace(/"/g, '')}"`,
    'filter.advanced': `AREA[StudyFirstPostDate]RANGE[${since},MAX]`,
    countTotal: 'true',
    pageSize: '50',
    fields: 'NCTId,BriefTitle,Phase,StudyFirstPostDate,LeadSponsorName',
    sort: 'StudyFirstPostDate:desc',
  });
  // Baseline: the sponsor's own registrations in the 90 days before the window,
  // so routine activity at big sponsors is not mistaken for a surge.
  const baseFrom = isoDay(new Date(now.getTime() - (days + 90) * 86400000));
  const baseTo = isoDay(new Date(now.getTime() - (days + 1) * 86400000));
  const sponsorQ = `AREA[LeadSponsorName]"${sponsor.replace(/"/g, '')}"`;
  const range = `AREA[StudyFirstPostDate]RANGE[${baseFrom},${baseTo}]`;
  const [d, base, baseP3] = await Promise.all([
    fetchJSON(`${CTG}?${qs}`, { timeoutMs: 7000 }),
    ctgCount({ 'query.term': sponsorQ, 'filter.advanced': range }).catch(() => null),
    ctgCount({ 'query.term': `${sponsorQ} AND AREA[Phase]PHASE3`, 'filter.advanced': range }).catch(() => null),
  ]);
  const trials = (d.studies || []).map((s) => {
    const p = s.protocolSection || {};
    return {
      nct: p.identificationModule?.nctId,
      title: p.identificationModule?.briefTitle,
      phases: p.designModule?.phases || [],
      posted: p.statusModule?.studyFirstPostDateStruct?.date || null,
    };
  });
  return {
    since,
    total: d.totalCount ?? trials.length,
    trials,
    baseline: { from: baseFrom, to: baseTo, total: base, phase3: baseP3, perMonth: base == null ? null : base / 3, phase3PerMonth: baseP3 == null ? null : baseP3 / 3 },
  };
}

// ── openFDA ────────────────────────────────────────────────────────────────
const FDA = 'https://api.fda.gov/drug/drugsfda.json';

function fdaDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
function fdaToISO(s) {
  return s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}
function fdaKey() {
  return process.env.OPENFDA_API_KEY ? `&api_key=${encodeURIComponent(process.env.OPENFDA_API_KEY)}` : '';
}
export function dafUrl(appNo) {
  const digits = String(appNo).replace(/\D/g, '');
  return `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${digits}`;
}

function classLabel(app, cls) {
  if (cls === 'TYPE 1') return 'New molecular entity';
  if (cls === 'TYPE 2') return 'New active ingredient';
  if (app.startsWith('BLA')) return 'Biologic (BLA)';
  return null;
}

/** Recent original NDA/BLA approvals (novel drugs and biologics first). */
export async function recentApprovals(days = 60, now = new Date()) {
  const from = fdaDate(new Date(now.getTime() - days * 86400000));
  const to = fdaDate(now);
  const search =
    `submissions.submission_type:ORIG+AND+submissions.submission_status:AP` +
    `+AND+submissions.submission_status_date:[${from}+TO+${to}]` +
    `+AND+(application_number:NDA*+OR+application_number:BLA*)`;
  const d = await fetchJSON(`${FDA}?search=${search}&limit=100&sort=submissions.submission_status_date:desc${fdaKey()}`, {
    timeoutMs: 8000,
  });
  const rows = [];
  for (const r of d.results || []) {
    const s = (r.submissions || []).find(
      (x) => x.submission_type === 'ORIG' && x.submission_status === 'AP' && x.submission_status_date >= from,
    );
    if (!s) continue;
    const label = classLabel(r.application_number, s.submission_class_code);
    if (!label) continue;
    const prod = r.products?.[0] || {};
    rows.push({
      date: fdaToISO(s.submission_status_date),
      brand: prod.brand_name || null,
      ingredient: (prod.active_ingredients || []).map((a) => a.name).join(' + ') || null,
      sponsor: r.sponsor_name,
      application: r.application_number,
      type: label,
      priority: s.review_priority === 'PRIORITY',
      url: dafUrl(r.application_number),
    });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return { days, approvals: rows.slice(0, 25) };
}

const STOP = new Set(['INC', 'CO', 'CORP', 'LLC', 'LTD', 'AND', 'THE', 'PLC', 'AG', 'SA', 'AS', 'GROUP', 'PHARMA', 'PHARMACEUTICALS', 'COMPANY', 'HOLDINGS']);

export function sponsorTokens(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/** FDA approval activity (originals + supplements) for a sponsor over `days` (default ~2 years). */
export async function sponsorApprovals(name, now = new Date(), days = 730) {
  const tokens = sponsorTokens(name);
  if (!tokens.length) return { matchedSponsors: [], originals: [], supplements: 0 };
  const from = fdaDate(new Date(now.getTime() - days * 86400000));
  const search = `sponsor_name:${tokens[0]}*+AND+submissions.submission_status_date:[${from}+TO+${fdaDate(now)}]+AND+(application_number:NDA*+OR+application_number:BLA*)`;
  let d;
  try {
    d = await fetchJSON(`${FDA}?search=${search}&limit=100${fdaKey()}`, { timeoutMs: 7000 });
  } catch (e) {
    if (e.status === 404) return { matchedSponsors: [], originals: [], supplements: 0 };
    throw e;
  }
  const results = (d.results || []).filter((r) => tokens.every((t) => (r.sponsor_name || '').includes(t)));
  const originals = [];
  let supplements = 0;
  for (const r of results) {
    for (const s of r.submissions || []) {
      if (s.submission_status !== 'AP' || !(s.submission_status_date >= from)) continue;
      if (s.submission_type === 'ORIG') {
        const prod = r.products?.[0] || {};
        originals.push({
          date: fdaToISO(s.submission_status_date),
          brand: prod.brand_name || null,
          ingredient: (prod.active_ingredients || []).map((a) => a.name).join(' + ') || null,
          application: r.application_number,
          type: s.submission_class_code_description || (r.application_number.startsWith('BLA') ? 'Biologic (BLA)' : null),
          url: dafUrl(r.application_number),
        });
      } else if (s.submission_type === 'SUPPL') {
        supplements++;
      }
    }
  }
  originals.sort((a, b) => b.date.localeCompare(a.date));
  return {
    matchedSponsors: [...new Set(results.map((r) => r.sponsor_name))].slice(0, 5),
    originals: originals.slice(0, 10),
    supplements,
  };
}

// ── Market quotes ──────────────────────────────────────────────────────────
export const SYMBOL_RE = /^\^?[A-Z0-9][A-Z0-9.\-]{0,9}$/;

async function yahooQuote(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`;
  const d = await fetchJSON(url, { timeoutMs: 5000, headers: { Accept: 'application/json' } });
  const r = d?.chart?.result?.[0];
  const meta = r?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error('No Yahoo quote');
  const closes = (r.indicators?.quote?.[0]?.close || []).filter((x) => typeof x === 'number');
  const prev = closes.length >= 2 ? closes[closes.length - 2] : meta.chartPreviousClose;
  return {
    symbol: sym,
    name: meta.shortName || meta.longName || null,
    price: meta.regularMarketPrice,
    prevClose: prev ?? null,
    changePct: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : null,
    currency: meta.currency || 'USD',
    asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    source: 'Yahoo Finance',
  };
}

async function stooqQuote(sym) {
  const s = sym.startsWith('^') ? sym.toLowerCase() : `${sym.toLowerCase()}.us`;
  const r = await fetchWithTimeout(`https://stooq.com/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlcp&h&e=csv`, { timeoutMs: 5000 });
  if (!r.ok) throw new Error('Stooq HTTP ' + r.status);
  const lines = (await r.text()).trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('No Stooq data');
  const head = lines[0].toLowerCase().split(',');
  const row = lines[1].split(',');
  const get = (k) => row[head.indexOf(k)];
  const close = parseFloat(get('close'));
  const prev = parseFloat(get('prev'));
  if (!isFinite(close)) throw new Error('No Stooq price');
  return {
    symbol: sym,
    name: null,
    price: close,
    prevClose: isFinite(prev) ? prev : null,
    changePct: isFinite(prev) && prev ? ((close - prev) / prev) * 100 : null,
    currency: 'USD',
    asOf: get('date') ? new Date(`${get('date')}T${get('time') || '00:00:00'}Z`).toISOString() : null,
    source: 'Stooq',
  };
}

export async function quote(sym) {
  try {
    return await yahooQuote(sym);
  } catch (e1) {
    try {
      return await stooqQuote(sym);
    } catch (e2) {
      return { symbol: sym, error: `unavailable (${e1.message}; ${e2.message})` };
    }
  }
}
