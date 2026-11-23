// Event planner: 2027 conferences with AI fit scoring against the firm profile.
import { $, esc, safeUrl, longDate, hash, local } from './util.js';
import { api } from './api.js';
import { profilePayload, profile } from './ws.js';
import { aiErrorHtml } from './ai.js';

export const E = { events: [], note: '', updated: '', active: null };

const fitKey = (id) => `bp:fit:${id}:${hash(JSON.stringify(profilePayload()))}`;
export const fitFor = (id) => local.get(fitKey(id));
const daysTo = (iso) => Math.ceil((Date.parse(iso + 'T00:00:00Z') - Date.now()) / 86400000);

export async function loadEvents() {
  if (E.events.length) return E.events;
  try {
    const r = await fetch('data/conferences.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    E.events = d.events.slice().sort((a, b) => a.start.localeCompare(b.start));
    E.note = d.note;
    E.updated = d.updated;
  } catch (e) {
    E.error = e.message;
  }
  return E.events;
}

export function upcoming(days = 60) {
  const today = new Date().toISOString().slice(0, 10);
  return E.events.filter((e) => e.end >= today && daysTo(e.start) <= days);
}

export function whenLabel(e) {
  const today = new Date().toISOString().slice(0, 10);
  const d = daysTo(e.start);
  if (e.end < today) return 'Ended';
  if (d <= 0) return 'Happening now';
  return d === 1 ? 'Tomorrow' : `in ${d} days`;
}

export function renderEvents() {
  const grid = $('#events-grid');
  if (!grid) return;
  if (E.error) {
    grid.innerHTML = `<div class="empty err" style="padding:12px">Couldn't load events: ${esc(E.error)}</div>`;
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  $('#events-meta').textContent = `${E.events.filter((e) => e.end >= today).length} upcoming`;
  grid.innerHTML = E.events
    .map((e) => {
      const fit = fitFor(e.id);
      const d = daysTo(e.start);
      const v = fit ? fit.verdict : null;
      return `<button type="button" class="ev ${v ? 'v-' + v : ''}${E.active === e.id ? ' active' : ''}${e.end < today ? ' past' : ''}" data-ev="${esc(e.id)}" aria-expanded="${E.active === e.id}">
        <span class="ev-top"><span>${esc(longDate(e.start))} – ${esc(longDate(e.end))}</span><span class="${d > 0 && d <= 45 ? 'soon' : ''}">${esc(whenLabel(e))}</span></span>
        <span class="ev-name">${esc(e.name)}</span>
        <span class="ev-city">&#9679; ${esc(e.city)}</span>
        <span class="ev-tags">${e.focus.map((t) => `<span class="ev-tag">${esc(t)}</span>`).join('')}${v ? `<span class="ev-verdict ${v}">${v.toUpperCase()} · ${fit.score}</span>` : '<span class="ev-verdict none">NOT ASSESSED</span>'}</span>
      </button>`;
    })
    .join('');
  $('#events-status').innerHTML = `<span>${esc((E.note || '').replace("on the 'updated' date", 'on ' + longDate(E.updated)))}</span>`;
  if (E.active) renderDrawer(E.active);
  else $('#event-drawer').hidden = true;
}

function renderDrawer(id) {
  const e = E.events.find((x) => x.id === id);
  const dr = $('#event-drawer');
  if (!e) {
    dr.hidden = true;
    return;
  }
  const fit = fitFor(e.id);
  const ul = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const firm = profile().firm || 'your firm';
  dr.hidden = false;
  dr.innerHTML = `
    <div><h3>${esc(e.name)}</h3><p>${esc(longDate(e.start))} – ${esc(longDate(e.end))} · ${esc(e.city)}</p>
      <div class="lbl">Audience</div><p>${esc(e.audience)}</p>
      <p class="muted small">Date source: ${esc(e.dateSource)}</p>
      <div class="actions"><a class="btn" href="${esc(safeUrl(e.url) || '#')}" target="_blank" rel="noopener noreferrer">Official site ↗</a>
      <button type="button" class="btn btn-primary" id="ev-assess">${fit ? '↺ Re-assess fit' : '▶ Assess fit'}</button>
      <button type="button" class="btn" id="ev-close">Close</button></div></div>
    <div id="ev-fit-a">${fit ? `<div class="lbl">Verdict <span class="flag">AI ASSESSMENT</span></div><p><b class="ev-verdict ${fit.verdict}">${fit.verdict.toUpperCase()}</b> · fit score ${fit.score}/100 for ${esc(firm)}</p><div class="lbl">Why</div>${ul(fit.reasons)}<div class="lbl">Risks</div>${ul(fit.risks)}` : '<div class="lbl">Fit</div><p class="muted">Not assessed yet. The assessment uses your firm profile from Settings and only the audience and focus above. It does not claim specific sponsors or speakers.</p>'}</div>
    <div id="ev-fit-b">${fit ? `<div class="lbl">Angles</div>${ul(fit.angles)}<div class="lbl">Who to meet</div>${ul(fit.targets)}` : ''}</div>`;
  $('#ev-assess').addEventListener('click', () => assess(e.id, true));
  $('#ev-close').addEventListener('click', () => {
    E.active = null;
    renderEvents();
  });
}

async function assess(id, interactive) {
  const e = E.events.find((x) => x.id === id);
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
    local.set(fitKey(e.id), data.result);
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
  const todo = E.events.filter((e) => e.end >= today && !fitFor(e.id));
  if (!todo.length) {
    $('#events-meta').textContent = 'All upcoming events assessed for this profile';
    return;
  }
  btn.disabled = true;
  try {
    for (let i = 0; i < todo.length; i++) {
      btn.textContent = `⟳ ${i + 1}/${todo.length}`;
      await assess(todo[i].id, false);
    }
    $('#events-meta').textContent = `Assessed ${todo.length} events`;
  } catch (e) {
    $('#events-meta').textContent = 'Stopped: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Assess fit for all';
  }
}

export function wireEvents() {
  $('#events-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.ev');
    if (!card) return;
    E.active = E.active === card.dataset.ev ? null : card.dataset.ev;
    renderEvents();
    if (E.active) $('#event-drawer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#events-assess-all').addEventListener('click', assessAll);
}
