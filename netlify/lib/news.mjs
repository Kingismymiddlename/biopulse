// RSS/Atom parsing, headline classification and deal extraction.
import { XMLParser } from 'fast-xml-parser';

// Public RSS feeds that allow server-side readers. Fierce Pharma, Fierce Biotech and
// Endpoints were dropped: they return 403 to non-browser clients, and BioPulse
// does not disguise itself to get around that.
export const FEEDS = [
  { id: 'fda', name: 'FDA', url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml', kind: 'regulator' },
  { id: 'stat', name: 'STAT', url: 'https://www.statnews.com/feed/', kind: 'news' },
  { id: 'biopharmadive', name: 'BioPharma Dive', url: 'https://www.biopharmadive.com/feeds/news/', kind: 'news' },
  { id: 'pharmavoice', name: 'PharmaVoice', url: 'https://www.pharmavoice.com/feeds/news/', kind: 'news' },
  { id: 'gen', name: 'GEN', url: 'https://www.genengnews.com/feed/', kind: 'news' },
  { id: 'pharmatech', name: 'Pharmaceutical Technology', url: 'https://www.pharmaceutical-technology.com/feed/', kind: 'news' },
  { id: 'ddd', name: 'Drug Discovery & Development', url: 'https://www.drugdiscoverytrends.com/feed/', kind: 'news' },
  { id: 'labiotech', name: 'Labiotech.eu', url: 'https://www.labiotech.eu/feed/', kind: 'news' },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  isArray: (name) => ['item', 'entry', 'link', 'category'].includes(name),
});

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

export function cleanText(v, max = 0) {
  if (v == null) return '';
  if (typeof v === 'object') v = v['#text'] ?? v['__cdata'] ?? '';
  let s = decodeEntities(String(v))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s).replace(/\s+/g, ' ').trim();
  if (max && s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return s;
}

export function safeUrl(u) {
  try {
    const url = new URL(String(u).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function pickLink(link) {
  if (!link) return null;
  const arr = Array.isArray(link) ? link : [link];
  for (const l of arr) {
    if (typeof l === 'string') return l;
    if (l['@_href'] && (!l['@_rel'] || l['@_rel'] === 'alternate')) return l['@_href'];
    if (l['#text']) return l['#text'];
  }
  const first = arr[0];
  return typeof first === 'object' ? first['@_href'] || null : null;
}

function toISO(d) {
  if (!d) return null;
  const t = new Date(typeof d === 'object' ? d['#text'] : d);
  return isNaN(t) ? null : t.toISOString();
}

export function parseFeed(xml) {
  const doc = parser.parse(xml);
  const items =
    doc?.rss?.channel?.item ||
    doc?.feed?.entry ||
    doc?.['rdf:RDF']?.item ||
    doc?.RDF?.item ||
    [];
  return items
    .map((it) => ({
      title: cleanText(it.title, 220),
      link: safeUrl(pickLink(it.link) || it.guid?.['#text'] || it.guid),
      date: toISO(it.pubDate || it.published || it.updated || it['dc:date']),
      summary: cleanText(it.description || it.summary || it['content:encoded'] || it.content, 300),
    }))
    .filter((it) => it.title && it.link);
}

// ── Classification ─────────────────────────────────────────────────────────
const RULES = [
  { tag: 'CRL', re: /\b(complete response letter|CRL|rejects?|rejected|refus(e|al) to file|turns? back|turned back|rebuff(s|ed)?|declines? to approve|spurns?)\b/i },
  { tag: 'APPROVAL', re: /\b(approv(es|ed|al)|clears?|cleared|green[- ]?light|authori[sz](es|ed))\b/i },
  { tag: 'SAFETY', re: /\b(recall|warning letter|boxed warning|safety (signal|alert)|clinical hold)\b/i },
  { tag: 'M&A', re: /\b(acquir(e|es|ed|ing|ition)|buyout|takeover|merg(e|er|es|ing)|to buy)\b/i },
  { tag: 'FINANCING', re: /\b(raises?|raised|financing|series [a-f]\b|funding round|IPO|public offering|seed round)\b/i },
  { tag: 'LICENSING', re: /\b(licens(e|es|ing)|collaborat(e|ion)|partnership|partners with|option deal|co-develop)\b/i },
  { tag: 'PHASE 3', re: /\b(phase (3|iii)|pivotal)\b/i },
  { tag: 'PHASE 2', re: /\b(phase (2|ii)|phase 2[ab])\b/i },
  { tag: 'LAYOFFS', re: /\b(layoffs?|lays off|job cuts|workforce reduction|restructur(e|ing))\b/i },
  { tag: 'POLICY', re: /\b(CMS|IRA|Medicare|tariffs?|pricing|congress|senate|HHS|executive order|MFN)\b/ },
  { tag: 'AI', re: /\b(AI|artificial intelligence|machine learning|LLM|generative)\b/ },
];

export function classify(title, kind) {
  for (const r of RULES) if (r.re.test(title)) return r.tag;
  return kind === 'regulator' ? 'FDA' : 'NEWS';
}

const MONEY_RE = /(up to\s+)?(?:US)?\$\s?(\d{1,4}(?:[.,]\d{1,3})?)\s?(billion|bn|b|million|mn|mm|m)\b/i;

/** Extract a USD deal value from a headline. Returns { usd, label, upTo } or null. */
export function extractMoney(text) {
  const m = MONEY_RE.exec(text || '');
  if (!m) return null;
  const n = parseFloat(m[2].replace(',', '.'));
  if (!isFinite(n)) return null;
  const unit = m[3].toLowerCase();
  const isB = unit.startsWith('b');
  const usd = n * (isB ? 1e9 : 1e6);
  return { usd, label: `$${m[2]}${isB ? 'B' : 'M'}`, upTo: Boolean(m[1]) };
}

const DEAL_TAGS = new Set(['M&A', 'FINANCING', 'LICENSING']);

export function toDeal(item) {
  if (!DEAL_TAGS.has(item.tag)) return null;
  const money = extractMoney(item.title) || extractMoney(item.summary);
  if (!money) return null;
  return {
    title: item.title,
    link: item.link,
    source: item.source,
    date: item.date,
    type: item.tag === 'M&A' ? 'M&A' : item.tag === 'FINANCING' ? 'Financing' : 'Licensing',
    usd: money.usd,
    value: (money.upTo ? 'up to ' : '') + money.label,
  };
}

export function normTitle(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);
}

export function mergeItems(lists) {
  const seen = new Set();
  const out = [];
  for (const it of lists.flat()) {
    const k = normTitle(it.title);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return out;
}
