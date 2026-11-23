/* BioPulse v2 front end. Plain JS, no build step. */
(() => {
  'use strict';

  // ── Utilities ──────────────────────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const safeUrl = (u) => {
    try {
      const x = new URL(u);
      return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
    } catch {
      return null;
    }
  };
  const fmtInt = (n) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('en-US'));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function timeAgo(iso) {
    const t = Date.parse(iso);
    if (!t) return '';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (m < 1440) return Math.round(m / 60) + 'h ago';
    return Math.round(m / 1440) + 'd ago';
  }
  function shortDate(iso) {
    const d = new Date(iso + (iso && iso.length === 10 ? 'T12:00:00Z' : ''));
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).toUpperCase();
  }
  function longDate(iso) {
    const d = new Date(iso + 'T12:00:00Z');
    return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  const store = {
    get(k, d = null) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {
        /* storage full or blocked: ignore */
      }
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };

  // ── State ──────────────────────────────────────────────────────────────────
  const DEFAULT_PROFILE = {
    firm: '',
    offering:
      'Data, analytics and AI consulting for pharma, biotech and medtech: data platforms, clinical and commercial analytics, real-world evidence, and GenAI applications.',
    focus: 'Clinical development, commercial analytics, R&D data',
  };
  const DEFAULT_TICKERS = ['XBI', 'IBB', '^NBI', 'LLY', 'NVO', 'MRK', 'PFE', 'AZN', 'VRTX', 'REGN', 'MRNA', 'GILD'];
  const TICKER_NAMES = {
    XBI: 'SPDR S&P Biotech ETF', IBB: 'iShares Biotech ETF', '^NBI': 'Nasdaq Biotech Index', LLY: 'Eli Lilly', NVO: 'Novo Nordisk',
    MRK: 'Merck & Co.', PFE: 'Pfizer', AZN: 'AstraZeneca', VRTX: 'Vertex', REGN: 'Regeneron', MRNA: 'Moderna', GILD: 'Gilead',
  };

  const state = {
    profile: { ...DEFAULT_PROFILE, ...(store.get('bp:profile') || {}) },
    tickers: store.get('bp:tickers') || DEFAULT_TICKERS,
    watchlist: store.get('bp:watchlist') || [],
    news: null,
    newsFilter: 'all',
    newsQuery: '',
    heatMetric: 'new7d',
    areas: null,
    countries: null,
    events: [],
    activeEvent: null,
    health: {},
    briefRefs: [],
  };

  // ── API ────────────────────────────────────────────────────────────────────
  const isGithubPages = /\.github\.io$/i.test(location.hostname);
  const apiBase = () => (store.get('bp:apiBase') || (window.BIOPULSE_CONFIG && window.BIOPULSE_CONFIG.apiBase) || '').trim().replace(/\/+$/, '');
  const backendMissing = () => isGithubPages && !apiBase();

  class ApiError extends Error {
    constructor(msg, status, code) {
      super(msg);
      this.status = status;
      this.code = code;
    }
  }

  async function api(path, { method = 'GET', body, timeout = 20000, cacheKey } = {}) {
    if (backendMissing()) throw new ApiError('Backend not connected', 0, 'no_backend');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(apiBase() + path, {
        method,
        signal: ctrl.signal,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try {
        data = await r.json();
      } catch {
        /* non-JSON */
      }
      if (!r.ok) throw new ApiError((data && data.error) || `Request failed (${r.status})`, r.status, data && data.code);
      if (!data) throw new ApiError('Empty response from server', r.status);
      if (cacheKey) store.set('bp:cache:' + cacheKey, { at: Date.now(), data });
      return { data, from: 'live' };
    } catch (e) {
      const err = e.name === 'AbortError' ? new ApiError('The request timed out', 0, 'timeout') : e instanceof ApiError ? e : new ApiError('Network error: ' + e.message, 0, 'network');
      if (cacheKey && method === 'GET') {
        const c = store.get('bp:cache:' + cacheKey);
        if (c && c.data) return { data: c.data, from: 'offline', at: c.at, error: err.message };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Status / health ────────────────────────────────────────────────────────
  function setStatus(el, { source, at, from, partial, error, retry, stale, note }) {
    if (!el) return;
    const parts = [];
    if (error && !from) {
      parts.push(`<span class="bad">&#9679; Unavailable</span><span>${esc(error)}</span>`);
    } else {
      const old = from === 'offline' || stale;
      parts.push(old ? `<span class="stale">&#9679; Saved copy</span>` : `<span class="live">&#9679; Live</span>`);
      if (source) parts.push(`<span>${esc(source)}</span>`);
      if (at) parts.push(`<span title="${esc(new Date(at).toLocaleString())}">updated ${esc(timeAgo(new Date(at).toISOString()))}</span>`);
      if (partial) parts.push('<span class="stale">partial data</span>');
      if (from === 'offline') parts.push(`<span class="stale">source unreachable</span>`);
      if (note) parts.push(`<span>${esc(note)}</span>`);
    }
    const showRetry = retry && (error || from === 'offline' || stale || partial);
    el.innerHTML = parts.join('<span aria-hidden="true">·</span>') + (showRetry ? '<button type="button">Retry</button>' : '');
    if (showRetry) el.querySelector('button').addEventListener('click', retry);
  }

  function setHealth(key, label, level, detail) {
    state.health[key] = { label, level, detail };
    renderHealthChip();
  }

  function renderHealthChip() {
    const vals = Object.values(state.health);
    const dot = $('#health-dot');
    const txt = $('#health-text');
    if (!vals.length) return;
    const ok = vals.filter((v) => v.level === 'ok').length;
    const bad = vals.filter((v) => v.level === 'bad').length;
    dot.className = 'dot ' + (bad === 0 && ok === vals.length ? 'ok' : ok === 0 ? 'bad' : 'warn');
    txt.textContent = `${ok}/${vals.length} sources live`;
  }

  function renderHealthDialog() {
    const rows = Object.values(state.health)
      .map(
        (h) => `<div class="src-row"><span class="dot ${h.level === 'ok' ? 'ok' : h.level === 'warn' ? 'warn' : 'bad'}"></span><span>${esc(h.label)}</span><span class="why">${esc(h.detail || '')}</span></div>`,
      )
      .join('');
    $('#health-body').innerHTML =
      (backendMissing()
        ? '<p class="err" style="margin:8px 0">Backend not connected. Open Settings and add your Netlify site URL.</p>'
        : `<p class="muted" style="margin:6px 0 10px">Backend: ${esc(apiBase() || location.origin)}</p>`) + (rows || '<p class="muted">Nothing loaded yet.</p>');
  }

  function showBanner(html) {
    const b = $('#banner');
    if (!html) {
      b.hidden = true;
      return;
    }
    b.innerHTML = html;
    b.hidden = false;
  }

  // ── Clock ─────────────────────────────────────────────────────────────────
  function tickClock() {
    const d = new Date();
    const local = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const utc = d.toISOString().slice(11, 16);
    $('#clock').textContent = `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${local} local · ${utc} UTC`;
  }

  // ── News ──────────────────────────────────────────────────────────────────
  const TAG_CLASS = {
    APPROVAL: 'b-green', CRL: 'b-red', SAFETY: 'b-orange', 'M&A': 'b-amber', FINANCING: 'b-amber', LICENSING: 'b-amber',
    'PHASE 3': 'b-blue', 'PHASE 2': 'b-blue', LAYOFFS: 'b-red', POLICY: 'b-grey', AI: 'b-blue', FDA: 'b-green', NEWS: 'b-grey',
  };
  const FILTERS = {
    all: () => true,
    reg: (it) => ['APPROVAL', 'CRL', 'SAFETY', 'FDA'].includes(it.tag) || it.sourceId === 'fda',
    deals: (it) => ['M&A', 'FINANCING', 'LICENSING'].includes(it.tag),
    clinical: (it) => ['PHASE 3', 'PHASE 2'].includes(it.tag) || /\b(trial|data|readout|study)\b/i.test(it.title),
    policy: (it) => ['POLICY', 'LAYOFFS'].includes(it.tag),
    watch: (it) => watchMatch(it),
  };

  function watchRegex() {
    if (!state.watchlist.length) return null;
    return new RegExp('(^|[^a-z0-9])(' + state.watchlist.map(reEsc).join('|') + ')($|[^a-z0-9])', 'i');
  }
  function watchMatch(it) {
    const re = watchRegex();
    return re ? re.test(it.title + ' ' + (it.summary || '')) : false;
  }

  async function loadNews() {
    const el = $('#news-feed');
    if (!state.news) el.innerHTML = '<div class="skel"></div>'.repeat(8);
    try {
      const res = await api('/api/news', { cacheKey: 'news' });
      state.news = res.data;
      renderNews();
      renderDeals();
      const srcs = res.data.sources || [];
      const okSrc = srcs.filter((s) => s.ok).length;
      setStatus($('#news-status'), {
        source: `${okSrc}/${srcs.length} feeds`,
        at: Date.parse(res.data.fetchedAt) || res.at,
        from: res.from,
        stale: res.data.cache && res.data.cache.stale,
        retry: loadNews,
      });
      srcs.forEach((s) => setHealth('feed:' + s.id, s.name + ' (RSS)', res.from === 'offline' ? 'warn' : s.ok ? 'ok' : 'bad', s.ok ? `${s.count} items` : s.error));
    } catch (e) {
      el.innerHTML = `<div class="empty err">Couldn't load the news feeds. ${esc(e.message)}</div>`;
      setStatus($('#news-status'), { error: e.message, retry: loadNews });
      $('#ticker-track').innerHTML = '<span class="ticker-empty">Deal signals unavailable.</span>';
      $('#deal-list').innerHTML = '<div class="empty">Deal radar needs the news feed.</div>';
      setHealth('news', 'News feeds', 'bad', e.message);
    }
  }

  function renderNews() {
    const el = $('#news-feed');
    if (!state.news) return;
    const items = state.news.items || [];
    const q = state.newsQuery.toLowerCase();
    const f = FILTERS[state.newsFilter] || FILTERS.all;
    const re = watchRegex();
    const shown = items.filter((it) => f(it) && (!q || (it.title + ' ' + (it.summary || '') + ' ' + it.source).toLowerCase().includes(q)));
    $('#news-count').textContent = `${shown.length} of ${items.length} headlines`;
    if (!shown.length) {
      el.innerHTML = `<div class="empty">${state.newsFilter === 'watch' && !state.watchlist.length ? 'Your watchlist is empty. Add companies in the Daily brief tab.' : 'No headlines match.'}</div>`;
      return;
    }
    el.innerHTML = shown
      .slice(0, 80)
      .map((it) => {
        const url = safeUrl(it.link);
        const hl = re && re.test(it.title + ' ' + (it.summary || ''));
        return `<a class="news-item${hl ? ' hl' : ''}" href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer">
          <div class="news-src"><span>${esc(it.source)}</span><span>${esc(timeAgo(it.date))}</span></div>
          <div class="news-title"><span class="badge ${TAG_CLASS[it.tag] || 'b-grey'}">${esc(it.tag)}</span>${esc(it.title)}</div>
          ${it.summary ? `<div class="news-sum">${esc(it.summary)}</div>` : ''}
        </a>`;
      })
      .join('');
  }

  // ── Deals (derived from headlines) ─────────────────────────────────────────
  function renderDeals() {
    const deals = (state.news && state.news.deals) || [];
    const track = $('#ticker-track');
    const list = $('#deal-list');
    if (!deals.length) {
      track.className = 'ticker-track';
      track.innerHTML = '<span class="ticker-empty">No headlines with disclosed deal values in the last 7 days.</span>';
      list.innerHTML = '<div class="empty">No headlines with disclosed deal values in the last 7 days.</div>';
      setStatus($('#deals-status'), { source: 'Parsed from feed headlines', at: Date.parse(state.news.fetchedAt) });
      return;
    }
    const item = (d) => {
      const url = safeUrl(d.link);
      return `<span class="ticker-item"><b>${esc(d.value)}</b><a href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a><span>· ${esc(d.type)} · ${esc(d.source)}</span></span>`;
    };
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
        const url = safeUrl(d.link);
        return `<div class="deal"><span class="deal-val">${esc(d.value)}</span>
          <span class="deal-title"><a href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a></span>
          <span class="deal-meta"><span class="tier ${tier[0]}">${tier[1]}</span>${esc(d.type)} · ${esc(d.source)} · ${esc(timeAgo(d.date))}</span></div>`;
      })
      .join('');
    setStatus($('#deals-status'), { source: 'Parsed from feed headlines', at: Date.parse(state.news.fetchedAt), note: 'values as reported' });
  }

  // ── Pipeline heat ─────────────────────────────────────────────────────────
  const AREA_COLORS = ['#ff5a67', '#f5c542', '#6c9bff', '#00e5b0', '#ff8a4c', '#a78bfa', '#4fd1c5', '#8ea8c0'];

  function bars(el, rows, color) {
    const max = Math.max(1, ...rows.map((r) => r.v || 0));
    el.innerHTML = rows
      .map(
        (r, i) => `<div class="bar-row" title="${esc(r.title || '')}">
          <span class="bar-label">${esc(r.label)}</span>
          <div class="bar-track"><div class="bar-fill" data-w="${r.v == null ? 0 : Math.max(2, Math.round((r.v / max) * 100))}" style="background:${typeof color === 'function' ? color(i) : color}"></div></div>
          <span class="bar-num">${fmtInt(r.v)}</span></div>`,
      )
      .join('');
    requestAnimationFrame(() => $$('.bar-fill', el).forEach((b) => (b.style.width = b.dataset.w + '%')));
  }

  function renderHeat() {
    if (!state.areas) return;
    const m = state.heatMetric;
    const rows = state.areas.areas
      .map((a, i) => ({ label: a.name, v: a[m], color: AREA_COLORS[i % AREA_COLORS.length], title: `${a.name}: ${fmtInt(a.new7d)} new in 7 days · ${fmtInt(a.recruiting)} recruiting` }))
      .sort((a, b) => (b.v || 0) - (a.v || 0));
    bars($('#heat-bars'), rows, (i) => rows[i].color);
    $('#heat-hint').textContent =
      m === 'new7d'
        ? `Trials first posted on ClinicalTrials.gov since ${state.areas.since}, by therapy area${state.areas.totalNew7d != null ? ` (${fmtInt(state.areas.totalNew7d)} new in total)` : ''}.`
        : 'Trials currently recruiting on ClinicalTrials.gov, by therapy area. Areas can overlap.';
  }

  async function loadAreas() {
    $('#heat-bars').innerHTML = state.areas ? $('#heat-bars').innerHTML : '<div class="skel"></div>'.repeat(6);
    try {
      const res = await api('/api/trials?view=areas', { cacheKey: 'areas' });
      state.areas = res.data;
      renderHeat();
      if (res.data.total != null) $('#map-total').textContent = `${fmtInt(res.data.total)} recruiting worldwide`;
      setStatus($('#heat-status'), { source: 'ClinicalTrials.gov', at: Date.parse(res.data.fetchedAt), from: res.from, partial: res.data.partial, stale: res.data.cache && res.data.cache.stale, retry: loadAreas });
      setHealth('ctg', 'ClinicalTrials.gov', res.from === 'offline' ? 'warn' : 'ok', res.data.partial ? 'partial' : 'ok');
    } catch (e) {
      $('#heat-bars').innerHTML = `<div class="empty err">${esc(e.message)}</div>`;
      setStatus($('#heat-status'), { error: e.message, retry: loadAreas });
      setHealth('ctg', 'ClinicalTrials.gov', 'bad', e.message);
    }
  }

  // ── Map ───────────────────────────────────────────────────────────────────
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
    if (!window.L || !window.topojson) {
      $('#trialmap').innerHTML = '<div class="empty" style="padding:16px">Map library failed to load.</div>';
      return;
    }
    map = L.map('trialmap', {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      minZoom: 1,
      maxZoom: 5,
      zoomSnap: 0.25,
      worldCopyJump: false,
      maxBounds: [[-70, -200], [85, 200]],
    });
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('Boundaries: Natural Earth · Data: ClinicalTrials.gov');
    map.fitBounds([[-50, -165], [75, 175]]);
    try {
      const r = await fetch('data/countries-110m.json');
      const topo = await r.json();
      geoData = topojson.feature(topo, topo.objects.countries);
      geoData.features = geoData.features.filter((f) => f.id !== '010'); // drop Antarctica
      drawMap();
    } catch (e) {
      $('#map-status').textContent = 'Could not load map boundaries.';
    }
    new ResizeObserver(() => map && map.invalidateSize()).observe($('#trialmap'));
  }

  function drawMap() {
    if (!map || !geoData) return;
    const counts = {};
    (state.countries ? state.countries.countries : []).forEach((c) => (counts[c.id] = c));
    const vals = Object.values(counts).map((c) => c.recruiting).filter((v) => v > 0);
    const max = Math.max(1, ...vals);
    const min = vals.length ? Math.min(...vals) : 1;
    if (geoLayer) geoLayer.remove();
    geoLayer = L.geoJSON(geoData, {
      style: (f) => ({
        fillColor: colorFor(counts[f.id] ? counts[f.id].recruiting : null, min, max),
        fillOpacity: 1,
        color: '#07090f',
        weight: 0.6,
      }),
      onEachFeature: (f, layer) => {
        const c = counts[f.id];
        const name = (c && c.name) || (f.properties && f.properties.name) || '';
        const body = c ? (c.recruiting != null ? `${fmtInt(c.recruiting)} recruiting trials` : 'count unavailable') : 'not tracked';
        layer.bindTooltip(`<b>${esc(name)}</b><br/>${esc(body)}`, { className: 'bp-tip', sticky: true });
        layer.on({
          mouseover: () => layer.setStyle({ weight: 1.5, color: '#00e5b0' }),
          mouseout: () => layer.setStyle({ weight: 0.6, color: '#07090f' }),
        });
      },
    }).addTo(map);
    const legend = $('#map-legend');
    if (state.countries) {
      legend.innerHTML = `Recruiting trials (log scale)<div class="scale">${MAP_STEPS.map((c) => `<span style="flex:1;background:${c}"></span>`).join('')}</div><div class="ends"><span>${fmtInt(min)}</span><span>${fmtInt(max)}</span></div>`;
    }
  }

  async function loadCountries() {
    try {
      const res = await api('/api/trials?view=countries', { cacheKey: 'countries' });
      state.countries = res.data;
      drawMap();
      const top = [...res.data.countries].filter((c) => c.recruiting != null).sort((a, b) => b.recruiting - a.recruiting).slice(0, 8);
      bars($('#geo-bars'), top.map((c) => ({ label: c.name, v: c.recruiting })), '#6c9bff');
      setStatus($('#map-status'), { source: `ClinicalTrials.gov · ${res.data.countries.length} countries tracked`, at: Date.parse(res.data.fetchedAt), from: res.from, partial: res.data.partial, stale: res.data.cache && res.data.cache.stale, retry: loadCountries });
    } catch (e) {
      $('#geo-bars').innerHTML = `<div class="empty err">${esc(e.message)}</div>`;
      setStatus($('#map-status'), { error: e.message, retry: loadCountries });
    }
  }

  // ── FDA approvals ─────────────────────────────────────────────────────────
  async function loadFda() {
    const el = $('#fda-list');
    if (!el.children.length) el.innerHTML = '<div class="skel"></div>'.repeat(5);
    try {
      const res = await api('/api/fda', { cacheKey: 'fda' });
      const rows = res.data.approvals || [];
      el.innerHTML = rows.length
        ? rows
            .map((a) => {
              const url = safeUrl(a.url);
              const name = a.brand ? `${a.brand}${a.ingredient && a.ingredient !== a.brand ? ` (${a.ingredient.toLowerCase()})` : ''}` : a.ingredient || a.application;
              return `<div class="appr"><span class="appr-date">${esc(shortDate(a.date))}</span>
                <span class="appr-name"><a href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer">${esc(name)}</a></span>
                <span class="appr-meta">${esc(a.sponsor)} · ${esc(a.type)}${a.priority ? ' · <span class="badge b-amber">PRIORITY</span>' : ''}</span></div>`;
            })
            .join('')
        : '<div class="empty">No novel NDA or BLA approvals recorded in openFDA for the last 60 days.</div>';
      setStatus($('#fda-status'), { source: 'openFDA Drugs@FDA', at: Date.parse(res.data.fetchedAt), from: res.from, stale: res.data.cache && res.data.cache.stale, retry: loadFda, note: 'openFDA can lag FDA by a few days' });
      setHealth('fda', 'openFDA', res.from === 'offline' ? 'warn' : 'ok', `${rows.length} approvals`);
    } catch (e) {
      el.innerHTML = `<div class="empty err">${esc(e.message)}</div>`;
      setStatus($('#fda-status'), { error: e.message, retry: loadFda });
      setHealth('fda', 'openFDA', 'bad', e.message);
    }
  }

  // ── Markets ───────────────────────────────────────────────────────────────
  async function loadQuotes() {
    const syms = state.tickers.slice(0, 16);
    if (!syms.length) {
      $('#index-boxes').innerHTML = '';
      $('#tickers').innerHTML = '<div class="empty">No tickers set. Add some in Settings.</div>';
      return;
    }
    if (!$('#tickers').children.length) $('#tickers').innerHTML = '<div class="skel"></div>'.repeat(6);
    try {
      const res = await api('/api/quotes?symbols=' + encodeURIComponent(syms.join(',')), { cacheKey: 'quotes:' + syms.join(',') });
      const qs = res.data.quotes || [];
      const fmtP = (q) => (typeof q.price === 'number' ? q.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
      const fmtC = (q) => (typeof q.changePct === 'number' ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '—');
      const cls = (q) => (typeof q.changePct === 'number' ? (q.changePct >= 0 ? 'up' : 'dn') : '');
      $('#index-boxes').innerHTML = qs
        .slice(0, 3)
        .map((q) => `<div class="metric" title="${esc(q.error || q.source || '')}"><div class="metric-val ${cls(q)}">${fmtP(q)}</div><div class="metric-chg ${cls(q)}">${fmtC(q)}</div><div class="metric-label">${esc(q.symbol)}</div></div>`)
        .join('');
      $('#tickers').innerHTML = qs
        .slice(3)
        .map((q) => `<div class="tick" title="${esc(q.error || (q.source ? 'Source: ' + q.source : ''))}"><span class="t-sym">${esc(q.symbol)}</span><span class="t-name">${esc(TICKER_NAMES[q.symbol] || q.name || '')}</span><span class="t-price">${fmtP(q)}</span><span class="t-chg ${cls(q)}">${fmtC(q)}</span></div>`)
        .join('');
      const okN = qs.filter((q) => typeof q.price === 'number').length;
      setStatus($('#markets-status'), { source: [...new Set(qs.map((q) => q.source).filter(Boolean))].join(' / ') || 'Quotes', at: Date.parse(res.data.fetchedAt), from: res.from, partial: okN < qs.length, retry: loadQuotes, note: 'not investment advice' });
      setHealth('quotes', 'Market quotes', res.from === 'offline' ? 'warn' : okN ? 'ok' : 'bad', `${okN}/${qs.length} symbols`);
    } catch (e) {
      $('#tickers').innerHTML = `<div class="empty err">${esc(e.message)}</div>`;
      $('#index-boxes').innerHTML = '';
      setStatus($('#markets-status'), { error: e.message, retry: loadQuotes });
      setHealth('quotes', 'Market quotes', 'bad', e.message);
    }
  }

  // ── Watchlist ─────────────────────────────────────────────────────────────
  function renderWatch() {
    $('#watch-chips').innerHTML = state.watchlist
      .map((w, i) => `<span class="chip">${esc(w)}<button type="button" data-i="${i}" aria-label="Remove ${esc(w)} from watchlist">&#10005;</button></span>`)
      .join('');
  }
  function addWatch() {
    const inp = $('#watch-input');
    const v = inp.value.trim().replace(/\s+/g, ' ').slice(0, 40);
    inp.value = '';
    if (!v || state.watchlist.some((w) => w.toLowerCase() === v.toLowerCase())) return;
    if (state.watchlist.length >= 12) return;
    state.watchlist.push(v);
    store.set('bp:watchlist', state.watchlist);
    renderWatch();
    renderNews();
  }

  // ── AI helpers ─────────────────────────────────────────────────────────────
  function aiErrorHtml(e) {
    const tips = {
      ai_not_configured: 'The site owner needs to add GROQ_API_KEY in Netlify (Site configuration → Environment variables) and redeploy.',
      ai_bad_key: 'The Groq key on the server was rejected. Generate a new key at console.groq.com and update GROQ_API_KEY in Netlify.',
      no_backend: 'This copy of BioPulse is not connected to a backend. Set the API base URL in Settings.',
      limit_ip: 'Hourly limit reached for your connection.',
      limit_global: 'The site\'s daily AI budget is used up.',
    };
    const body = tips[e.code] && ['ai_not_configured', 'ai_bad_key', 'no_backend'].includes(e.code) ? tips[e.code] : e.message + (tips[e.code] ? ' ' + tips[e.code] : '');
    return `<div class="card"><div class="card-hd red">Couldn't generate</div><p>${esc(body)}</p></div>`;
  }
  const refLinks = (sources, refs) =>
    (sources || [])
      .map((n) => {
        const it = refs[n - 1];
        if (!it) return '';
        const url = safeUrl(it.link);
        return `<a class="ref" href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer" title="${esc(it.source + ': ' + it.title)}">${n}</a>`;
      })
      .join('');

  function profilePayload() {
    return { firm: state.profile.firm || 'Our firm', offering: state.profile.offering, focus: state.profile.focus };
  }

  function copyText(text, btn) {
    const done = () => {
      const old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = old), 1400);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch {
      /* ignore */
    }
    ta.remove();
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  // ── Daily brief ───────────────────────────────────────────────────────────
  async function generateBrief() {
    const out = $('#brief-out');
    const btn = $('#brief-btn');
    const items = (state.news && state.news.items) || [];
    if (items.length < 3) {
      out.innerHTML = '<div class="card"><div class="card-hd red">Not enough headlines</div><p>The news feed needs to load before a brief can be written.</p></div>';
      return;
    }
    const recent = items.filter((it) => !it.date || Date.now() - Date.parse(it.date) < 4 * 86400000);
    const pool = recent.length >= 10 ? recent : items;
    const watched = pool.filter(watchMatch);
    const refs = [...watched, ...pool.filter((it) => !watched.includes(it))].slice(0, 30);
    btn.disabled = true;
    btn.textContent = '⟳ Writing brief…';
    out.innerHTML = '<div class="skel"></div>'.repeat(6);
    try {
      const { data } = await api('/api/ai', {
        method: 'POST',
        timeout: 30000,
        body: {
          task: 'dailyBrief',
          input: {
            headlines: refs.map((it) => ({ title: it.title, source: it.source, tag: it.tag, date: it.date })),
            watchlist: state.watchlist,
            profile: profilePayload(),
          },
        },
      });
      const r = data.result;
      state.briefRefs = refs;
      const themes = r.themes.map((t) => `<h4>${esc(t.title)}</h4><p>${esc(t.summary)}${refLinks(t.sources, refs)}</p>`).join('');
      const watch = r.watchlist.length ? `<div class="card"><div class="card-hd blue">&#9670; Watchlist</div><ul>${r.watchlist.map((w) => `<li><b>${esc(w.company)}:</b> ${esc(w.note)}${refLinks(w.sources, refs)}</li>`).join('')}</ul></div>` : '';
      const opps = r.opportunities.map((o) => `<h4>${esc(o.title)}</h4><p>${esc(o.rationale)}${refLinks(o.sources, refs)}</p>`).join('');
      out.innerHTML = `
        <div class="meta-line"><span class="flag">AI-GENERATED</span><span>${esc(data.model || '')}</span><span>${esc(timeAgo(data.generatedAt))}${data.cached ? ' · cached' : ''}${data.stale ? ' · older copy' : ''}</span><span>from ${refs.length} headlines</span><button type="button" class="act" id="brief-copy">Copy</button></div>
        <div class="card"><div class="card-hd">&#9632; Lead</div><p class="lead">${esc(r.lead)}</p></div>
        <div class="card"><div class="card-hd amber">&#9650; Themes</div>${themes || '<p class="muted">No themes returned.</p>'}</div>
        ${watch}
        <div class="card"><div class="card-hd blue">&#9670; Opportunities for ${esc(state.profile.firm || 'your firm')}</div>${opps || '<p class="muted">None identified.</p>'}</div>`;
      $('#brief-copy').addEventListener('click', (ev) => copyText(briefText(r, refs), ev.currentTarget));
    } catch (e) {
      out.innerHTML = aiErrorHtml(e);
    } finally {
      btn.disabled = false;
      btn.textContent = '↺ Regenerate brief';
    }
  }

  function briefText(r, refs) {
    const cite = (s) => (s && s.length ? ' [' + s.join(', ') + ']' : '');
    const lines = [`BioPulse daily brief, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, '', r.lead, '', 'THEMES'];
    r.themes.forEach((t) => lines.push(`- ${t.title}: ${t.summary}${cite(t.sources)}`));
    if (r.watchlist.length) {
      lines.push('', 'WATCHLIST');
      r.watchlist.forEach((w) => lines.push(`- ${w.company}: ${w.note}${cite(w.sources)}`));
    }
    lines.push('', 'OPPORTUNITIES');
    r.opportunities.forEach((o) => lines.push(`- ${o.title}: ${o.rationale}${cite(o.sources)}`));
    lines.push('', 'SOURCES');
    refs.forEach((it, i) => lines.push(`[${i + 1}] ${it.source}: ${it.title} ${it.link}`));
    lines.push('', 'AI-generated from the headlines above. Verify before sharing.');
    return lines.join('\n');
  }

  // ── Account (prospect) brief ──────────────────────────────────────────────
  const AMBIGUOUS = {
    merck: [
      { label: 'Merck & Co. (MSD, US)', display: 'Merck & Co. (MSD)', sponsor: 'Merck Sharp & Dohme', terms: ['Merck & Co', 'MSD', 'Merck'] },
      { label: 'Merck KGaA (Germany)', display: 'Merck KGaA', sponsor: 'Merck KGaA', terms: ['Merck KGaA', 'EMD Serono'] },
    ],
  };
  const ALIASES = {
    'johnson & johnson': 'Janssen', 'j&j': 'Janssen', jnj: 'Janssen', 'johnson and johnson': 'Janssen',
    lilly: 'Eli Lilly', gsk: 'GlaxoSmithKline', bms: 'Bristol-Myers Squibb', 'bristol myers squibb': 'Bristol-Myers Squibb',
    msd: 'Merck Sharp & Dohme', novo: 'Novo Nordisk', az: 'AstraZeneca', roche: 'Hoffmann-La Roche', boehringer: 'Boehringer Ingelheim',
  };
  const GENERIC = new Set(['pharma', 'pharmaceuticals', 'therapeutics', 'inc', 'corp', 'company', 'group', 'holdings', 'biosciences', 'bio', 'labs', 'and']);

  function steps(list) {
    const el = $('#prospect-steps');
    el.hidden = false;
    el.innerHTML = list.map((s) => `<li class="${s.state}"><span class="st"></span><span>${esc(s.text)}</span></li>`).join('');
  }

  async function runProspect(choice) {
    const raw = $('#prospect-input').value.trim().replace(/\s+/g, ' ');
    if (raw.length < 2) return;
    const key = raw.toLowerCase();
    const clar = $('#prospect-clarify');
    if (!choice && AMBIGUOUS[key]) {
      clar.hidden = false;
      clar.innerHTML = `"${esc(raw)}" could mean more than one company. Which one?<div class="chips">${AMBIGUOUS[key].map((o, i) => `<button type="button" class="btn btn-small" data-amb="${i}">${esc(o.label)}</button>`).join('')}</div>`;
      $$('[data-amb]', clar).forEach((b) => b.addEventListener('click', () => runProspect(AMBIGUOUS[key][Number(b.dataset.amb)])));
      return;
    }
    clar.hidden = true;
    const display = choice ? choice.display : raw;
    const sponsor = choice ? choice.sponsor : ALIASES[key] || raw;
    const terms = choice
      ? choice.terms
      : [raw, sponsor, ...raw.split(/\s+/).filter((t) => t.length >= 4 && !GENERIC.has(t.toLowerCase()))];
    const btn = $('#prospect-btn');
    const out = $('#prospect-out');
    btn.disabled = true;
    out.innerHTML = '';
    const st = [
      { text: `Look up ${sponsor} on ClinicalTrials.gov and openFDA`, state: 'run' },
      { text: 'Scan the live feed for matching headlines', state: 'wait' },
      { text: 'Write the brief', state: 'wait' },
    ];
    steps(st);

    let reg;
    try {
      reg = (await api('/api/company?name=' + encodeURIComponent(sponsor), { timeout: 20000 })).data;
      const tN = reg.trials && !reg.trials.error ? reg.trials.activeTotal : null;
      const fN = reg.fda && !reg.fda.error ? reg.fda.originals.length : null;
      st[0] = { text: `Registries: ${tN == null ? 'trials unavailable' : fmtInt(tN) + ' active trials'} · ${fN == null ? 'FDA unavailable' : fN + ' original FDA approvals (24 mo)'}`, state: 'done' };
    } catch (e) {
      st[0] = { text: 'Registry lookup failed: ' + e.message, state: 'fail' };
      reg = { trials: { error: e.message }, fda: { error: e.message } };
    }
    const re = new RegExp('(^|[^a-z0-9])(' + [...new Set(terms)].map(reEsc).join('|') + ')($|[^a-z0-9])', 'i');
    const news = ((state.news && state.news.items) || []).filter((it) => re.test(it.title)).slice(0, 10);
    st[1] = { text: `${news.length} matching headline${news.length === 1 ? '' : 's'} in the feed`, state: 'done' };
    st[2].state = 'run';
    steps(st);
    out.innerHTML = registryHtml(display, reg, news);

    try {
      const { data } = await api('/api/ai', {
        method: 'POST',
        timeout: 30000,
        body: {
          task: 'prospect',
          input: {
            company: display,
            profile: profilePayload(),
            data: {
              trials: reg.trials && !reg.trials.error ? reg.trials : {},
              fda: reg.fda && !reg.fda.error ? reg.fda : {},
              news: news.map((n) => ({ title: n.title, source: n.source, date: n.date })),
            },
          },
        },
      });
      st[2] = { text: `Brief written (${data.model || 'AI'}${data.cached ? ', cached' : ''})`, state: 'done' };
      steps(st);
      out.insertAdjacentHTML('afterbegin', prospectHtml(display, data, news));
      const md = prospectMarkdown(display, data.result, reg, news);
      $('#pb-copy').addEventListener('click', (ev) => copyText(md, ev.currentTarget));
      $('#pb-dl').addEventListener('click', () => download(`${display.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-account-brief.md`, md));
    } catch (e) {
      st[2] = { text: 'AI step failed (registry data below is still valid)', state: 'fail' };
      steps(st);
      out.insertAdjacentHTML('afterbegin', aiErrorHtml(e));
    } finally {
      btn.disabled = false;
    }
  }

  const PHASE_ORDER = ['EARLY_PHASE1', 'PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'NA'];
  const PHASE_COL = { EARLY_PHASE1: '#4fd1c5', PHASE1: '#6c9bff', PHASE2: '#a78bfa', PHASE3: '#00e5b0', PHASE4: '#f5c542', NA: '#5f7b94' };
  const phaseName = (p) => ({ EARLY_PHASE1: 'Early Ph1', PHASE1: 'Ph1', PHASE2: 'Ph2', PHASE3: 'Ph3', PHASE4: 'Ph4', NA: 'N/A' })[p] || p;

  function shortList(arr, n = 2) {
    const a = (arr || []).map((x) => (x.length > 40 ? x.slice(0, 38) + '…' : x));
    if (!a.length) return 'n/a';
    return a.slice(0, n).join('; ') + (a.length > n ? ` +${a.length - n} more` : '');
  }

  function registryHtml(display, reg, news) {
    const t = reg.trials || {};
    const f = reg.fda || {};
    const phases = t.phases || {};
    const tot = Object.values(phases).reduce((a, b) => a + b, 0) || 1;
    const phaseBar = PHASE_ORDER.filter((p) => phases[p]).map((p) => `<span style="width:${(phases[p] / tot) * 100}%;background:${PHASE_COL[p]}" title="${phaseName(p)}: ${phases[p]}"></span>`).join('');
    const legend = PHASE_ORDER.filter((p) => phases[p]).map((p) => `<span><i style="background:${PHASE_COL[p]}"></i>${phaseName(p)} ${phases[p]}</span>`).join('');
    const trialsBlock = t.error
      ? `<p class="err">${esc(t.error)}</p>`
      : t.activeTotal
        ? `<div class="phase-bar">${phaseBar}</div><div class="phase-legend">${legend}</div>
           <p class="muted" style="margin:6px 0 4px;font-size:11px">Phase mix of the ${t.sampled} most recently updated trials. Matched sponsors: ${esc(shortList(t.sponsorNames))}</p>
           ${(t.topConditions || []).length ? `<p style="font-size:11px"><b>Top conditions:</b> ${esc(t.topConditions.map((c) => `${c.name} (${c.n})`).join(', '))}</p>` : ''}
           ${(t.recent || []).map((r) => `<div class="mini"><a href="https://clinicaltrials.gov/study/${esc(encodeURIComponent(r.nct))}" target="_blank" rel="noopener noreferrer"><code>${esc(r.nct)}</code></a> ${esc((r.phases || []).map(phaseName).join('/'))} · ${esc(r.title)}</div>`).join('')}`
        : `<p class="muted">No active trials found with "${esc(display)}" as lead sponsor. Try the exact registry name (e.g. "Hoffmann-La Roche", "Janssen").</p>`;
    const fdaBlock = f.error
      ? `<p class="err">${esc(f.error)}</p>`
      : (f.originals || []).length
        ? f.originals.map((a) => `<div class="mini"><a href="${esc(safeUrl(a.url) || '#')}" target="_blank" rel="noopener noreferrer">${esc(a.brand || a.application)}</a> ${a.ingredient ? `(${esc(a.ingredient.toLowerCase())})` : ''} · ${esc(longDate(a.date))}${a.type ? ' · ' + esc(a.type) : ''}</div>`).join('') + `<p class="muted" style="font-size:11px;margin-top:4px">${fmtInt(f.supplements)} supplemental approvals in the same period. Matched: ${esc(shortList(f.matchedSponsors))}</p>`
        : `<p class="muted">No original NDA/BLA approvals for this sponsor name in openFDA over the last 24 months.${f.supplements ? ` ${fmtInt(f.supplements)} supplemental approvals.` : ''}</p>`;
    const newsBlock = news.length
      ? news.map((n) => `<div class="mini"><a href="${esc(safeUrl(n.link) || '#')}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a> <span class="muted">· ${esc(n.source)} · ${esc(timeAgo(n.date))}</span></div>`).join('')
      : '<p class="muted">No headlines about this company in the current feed.</p>';
    return `
      <div class="facts">
        <div class="fact"><b>${t.error ? '—' : fmtInt(t.activeTotal)}</b><span>Active trials</span></div>
        <div class="fact"><b>${f.error ? '—' : fmtInt((f.originals || []).length)}</b><span>FDA originals 24m</span></div>
        <div class="fact"><b>${fmtInt(news.length)}</b><span>Headlines</span></div>
      </div>
      <div class="card"><div class="card-hd">ClinicalTrials.gov · lead sponsor portfolio</div>${trialsBlock}</div>
      <div class="card"><div class="card-hd amber">openFDA · approvals, last 24 months</div>${fdaBlock}</div>
      <div class="card"><div class="card-hd blue">Feed headlines</div>${newsBlock}</div>`;
  }

  function prospectHtml(display, data, news) {
    const r = data.result;
    const ul = (a) => (a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">Nothing returned.</p>');
    const newsItems = r.news.length ? `<ul>${r.news.map((n) => `<li>${esc(n.text)}${refLinks(n.sources, news)}</li>`).join('')}</ul>` : '';
    return `<div id="pb-ai">
      <div class="meta-line"><span class="flag">AI-GENERATED</span><span>confidence: ${esc(r.confidence)}</span><span>${esc(data.model || '')}</span><span>${esc(timeAgo(data.generatedAt))}${data.cached ? ' · cached' : ''}</span>
        <button type="button" class="act" id="pb-copy">Copy</button><button type="button" class="act" id="pb-dl">Download .md</button></div>
      <div class="card"><div class="card-hd">01 · ${esc(display)} at a glance</div><p class="lead">${esc(r.summary)}</p></div>
      <div class="card"><div class="card-hd">02 · Pipeline signals <span class="right">from ClinicalTrials.gov</span></div>${ul(r.pipeline)}</div>
      <div class="card"><div class="card-hd amber">03 · Regulatory <span class="right">from openFDA</span></div>${ul(r.regulatory)}</div>
      ${newsItems ? `<div class="card"><div class="card-hd blue">04 · In the news</div>${newsItems}</div>` : ''}
      <div class="card"><div class="card-hd">05 · Discovery questions</div>${ul(r.questions)}</div>
      <div class="card pitch"><div class="card-hd red">&#9670; ${esc(state.profile.firm || 'Your')} angle · ${esc(r.angle.title)}</div><p>${esc(r.angle.pitch)}</p>
        <div class="hooks">${r.angle.hooks.map((h, i) => `<span class="hook${i < 2 ? ' hot' : ''}">${esc(h)}</span>`).join('')}</div></div>
      ${r.background.length ? `<div class="card"><div class="card-hd blue">Background <span class="flag">MODEL KNOWLEDGE · MAY BE OUTDATED</span></div>${ul(r.background)}</div>` : ''}
      <h3 class="sect">Source data</h3>
    </div>`;
  }

  function prospectMarkdown(display, r, reg, news) {
    const L = [`# Account brief: ${display}`, `_Generated by BioPulse on ${new Date().toLocaleDateString('en-GB')}. AI-written from registry data and headlines; verify before use._`, '', r.summary, ''];
    const sec = (title, arr) => {
      if (!arr.length) return;
      L.push(`## ${title}`, ...arr.map((x) => `- ${x}`), '');
    };
    sec('Pipeline signals (ClinicalTrials.gov)', r.pipeline);
    sec('Regulatory (openFDA)', r.regulatory);
    if (r.news.length) sec('In the news', r.news.map((n) => n.text + ' ' + n.sources.map((s) => `[${s}]`).join('')));
    sec('Discovery questions', r.questions);
    L.push(`## Angle: ${r.angle.title}`, r.angle.pitch, '', r.angle.hooks.map((h) => `\`${h}\``).join(' '), '');
    sec('Background (model knowledge, may be outdated)', r.background);
    const t = reg.trials || {};
    if (t.recent && t.recent.length) {
      L.push('## Recently updated trials');
      t.recent.forEach((x) => L.push(`- [${x.nct}](https://clinicaltrials.gov/study/${x.nct}) ${x.title}`));
      L.push('');
    }
    if (news.length) {
      L.push('## Headline sources');
      news.forEach((n, i) => L.push(`${i + 1}. [${n.title}](${n.link}) (${n.source})`));
    }
    return L.join('\n');
  }

  // ── Events ────────────────────────────────────────────────────────────────
  const profileKey = () => hash(JSON.stringify(profilePayload()));
  const fitKey = (id) => `bp:fit:${id}:${profileKey()}`;

  function daysTo(iso) {
    const start = Date.parse(iso + 'T00:00:00Z');
    return Math.ceil((start - Date.now()) / 86400000);
  }

  async function loadEvents() {
    try {
      const r = await fetch('data/conferences.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      state.events = d.events.slice().sort((a, b) => a.start.localeCompare(b.start));
      renderEvents();
      $('#events-status').innerHTML = `<span>${esc(d.note.replace("on the 'updated' date", 'on ' + longDate(d.updated)))}</span>`;
    } catch (e) {
      $('#events-grid').innerHTML = `<div class="empty err" style="padding:12px">Couldn't load events: ${esc(e.message)}</div>`;
    }
  }

  function renderEvents() {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = state.events.filter((e) => e.end >= today);
    $('#events-meta').textContent = `${upcoming.length} upcoming`;
    $('#events-grid').innerHTML = state.events
      .map((e) => {
        const fit = store.get(fitKey(e.id));
        const d = daysTo(e.start);
        const ended = e.end < today;
        const when = ended ? 'Ended' : d <= 0 ? 'Happening now' : d === 1 ? 'Tomorrow' : `in ${d} days`;
        const v = fit ? fit.verdict : null;
        return `<button type="button" class="ev ${v ? 'v-' + v : ''}${state.activeEvent === e.id ? ' active' : ''}${ended ? ' past' : ''}" data-ev="${esc(e.id)}" aria-expanded="${state.activeEvent === e.id}">
          <span class="ev-top"><span>${esc(longDate(e.start))} – ${esc(longDate(e.end))}</span><span class="${d > 0 && d <= 45 ? 'soon' : ''}">${esc(when)}</span></span>
          <span class="ev-name">${esc(e.name)}</span>
          <span class="ev-city">&#9679; ${esc(e.city)}</span>
          <span class="ev-tags">${e.focus.map((t) => `<span class="ev-tag">${esc(t)}</span>`).join('')}${v ? `<span class="ev-verdict ${v}">${v.toUpperCase()} · ${fit.score}</span>` : '<span class="ev-verdict none">NOT ASSESSED</span>'}</span>
        </button>`;
      })
      .join('');
    if (state.activeEvent) renderDrawer(state.activeEvent);
  }

  function renderDrawer(id) {
    const e = state.events.find((x) => x.id === id);
    const dr = $('#event-drawer');
    if (!e) {
      dr.hidden = true;
      return;
    }
    const fit = store.get(fitKey(e.id));
    const ul = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    dr.hidden = false;
    dr.innerHTML = `
      <div>
        <h3>${esc(e.name)}</h3>
        <p>${esc(longDate(e.start))} – ${esc(longDate(e.end))} · ${esc(e.city)}</p>
        <div class="lbl">Audience</div><p>${esc(e.audience)}</p>
        <p class="muted" style="font-size:11px;margin-top:8px">Date source: ${esc(e.dateSource)}</p>
        <div class="actions">
          <a class="btn" href="${esc(safeUrl(e.url) || '#')}" target="_blank" rel="noopener noreferrer">Official site ↗</a>
          <button type="button" class="btn btn-primary" id="ev-assess">${fit ? '↺ Re-assess fit' : '▶ Assess fit'}</button>
          <button type="button" class="btn" id="ev-close">Close</button>
        </div>
      </div>
      <div id="ev-fit-a">${fit ? `<div class="lbl">Verdict <span class="flag">AI ASSESSMENT</span></div><p><b class="ev-verdict ${fit.verdict}">${fit.verdict.toUpperCase()}</b> · fit score ${fit.score}/100 for ${esc(state.profile.firm || 'your firm')}</p><div class="lbl">Why</div>${ul(fit.reasons)}<div class="lbl">Risks</div>${ul(fit.risks)}` : '<div class="lbl">Fit</div><p class="muted">Not assessed yet. The assessment uses your firm profile from Settings and only the audience and focus above. It does not claim specific sponsors or speakers.</p>'}</div>
      <div id="ev-fit-b">${fit ? `<div class="lbl">Angles</div>${ul(fit.angles)}<div class="lbl">Who to meet</div>${ul(fit.targets)}` : ''}</div>`;
    $('#ev-assess').addEventListener('click', () => assessEvent(e.id, true));
    $('#ev-close').addEventListener('click', () => {
      state.activeEvent = null;
      dr.hidden = true;
      renderEvents();
    });
  }

  async function assessEvent(id, interactive) {
    const e = state.events.find((x) => x.id === id);
    if (!e) return null;
    const btn = interactive ? $('#ev-assess') : null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⟳ Assessing…';
    }
    try {
      const { data } = await api('/api/ai', {
        method: 'POST',
        timeout: 30000,
        body: { task: 'eventFit', input: { profile: profilePayload(), event: { name: e.name, dates: `${e.start} to ${e.end}`, city: e.city, focus: e.focus, audience: e.audience } } },
      });
      store.set(fitKey(e.id), data.result);
      renderEvents();
      return data.result;
    } catch (err) {
      if (interactive) {
        const a = $('#ev-fit-a');
        if (a) a.innerHTML = aiErrorHtml(err);
        if (btn) {
          btn.disabled = false;
          btn.textContent = '▶ Assess fit';
        }
      }
      throw err;
    }
  }

  async function assessAll() {
    const btn = $('#events-assess-all');
    const today = new Date().toISOString().slice(0, 10);
    const todo = state.events.filter((e) => e.end >= today && !store.get(fitKey(e.id)));
    if (!todo.length) {
      $('#events-meta').textContent = 'All upcoming events assessed for this profile';
      return;
    }
    btn.disabled = true;
    try {
      for (let i = 0; i < todo.length; i++) {
        btn.textContent = `⟳ ${i + 1}/${todo.length}`;
        await assessEvent(todo[i].id, false);
      }
      $('#events-meta').textContent = `Assessed ${todo.length} events`;
    } catch (e) {
      $('#events-meta').textContent = 'Stopped: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '▶ Assess fit for all';
    }
  }

  // ── Health check ──────────────────────────────────────────────────────────
  async function checkBackend() {
    if (backendMissing()) {
      showBanner('This copy is hosted on GitHub Pages and is not connected to its backend yet. Open <b>Settings</b> and paste your Netlify site URL, or set <code>apiBase</code> in <code>assets/config.js</code>.');
      setHealth('backend', 'Backend', 'bad', 'not configured');
      return false;
    }
    try {
      const { data } = await api('/api/health', { timeout: 10000 });
      showBanner(null);
      setHealth('ai', 'AI (Groq)', data.ai.configured ? 'ok' : 'bad', data.ai.configured ? data.ai.model : 'GROQ_API_KEY not set');
      return true;
    } catch (e) {
      showBanner(`Can't reach the BioPulse backend at <code>${esc(apiBase() || location.origin)}</code> (${esc(e.message)}). Panels will show saved copies where available.`);
      setHealth('backend', 'Backend', 'bad', e.message);
      return false;
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  function openSettings() {
    $('#set-firm').value = state.profile.firm;
    $('#set-offering').value = state.profile.offering;
    $('#set-focus').value = state.profile.focus;
    $('#set-tickers').value = state.tickers.join(', ');
    $('#set-api').value = store.get('bp:apiBase') || '';
    $('#settings-dialog').showModal();
  }
  function saveSettings() {
    state.profile = {
      firm: $('#set-firm').value.trim().slice(0, 80),
      offering: $('#set-offering').value.trim().slice(0, 500) || DEFAULT_PROFILE.offering,
      focus: $('#set-focus').value.trim().slice(0, 200) || DEFAULT_PROFILE.focus,
    };
    store.set('bp:profile', state.profile);
    const t = $('#set-tickers')
      .value.toUpperCase()
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^\^?[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(s));
    const prevTickers = state.tickers.join(',');
    state.tickers = [...new Set(t)].slice(0, 16);
    store.set('bp:tickers', state.tickers);
    const api0 = store.get('bp:apiBase') || '';
    const apiNew = $('#set-api').value.trim().replace(/\/+$/, '');
    if (apiNew && !safeUrl(apiNew)) {
      alertInline('API base must be a full https:// URL.');
      return false;
    }
    if (apiNew) store.set('bp:apiBase', apiNew);
    else store.del('bp:apiBase');
    renderEvents();
    if (apiNew !== api0) refreshAll();
    else if (prevTickers !== state.tickers.join(',')) loadQuotes();
    return true;
  }
  function alertInline(msg) {
    let n = $('#settings-msg');
    if (!n) {
      n = document.createElement('p');
      n.id = 'settings-msg';
      n.className = 'err';
      n.style.marginTop = '10px';
      $('#settings-form .dialog-actions').before(n);
    }
    n.textContent = msg;
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  function switchTab(name) {
    ['brief', 'prospect'].forEach((t) => {
      const on = t === name;
      const tab = $('#tab-' + t);
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      const pane = $('#pane-' + t);
      pane.classList.toggle('show', on);
      pane.hidden = !on;
    });
  }

  function wire() {
    $('#tab-brief').addEventListener('click', () => switchTab('brief'));
    $('#tab-prospect').addEventListener('click', () => switchTab('prospect'));
    $('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const next = $('#tab-brief').classList.contains('active') ? 'prospect' : 'brief';
      switchTab(next);
      $('#tab-' + next).focus();
    });
    $('#watch-add').addEventListener('click', addWatch);
    $('#watch-input').addEventListener('keydown', (e) => e.key === 'Enter' && addWatch());
    $('#watch-chips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      state.watchlist.splice(Number(b.dataset.i), 1);
      store.set('bp:watchlist', state.watchlist);
      renderWatch();
      renderNews();
    });
    $('#brief-btn').addEventListener('click', generateBrief);
    $('#prospect-form').addEventListener('submit', (e) => {
      e.preventDefault();
      runProspect();
    });
    $$('.qbtn').forEach((b) =>
      b.addEventListener('click', () => {
        $('#prospect-input').value = b.dataset.co;
        runProspect();
      }),
    );
    $('#news-search').addEventListener('input', (e) => {
      state.newsQuery = e.target.value.trim();
      renderNews();
    });
    $('#news-filters').addEventListener('click', (e) => {
      const b = e.target.closest('.fchip');
      if (!b) return;
      state.newsFilter = b.dataset.f;
      $$('.fchip').forEach((x) => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      renderNews();
    });
    $$('.seg-btn').forEach((b) =>
      b.addEventListener('click', () => {
        state.heatMetric = b.dataset.heat;
        $$('.seg-btn').forEach((x) => {
          x.classList.toggle('active', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        });
        renderHeat();
      }),
    );
    $('#events-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.ev');
      if (!card) return;
      state.activeEvent = state.activeEvent === card.dataset.ev ? null : card.dataset.ev;
      renderEvents();
      if (!state.activeEvent) $('#event-drawer').hidden = true;
      else $('#event-drawer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('#events-assess-all').addEventListener('click', assessAll);
    $('#settings-btn').addEventListener('click', openSettings);
    $('#settings-cancel').addEventListener('click', () => $('#settings-dialog').close());
    $('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (saveSettings()) $('#settings-dialog').close();
    });
    $('#settings-reset').addEventListener('click', () => {
      $('#set-firm').value = DEFAULT_PROFILE.firm;
      $('#set-offering').value = DEFAULT_PROFILE.offering;
      $('#set-focus').value = DEFAULT_PROFILE.focus;
      $('#set-tickers').value = DEFAULT_TICKERS.join(', ');
      $('#set-api').value = '';
    });
    $('#health-btn').addEventListener('click', () => {
      renderHealthDialog();
      $('#health-dialog').showModal();
    });
    $('#health-close').addEventListener('click', () => $('#health-dialog').close());
    $('#health-refresh').addEventListener('click', () => {
      $('#health-dialog').close();
      refreshAll();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastRefresh.news > 10 * 60000) loadNews();
    });
  }

  const lastRefresh = { news: 0 };
  async function refreshAll() {
    state.health = {};
    const ok = await checkBackend();
    if (!ok && backendMissing()) {
      ['#news-feed', '#fda-list', '#tickers', '#heat-bars', '#deal-list'].forEach((s) => ($(s).innerHTML = '<div class="empty">Waiting for backend connection.</div>'));
      $('#ticker-track').innerHTML = '<span class="ticker-empty">Backend not connected.</span>';
      return;
    }
    lastRefresh.news = Date.now();
    await Promise.allSettled([loadNews(), loadAreas(), loadCountries(), loadFda(), loadQuotes()]);
  }

  function every(ms, fn) {
    setInterval(() => {
      if (!document.hidden && !backendMissing()) fn();
    }, ms);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    tickClock();
    setInterval(tickClock, 15000);
    wire();
    renderWatch();
    initMap();
    loadEvents();
    refreshAll();
    every(10 * 60000, () => {
      lastRefresh.news = Date.now();
      loadNews();
    });
    every(5 * 60000, loadQuotes);
    every(3 * 3600000, loadFda);
    every(6 * 3600000, () => {
      loadAreas();
      loadCountries();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Exposed for tests only.
  window.__biopulse = { state, esc, safeUrl };
})();
