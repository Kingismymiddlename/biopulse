// Market tab: v2 dashboard (trials map, pipeline heat, FDA approvals, deals, feed, quotes).
import { $, $$, esc, safeUrl, fmtInt, timeAgo, shortDate, emit } from './util.js';
import { api } from './api.js';
import { S, tickers, accountMatcher } from './ws.js';

export const M = { news: null, fda: null, areas: null, countries: null, filter: 'all', query: '', heat: 'new7d', loaded: false };

const TICKER_NAMES = {
  XBI: 'SPDR S&P Biotech ETF', IBB: 'iShares Biotech ETF', '^NBI': 'Nasdaq Biotech Index', LLY: 'Eli Lilly', NVO: 'Novo Nordisk',
  MRK: 'Merck & Co.', PFE: 'Pfizer', AZN: 'AstraZeneca', VRTX: 'Vertex', REGN: 'Regeneron', MRNA: 'Moderna', GILD: 'Gilead',
};
const TAG_CLASS = {
  APPROVAL: 'b-green', CRL: 'b-red', SAFETY: 'b-orange', 'M&A': 'b-amber', FINANCING: 'b-amber', LICENSING: 'b-amber',
  'PHASE 3': 'b-blue', 'PHASE 2': 'b-blue', LAYOFFS: 'b-red', POLICY: 'b-grey', AI: 'b-blue', FDA: 'b-green', NEWS: 'b-grey',
};

export function setStatus(el, { source, at, from, partial, error, retry, stale, note }) {
  if (!el) return;
  const parts = [];
  if (error && !from) {
    parts.push(`<span class="bad">&#9679; Unavailable</span><span>${esc(error)}</span>`);
  } else {
    const old = from === 'offline' || stale;
    parts.push(old ? `<span class="stale">&#9679; Saved copy</span>` : `<span class="live">&#9679; Live</span>`);
    if (source) parts.push(`<span>${esc(source)}</span>`);
    if (at) parts.push(`<span title="${esc(new Date(at).toLocaleString())}">updated ${esc(timeAgo(at))}</span>`);
    if (partial) parts.push('<span class="stale">partial data</span>');
    if (from === 'offline') parts.push(`<span class="stale">source unreachable</span>`);
    if (note) parts.push(`<span>${esc(note)}</span>`);
  }
  const showRetry = retry && (error || from === 'offline' || stale || partial);
  el.innerHTML = parts.join('<span aria-hidden="true">·</span>') + (showRetry ? '<button type="button">Retry</button>' : '');
  if (showRetry) el.querySelector('button').addEventListener('click', retry);
}

export function health(key, label, level, detail) {
  S.healthItems = S.healthItems || {};
  S.healthItems[key] = { label, level, detail };
  emit('health');
}

// ── Shared loaders (also used by This week) ─────────────────────────────────
export async function loadNews() {
  try {
    const res = await api('/api/news', { cacheKey: 'news' });
    M.news = { ...res.data, from: res.from };
    (res.data.sources || []).forEach((s) => health('feed:' + s.id, s.name + ' (RSS)', res.from === 'offline' ? 'warn' : s.ok ? 'ok' : 'bad', s.ok ? `${s.count} items` : s.error));
  } catch (e) {
    M.news = { error: e.message };
    health('news', 'News feeds', 'bad', e.message);
  }
  emit('news');
  return M.news;
}

export async function loadFda() {
  try {
    const res = await api('/api/fda', { cacheKey: 'fda' });
    M.fda = { ...res.data, from: res.from };
    health('fda', 'openFDA', res.from === 'offline' ? 'warn' : 'ok', `${res.data.approvals.length} approvals`);
  } catch (e) {
    M.fda = { error: e.message };
    health('fda', 'openFDA', 'bad', e.message);
  }
  emit('fda');
  return M.fda;
}

// ── Rendering ───────────────────────────────────────────────────────────────
const FILTERS = {
  all: () => true,
  reg: (it) => ['APPROVAL', 'CRL', 'SAFETY', 'FDA'].includes(it.tag) || it.sourceId === 'fda',
  deals: (it) => ['M&A', 'FINANCING', 'LICENSING'].includes(it.tag),
  clinical: (it) => ['PHASE 3', 'PHASE 2'].includes(it.tag) || /\b(trial|data|readout|study)\b/i.test(it.title),
  policy: (it) => ['POLICY', 'LAYOFFS'].includes(it.tag),
  mine: (it, match) => Boolean(match(it.title)),
};

export function renderNews() {
  const el = $('#news-feed');
  if (!el) return;
  if (!M.news) {
    el.innerHTML = '<div class="skel"></div>'.repeat(8);
    return;
  }
  if (M.news.error) {
    el.innerHTML = `<div class="empty err">Couldn't load the news feeds. ${esc(M.news.error)}</div>`;
    setStatus($('#news-status'), { error: M.news.error, retry: () => loadNews().then(renderMarket) });
    return;
  }
  const items = M.news.items || [];
  const match = accountMatcher();
  const q = M.query.toLowerCase();
  const f = FILTERS[M.filter] || FILTERS.all;
  const shown = items.filter((it) => f(it, match) && (!q || (it.title + ' ' + (it.summary || '') + ' ' + it.source).toLowerCase().includes(q)));
  $('#news-count').textContent = `${shown.length} of ${items.length} headlines`;
  el.innerHTML = shown.length
    ? shown
        .slice(0, 80)
        .map((it) => {
          const url = safeUrl(it.link);
          const acct = match(it.title);
          return `<a class="news-item${acct ? ' hl' : ''}" href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer">
          <div class="news-src"><span>${esc(it.source)}</span><span>${esc(timeAgo(it.date))}</span>${acct ? `<span class="mine">${esc(acct.name)}</span>` : ''}</div>
          <div class="news-title"><span class="badge ${TAG_CLASS[it.tag] || 'b-grey'}">${esc(it.tag)}</span>${esc(it.title)}</div>
          ${it.summary ? `<div class="news-sum">${esc(it.summary)}</div>` : ''}</a>`;
        })
        .join('')
    : `<div class="empty">${M.filter === 'mine' ? 'No headlines name your accounts right now.' : 'No headlines match.'}</div>`;
  const srcs = M.news.sources || [];
  setStatus($('#news-status'), {
    source: `${srcs.filter((s) => s.ok).length}/${srcs.length} feeds`,
    at: Date.parse(M.news.fetchedAt),
    from: M.news.from,
    stale: M.news.cache && M.news.cache.stale,
    retry: () => loadNews().then(renderMarket),
  });
}

function renderDeals() {
  const track = $('#ticker-track');
  const list = $('#deal-list');
  if (!track || !M.news || M.news.error) {
    if (track && M.news?.error) track.innerHTML = '<span class="ticker-empty">Deal signals unavailable.</span>';
    return;
  }
  const deals = M.news.deals || [];
  if (!deals.length) {
    track.className = 'ticker-track';
    track.innerHTML = '<span class="ticker-empty">No headlines with disclosed deal values in the last 7 days.</span>';
    list.innerHTML = '<div class="empty">No headlines with disclosed deal values in the last 7 days.</div>';
    return;
  }
  const item = (d) => `<span class="ticker-item"><b>${esc(d.value)}</b><a href="${esc(safeUrl(d.link) || '#')}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a><span>· ${esc(d.type)} · ${esc(d.source)}</span></span>`;
  const once = deals.map(item).join('');
  if (deals.length >= 3 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    track.className = 'ticker-track scrolling';
    track.style.setProperty('--tick-dur', Math.max(30, deals.length * 9) + 's');
    track.innerHTML = once + once.replace(/<a /g, '<a tabindex="-1" aria-hidden="true" ');
  } else {
    track.className = 'ticker-track';
    track.innerHTML = once;
  }
  list.innerHTML = deals
    .map((d) => {
      const tier = d.usd >= 1e9 ? ['tier-1', '≥$1B'] : d.usd >= 2.5e8 ? ['tier-2', '≥$250M'] : ['tier-3', '<$250M'];
      return `<div class="deal"><span class="deal-val">${esc(d.value)}</span>
        <span class="deal-title"><a href="${esc(safeUrl(d.link) || '#')}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a></span>
        <span class="deal-meta"><span class="tier ${tier[0]}">${tier[1]}</span>${esc(d.type)} · ${esc(d.source)} · ${esc(timeAgo(d.date))}</span></div>`;
    })
    .join('');
  setStatus($('#deals-status'), { source: 'Parsed from feed headlines', at: Date.parse(M.news.fetchedAt), note: 'values as reported' });
}

const AREA_COLORS = ['#ff5a67', '#f5c542', '#6c9bff', '#00e5b0', '#ff8a4c', '#a78bfa', '#4fd1c5', '#8ea8c0'];
function bars(el, rows, color) {
  const max = Math.max(1, ...rows.map((r) => r.v || 0));
  el.innerHTML = rows
    .map(
      (r, i) => `<div class="bar-row" title="${esc(r.title || '')}"><span class="bar-label">${esc(r.label)}</span>
      <div class="bar-track"><div class="bar-fill" data-w="${r.v == null ? 0 : Math.max(2, Math.round((r.v / max) * 100))}" style="background:${typeof color === 'function' ? color(i) : color}"></div></div>
      <span class="bar-num">${fmtInt(r.v)}</span></div>`,
    )
    .join('');
  requestAnimationFrame(() => $$('.bar-fill', el).forEach((b) => (b.style.width = b.dataset.w + '%')));
}

function renderHeat() {
  if (!M.areas || M.areas.error) return;
  const m = M.heat;
  const rows = M.areas.areas
    .map((a, i) => ({ label: a.name, v: a[m], color: AREA_COLORS[i % AREA_COLORS.length], title: `${a.name}: ${fmtInt(a.new7d)} new in 7 days · ${fmtInt(a.recruiting)} recruiting` }))
    .sort((a, b) => (b.v || 0) - (a.v || 0));
  bars($('#heat-bars'), rows, (i) => rows[i].color);
  $('#heat-hint').textContent =
    m === 'new7d'
      ? `Trials first posted on ClinicalTrials.gov since ${M.areas.since}, by therapy area${M.areas.totalNew7d != null ? ` (${fmtInt(M.areas.totalNew7d)} new in total)` : ''}.`
      : 'Trials currently recruiting on ClinicalTrials.gov, by therapy area. Areas can overlap.';
}

async function loadAreas() {
  try {
    const res = await api('/api/trials?view=areas', { cacheKey: 'areas' });
    M.areas = { ...res.data, from: res.from };
    renderHeat();
    if (res.data.total != null) $('#map-total').textContent = `${fmtInt(res.data.total)} recruiting worldwide`;
    setStatus($('#heat-status'), { source: 'ClinicalTrials.gov', at: Date.parse(res.data.fetchedAt), from: res.from, partial: res.data.partial, stale: res.data.cache && res.data.cache.stale, retry: loadAreas });
    health('ctg', 'ClinicalTrials.gov', res.from === 'offline' ? 'warn' : 'ok', res.data.partial ? 'partial' : 'ok');
  } catch (e) {
    M.areas = { error: e.message };
    $('#heat-bars').innerHTML = `<div class="empty err">${esc(e.message)}</div>`;
    setStatus($('#heat-status'), { error: e.message, retry: loadAreas });
    health('ctg', 'ClinicalTrials.gov', 'bad', e.message);
  }
}

// Map
let map;
let geoLayer;
let geoData;
const MAP_STEPS = ['#10303a', '#0f4d4f', '#0b6e62', '#05947a', '#00c89a', '#00e5b0'];
function colorFor(v, min, max) {
  if (v == null) return '#131d2a';
  if (v <= 0) return '#10202a';
  const lo = Math.log10(Math.max(1, min));
  const hi = Math.log10(Math.max(min + 1, max));
  const t = hi > lo ? (Math.log10(v) - lo) / (hi - lo) : 1;
  return MAP_STEPS[Math.max(0, Math.min(MAP_STEPS.length - 1, Math.floor(t * MAP_STEPS.length)))];
}

async function initMap() {
  if (map) return;
  if (!window.L || !window.topojson) {
    $('#trialmap').innerHTML = '<div class="empty" style="padding:16px">Map library failed to load.</div>';
    return;
  }
  map = L.map('trialmap', { zoomControl: true, attributionControl: true, scrollWheelZoom: false, minZoom: 1, maxZoom: 5, zoomSnap: 0.25, maxBounds: [[-70, -200], [85, 200]] });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Boundaries: Natural Earth · Data: ClinicalTrials.gov');
  map.fitBounds([[-50, -165], [75, 175]]);
  try {
    const topo = await (await fetch('data/countries-110m.json')).json();
    geoData = topojson.feature(topo, topo.objects.countries);
    geoData.features = geoData.features.filter((f) => f.id !== '010');
    drawMap();
  } catch {
    $('#map-status').textContent = 'Could not load map boundaries.';
  }
  new ResizeObserver(() => map && map.invalidateSize()).observe($('#trialmap'));
}

function drawMap() {
  if (!map || !geoData) return;
  const counts = {};
  (M.countries && !M.countries.error ? M.countries.countries : []).forEach((c) => (counts[c.id] = c));
  const vals = Object.values(counts).map((c) => c.recruiting).filter((v) => v > 0);
  const max = Math.max(1, ...vals);
  const min = vals.length ? Math.min(...vals) : 1;
  if (geoLayer) geoLayer.remove();
  geoLayer = L.geoJSON(geoData, {
    style: (f) => ({ fillColor: colorFor(counts[f.id] ? counts[f.id].recruiting : null, min, max), fillOpacity: 1, color: '#07090f', weight: 0.6 }),
    onEachFeature: (f, layer) => {
      const c = counts[f.id];
      const name = (c && c.name) || (f.properties && f.properties.name) || '';
      const body = c ? (c.recruiting != null ? `${fmtInt(c.recruiting)} recruiting trials` : 'count unavailable') : 'not tracked';
      layer.bindTooltip(`<b>${esc(name)}</b><br/>${esc(body)}`, { className: 'bp-tip', sticky: true });
      layer.on({ mouseover: () => layer.setStyle({ weight: 1.5, color: '#00e5b0' }), mouseout: () => layer.setStyle({ weight: 0.6, color: '#07090f' }) });
    },
  }).addTo(map);
  if (vals.length) {
    $('#map-legend').innerHTML = `Recruiting trials (log scale)<div class="scale">${MAP_STEPS.map((c) => `<span style="flex:1;background:${c}"></span>`).join('')}</div><div class="ends"><span>${fmtInt(min)}</span><span>${fmtInt(max)}</span></div>`;
  }
}

async function loadCountries() {
  try {
    const res = await api('/api/trials?view=countries', { cacheKey: 'countries' });
    M.countries = { ...res.data, from: res.from };
    drawMap();
    const top = [...res.data.countries].filter((c) => c.recruiting != null).sort((a, b) => b.recruiting - a.recruiting).slice(0, 8);
    bars($('#geo-bars'), top.map((c) => ({ label: c.name, v: c.recruiting })), '#6c9bff');
    setStatus($('#map-status'), { source: `ClinicalTrials.gov · ${res.data.countries.length} countries tracked`, at: Date.parse(res.data.fetchedAt), from: res.from, partial: res.data.partial, stale: res.data.cache && res.data.cache.stale, retry: loadCountries });
  } catch (e) {
    M.countries = { error: e.message };
    $('#geo-bars').innerHTML = `<div class="empty err">${esc(e.message)}</div>`;
    setStatus($('#map-status'), { error: e.message, retry: loadCountries });
  }
}

function renderFda() {
  const el = $('#fda-list');
  if (!el || !M.fda) return;
  if (M.fda.error) {
    el.innerHTML = `<div class="empty err">${esc(M.fda.error)}</div>`;
    setStatus($('#fda-status'), { error: M.fda.error, retry: () => loadFda().then(renderFda) });
    return;
  }
  const rows = M.fda.approvals || [];
  el.innerHTML = rows.length
    ? rows
        .map((a) => {
          const name = a.brand ? `${a.brand}${a.ingredient && a.ingredient !== a.brand ? ` (${a.ingredient.toLowerCase()})` : ''}` : a.ingredient || a.application;
          return `<div class="appr"><span class="appr-date">${esc(shortDate(a.date))}</span>
            <span class="appr-name"><a href="${esc(safeUrl(a.url) || '#')}" target="_blank" rel="noopener noreferrer">${esc(name)}</a></span>
            <span class="appr-meta">${esc(a.sponsor)} · ${esc(a.type)}${a.priority ? ' · <span class="badge b-amber">PRIORITY</span>' : ''}</span></div>`;
        })
        .join('')
    : '<div class="empty">No novel NDA or BLA approvals recorded in openFDA for the last 60 days.</div>';
  setStatus($('#fda-status'), { source: 'openFDA Drugs@FDA', at: Date.parse(M.fda.fetchedAt), from: M.fda.from, stale: M.fda.cache && M.fda.cache.stale, retry: () => loadFda().then(renderFda), note: 'openFDA can lag FDA by a few days' });
}

export async function loadQuotes() {
  const syms = tickers().slice(0, 16);
  if (!$('#tickers').children.length) $('#tickers').innerHTML = '<div class="skel"></div>'.repeat(6);
  try {
    const res = await api('/api/quotes?symbols=' + encodeURIComponent(syms.join(',')), { cacheKey: 'quotes:' + syms.join(',') });
    const qs = res.data.quotes || [];
    const fmtP = (q) => (typeof q.price === 'number' ? q.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
    const fmtC = (q) => (typeof q.changePct === 'number' ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '—');
    const cls = (q) => (typeof q.changePct === 'number' ? (q.changePct >= 0 ? 'up' : 'dn') : '');
    $('#index-boxes').innerHTML = qs.slice(0, 3).map((q) => `<div class="metric" title="${esc(q.error || q.source || '')}"><div class="metric-val ${cls(q)}">${fmtP(q)}</div><div class="metric-chg ${cls(q)}">${fmtC(q)}</div><div class="metric-label">${esc(q.symbol)}</div></div>`).join('');
    $('#tickers').innerHTML = qs.slice(3).map((q) => `<div class="tick" title="${esc(q.error || (q.source ? 'Source: ' + q.source : ''))}"><span class="t-sym">${esc(q.symbol)}</span><span class="t-name">${esc(TICKER_NAMES[q.symbol] || q.name || '')}</span><span class="t-price">${fmtP(q)}</span><span class="t-chg ${cls(q)}">${fmtC(q)}</span></div>`).join('');
    const okN = qs.filter((q) => typeof q.price === 'number').length;
    setStatus($('#markets-status'), { source: [...new Set(qs.map((q) => q.source).filter(Boolean))].join(' / ') || 'Quotes', at: Date.parse(res.data.fetchedAt), from: res.from, partial: okN < qs.length, retry: loadQuotes, note: 'not investment advice' });
    health('quotes', 'Market quotes', res.from === 'offline' ? 'warn' : okN ? 'ok' : 'bad', `${okN}/${qs.length} symbols`);
  } catch (e) {
    $('#tickers').innerHTML = `<div class="empty err">${esc(e.message)}</div>`;
    $('#index-boxes').innerHTML = '';
    setStatus($('#markets-status'), { error: e.message, retry: loadQuotes });
    health('quotes', 'Market quotes', 'bad', e.message);
  }
}

export function renderMarket() {
  renderNews();
  renderDeals();
  renderFda();
}

export async function showMarket() {
  await initMap();
  if (map) setTimeout(() => map.invalidateSize(), 50);
  if (!M.loaded) {
    M.loaded = true;
    if (!$('#heat-bars').children.length) $('#heat-bars').innerHTML = '<div class="skel"></div>'.repeat(6);
    await Promise.allSettled([loadAreas(), loadCountries(), loadQuotes(), M.news ? null : loadNews(), M.fda ? null : loadFda()]);
  }
  renderMarket();
}

export function wireMarket() {
  $('#news-search').addEventListener('input', (e) => {
    M.query = e.target.value.trim();
    renderNews();
  });
  $('#news-filters').addEventListener('click', (e) => {
    const b = e.target.closest('.fchip');
    if (!b) return;
    M.filter = b.dataset.f;
    $$('#news-filters .fchip').forEach((x) => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    renderNews();
  });
  $$('.seg-btn').forEach((b) =>
    b.addEventListener('click', () => {
      M.heat = b.dataset.heat;
      $$('.seg-btn').forEach((x) => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      renderHeat();
    }),
  );
}
