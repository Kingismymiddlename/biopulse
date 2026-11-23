// This week, Accounts, Account panel, Settings and Onboarding.
import { $, $$, esc, safeUrl, fmtInt, timeAgo, longDate, shortDate, reEsc, toast, copyText, download, csvCell, emit, local } from './util.js';
import { api, apiBase, backendMissing } from './api.js';
import {
  S, STAGES, FAMILIES, TYPE_META, DEFAULT_PROFILE, DEFAULT_TICKERS, profile, profilePayload, readOnly, demoGuard,
  addAccounts, removeAccount, setStage, updateAccount, vote, northStar, scoreAccounts, isNew, accountMatcher,
  loadPacks, save, workspaceLink, deleteWorkspace, createWorkspace, startDemo, buildHash, openWorkspace, shortName,
} from './ws.js';
import { M } from './market.js';
import { E, upcoming, whenLabel } from './events.js';
import { aiErrorHtml, refLinks } from './ai.js';

export const V = { family: 'all', hideNotFit: true, panel: null, composeSignal: null };

const bandCls = (b) => ({ Hot: 'band-hot', Warm: 'band-warm', Cool: 'band-cool', Quiet: 'band-quiet' })[b] || 'band-quiet';
const typeCls = (t) => (TYPE_META[t] || TYPE_META.mention).cls;
const familyOf = (t) => (TYPE_META[t] || TYPE_META.mention).family;
const stageSelect = (a, extra = '') =>
  `<select class="stage-sel" data-stage="${esc(a.id)}" aria-label="Stage for ${esc(a.name)}" ${readOnly() ? 'title="Demo: create a workspace to track stages"' : ''} ${extra}>${STAGES.map((s) => `<option${s === a.stage ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>`;

function signalLine(s, { compact = false } = {}) {
  const url = safeUrl(s.url);
  return `<div class="sig${compact ? ' compact' : ''}">
    <span class="badge ${typeCls(s.type)}">${esc(s.label)}</span>${isNew(s) ? '<span class="badge b-new">NEW</span>' : ''}
    <a href="${esc(url || '#')}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>
    <span class="sig-meta">${esc(s.source)} · ${esc(timeAgo(s.date))}</span></div>`;
}

// ── This week ───────────────────────────────────────────────────────────────
export function renderWeek() {
  const el = $('#view-week');
  if (!S.ws) {
    el.innerHTML = `<div class="hero"><h1>Know which accounts to call this week, and why.</h1>
      <p>BioPulse reads FDA, ClinicalTrials.gov and 8 trade feeds for each of your accounts, scores what changed, and drafts a sourced first message.</p>
      <div class="row-gap"><button class="btn btn-primary" type="button" data-act="onboard">Set up my accounts</button><button class="btn" type="button" data-act="demo">Try the demo</button></div></div>`;
    return;
  }
  const accts = S.ws.accounts;
  if (!accts.length) {
    el.innerHTML = `<div class="hero"><h1>Add your accounts to start.</h1><p>Add them one by one, paste a list, or start from a pack of large pharma, obesity players, cell and gene therapy companies or CROs.</p>
      <div class="row-gap"><a class="btn btn-primary" href="${esc(buildHash({ view: 'accounts' }))}">Add accounts</a></div></div>`;
    return;
  }
  const scored = accts.map((a) => ({ a, r: S.scores[a.id] }));
  const withSig = scored.filter((x) => x.r && x.r.signals.some((s) => s.type !== 'mention'));
  const newCount = scored.filter((x) => x.r && x.r.signals.some((s) => s.type !== 'mention' && isNew(s))).length;
  let rows = scored
    .filter((x) => !(V.hideNotFit && x.a.stage === 'Not a fit'))
    .sort((x, y) => (y.r?.score ?? -1) - (x.r?.score ?? -1) || x.a.name.localeCompare(y.a.name));
  if (V.family !== 'all') rows = rows.filter((x) => x.r && x.r.signals.some((s) => familyOf(s.type) === V.family));

  const today = new Date();
  const since = S.prevSeenAt ? `since your last visit (${longDate(S.prevSeenAt)})` : '';
  const summary = `<b>${withSig.length}</b> of ${accts.length} accounts have signals in the last 30 days${newCount && since ? `, <b>${newCount}</b> new ${esc(since)}` : ''}.`;

  // Lead with accounts that have a real trigger; fold the rest into one quiet group.
  const hasTrigger = (x) => !x.r || x.r.signals.some((s) => s.type !== 'mention');
  const quiet = rows.filter((x) => !hasTrigger(x));
  rows = rows.filter(hasTrigger);
  const quietHtml = quiet.length
    ? `<details class="quiet"><summary>${quiet.length} account${quiet.length === 1 ? '' : 's'} with no triggers this week</summary><ul>${quiet
        .map(({ a, r }) => `<li><button type="button" class="acct-name small-name" data-open="${esc(a.id)}">${esc(a.name)}</button><span class="muted small">${r.signals.length ? `${r.signals.length} mention${r.signals.length === 1 ? '' : 's'} in the news` : 'nothing in 30 days'}</span><span class="score-pill ${bandCls(r.band)}">${r.score}</span></li>`)
        .join('')}</ul></details>`
    : '';
  const cards = rows.length
    ? rows
        .map(({ a, r }, i) => {
          if (!r) {
            return `<article class="acard loading" aria-busy="true"><div class="acard-main"><span class="rank">${i + 1}</span><div class="acard-body"><div class="acard-head"><button type="button" class="acct-name" data-open="${esc(a.id)}">${esc(a.name)}</button></div><div class="skel"></div><div class="skel short"></div></div></div></article>`;
          }
          const sigs = r.signals.filter((s) => s.type !== 'mention' && (V.family === 'all' || familyOf(s.type) === V.family));
          const top = (sigs.length ? sigs : r.signals).slice(0, 2);
          const failed = Object.entries(r.sources || {}).filter(([, ok]) => !ok).map(([k]) => ({ news: 'news', trials: 'ClinicalTrials.gov', fda: 'openFDA' })[k]);
          return `<article class="acard">
            <div class="acard-main"><span class="rank">${i + 1}</span>
              <div class="acard-body">
                <div class="acard-head"><button type="button" class="acct-name" data-open="${esc(a.id)}">${esc(a.name)}</button>${stageSelect(a)}</div>
                ${top.length ? top.map((s) => signalLine(s)).join('') : `<p class="muted small">Nothing in the last 30 days. Registry data is still on the account page.</p>`}
                ${failed.length ? `<p class="warn small">Partial: ${esc(failed.join(', '))} unavailable for this account.</p>` : ''}
              </div>
              <div class="acard-score" title="Heuristic score from ${r.signals.length} signals. Click for the breakdown.">
                <button type="button" class="score ${bandCls(r.band)}" data-open="${esc(a.id)}" aria-label="${esc(a.name)} score ${r.score}, ${r.band}"><b>${r.score}</b><span>${esc(r.band)}</span></button>
              </div>
            </div>
            <div class="acard-actions">
              <button type="button" class="btn btn-small" data-open="${esc(a.id)}">Open account</button>
              ${top.some((s) => s.type !== 'mention') ? `<button type="button" class="btn btn-small btn-primary" data-compose="${esc(a.id)}" data-sig="${esc(top.find((s) => s.type !== 'mention').id)}">Draft outreach</button>` : ''}
            </div>
          </article>`;
        })
        .join('')
    : `<div class="empty">No accounts have ${V.family === 'all' ? 'trigger' : esc(FAMILIES.find((f) => f.id === V.family)?.label.toLowerCase() || '')} signals right now.</div>`;

  el.innerHTML = `
    <div class="page-hd">
      <div><h1>This week</h1><p class="muted">${today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${summary}</p></div>
      <div class="row-gap">
        <button type="button" class="btn" data-act="rescore" ${S.scoring ? 'disabled' : ''}>${S.scoring ? '⟳ Scoring…' : '↻ Refresh scores'}</button>
        <button type="button" class="btn" data-act="csv">Export CSV</button>
      </div>
    </div>
    ${readOnly() ? `<div class="notice">You're viewing the demo with 12 large pharma accounts, scored live. <button type="button" class="linkish" data-act="onboard">Create your own workspace</button> to track your accounts.</div>` : ''}
    ${S.scoreError ? `<div class="notice warn">Some accounts could not be scored: ${esc(S.scoreError)}</div>` : ''}
    <div class="week-grid">
      <section class="week-main" aria-label="Accounts ranked by score">
        <div class="chips" role="group" aria-label="Filter by signal type">${FAMILIES.map((f) => `<button type="button" class="fchip${V.family === f.id ? ' active' : ''}" data-fam="${f.id}" aria-pressed="${V.family === f.id}">${esc(f.label)}</button>`).join('')}
          <label class="check small"><input type="checkbox" id="hide-notfit" ${V.hideNotFit ? 'checked' : ''}/> Hide "Not a fit"</label></div>
        <p class="hint">Scores are heuristics from public signals, decayed by age. ${S.scoredAt ? `Scored ${esc(timeAgo(S.scoredAt))}.` : ''}</p>
        <div class="acards">${cards}</div>
        ${quietHtml}
      </section>
      <aside class="week-side">
        ${pipelineCard()}
        ${marketSignalsCard()}
        ${eventsCard()}
      </aside>
    </div>`;
}

function pipelineCard() {
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  S.ws.accounts.forEach((a) => counts[a.stage]++);
  return `<section class="side-card"><h2>Pipeline</h2>
    <div class="stat"><b>${northStar()}</b><span>signal-sourced moves, last 30 days</span></div>
    <ul class="stage-list">${STAGES.map((s) => `<li><span>${esc(s)}</span><b>${counts[s]}</b></li>`).join('')}</ul>
    <p class="hint">A move counts when an account leaves Monitoring while it has a live signal.</p></section>`;
}

function marketSignalsCard() {
  const match = accountMatcher();
  const have = new Set(S.ws.accounts.map((a) => a.name.toLowerCase()));
  const rows = [];
  for (const a of (M.fda && M.fda.approvals) || []) {
    if (rows.length >= 4) break;
    if (match(a.sponsor) || have.has((a.sponsor || '').toLowerCase())) continue;
    rows.push({ kind: 'fda', title: `FDA approved ${a.brand || a.application}`, meta: `${a.sponsor} · ${shortDate(a.date)}`, url: a.url, add: titleCase(a.sponsor) });
  }
  for (const it of (M.news && M.news.items) || []) {
    if (rows.length >= 9) break;
    if (!['M&A', 'FINANCING', 'CRL', 'APPROVAL', 'LAYOFFS', 'SAFETY'].includes(it.tag)) continue;
    if (match(it.title)) continue;
    rows.push({ kind: 'news', title: it.title, meta: `${it.source} · ${timeAgo(it.date)}`, url: it.link, tag: it.tag });
  }
  const body = rows.length
    ? rows
        .map(
          (r, i) => `<div class="msig"><a href="${esc(safeUrl(r.url) || '#')}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>
          <div class="msig-meta"><span>${esc(r.meta)}</span><button type="button" class="linkish" data-addfrom="${i}">+ Add account</button></div></div>`,
        )
        .join('')
    : M.news || M.fda
      ? '<p class="muted small">No strong signals outside your list right now.</p>'
      : '<div class="skel"></div><div class="skel"></div>';
  V.marketRows = rows;
  return `<section class="side-card"><h2>Signals outside your list</h2>${body}</section>`;
}

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Inc|Llc|Ltd|Corp|Co|Pharms?|Ag|Sa|Plc)\b\.?/g, '').replace(/\s+/g, ' ').trim();

function eventsCard() {
  const up = upcoming(60);
  return `<section class="side-card"><h2>Events in the next 60 days</h2>${
    up.length
      ? up.map((e) => `<div class="msig"><a href="${esc(buildHash({ view: 'events' }))}">${esc(e.name)}</a><div class="msig-meta"><span>${esc(longDate(e.start))} · ${esc(e.city)}</span><span class="soon">${esc(whenLabel(e))}</span></div></div>`).join('')
      : '<p class="muted small">None in the next 60 days.</p>'
  }</section>`;
}

export function exportCsv() {
  const head = ['Account', 'Stage', 'Score', 'Band', 'Signals (30d)', 'Top signal', 'Top signal source', 'Top signal URL', 'Registry name', 'Aliases', 'Note'];
  const lines = [head.join(',')];
  for (const a of S.ws.accounts) {
    const r = S.scores[a.id];
    const top = r?.signals.find((s) => s.type !== 'mention');
    lines.push([a.name, a.stage, r?.score ?? '', r?.band ?? '', r ? r.signals.filter((s) => s.type !== 'mention').length : '', top ? `${top.label}: ${top.title}` : '', top?.source || '', top?.url || '', a.registryName || '', (a.aliases || []).join('; '), a.note || ''].map(csvCell).join(','));
  }
  download(`biopulse-accounts-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'), 'text/csv');
}

// ── Accounts ────────────────────────────────────────────────────────────────
export async function renderAccounts() {
  const el = $('#view-accounts');
  if (!S.ws) {
    el.innerHTML = `<div class="hero"><h1>No workspace yet.</h1><div class="row-gap"><button class="btn btn-primary" type="button" data-act="onboard">Set up my accounts</button><button class="btn" type="button" data-act="demo">Try the demo</button></div></div>`;
    return;
  }
  const packs = await loadPacks().catch(() => []);
  const accts = S.ws.accounts;
  const rows = accts
    .map((a) => {
      const r = S.scores[a.id];
      const sig = r ? r.signals.filter((s) => s.type !== 'mention') : [];
      const last = sig.map((s) => s.date).sort().pop();
      return `<tr>
        <td><button type="button" class="acct-name" data-open="${esc(a.id)}">${esc(a.name)}</button>${a.registryName || (a.aliases || []).length ? `<div class="muted small">${esc([a.registryName && `registry: ${a.registryName}`, (a.aliases || []).length && `aliases: ${a.aliases.join(', ')}`].filter(Boolean).join(' · '))}</div>` : ''}</td>
        <td>${stageSelect(a)}</td>
        <td>${r ? `<span class="score-pill ${bandCls(r.band)}">${r.score}</span>` : '<span class="muted">…</span>'}</td>
        <td class="num">${r ? sig.length : '…'}</td>
        <td>${last ? esc(shortDate(last)) : '<span class="muted">—</span>'}</td>
        <td class="row-actions"><button type="button" class="btn btn-small" data-open="${esc(a.id)}">Open</button><button type="button" class="btn btn-small" data-remove="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">Remove</button></td>
      </tr>`;
    })
    .join('');
  el.innerHTML = `
    <div class="page-hd"><div><h1>Accounts</h1><p class="muted">${accts.length} of 50 accounts. Matching uses the name, the registry name and aliases as whole words.</p></div>
      <div class="row-gap"><button type="button" class="btn" data-act="csv">Export CSV</button></div></div>
    <div class="add-grid">
      <form id="add-one" class="side-card" autocomplete="off"><h2>Add an account</h2>
        <label class="label" for="add-name">Company name</label><input id="add-name" maxlength="80" placeholder="e.g. Regeneron" />
        <label class="label" for="add-reg">Registry name <span class="muted">(optional, as on ClinicalTrials.gov)</span></label><input id="add-reg" maxlength="80" placeholder="e.g. Regeneron Pharmaceuticals" />
        <label class="label" for="add-alias">Aliases <span class="muted">(optional, comma-separated)</span></label><input id="add-alias" maxlength="200" placeholder="e.g. REGN" />
        <button type="submit" class="btn btn-primary">Add</button></form>
      <form id="add-many" class="side-card"><h2>Paste a list</h2><label class="label" for="add-list">One company per line</label>
        <textarea id="add-list" rows="6" maxlength="4000" placeholder="Pfizer&#10;Moderna&#10;Takeda"></textarea><button type="submit" class="btn btn-primary">Add all</button></form>
      <div class="side-card"><h2>Starter packs</h2><p class="muted small">Registry names and aliases are pre-filled.</p>
        ${packs.map((p) => `<button type="button" class="btn btn-block-left" data-pack="${esc(p.id)}">+ ${esc(p.name)}</button>`).join('')}</div>
    </div>
    ${accts.length ? `<div class="table-wrap"><table class="atable"><thead><tr><th scope="col">Account</th><th scope="col">Stage</th><th scope="col">Score</th><th scope="col">Signals</th><th scope="col">Last signal</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">No accounts yet. Use one of the options above.</div>'}`;
}

// ── Account panel ───────────────────────────────────────────────────────────
export function openPanel(id, { compose } = {}) {
  V.panel = id;
  V.composeSignal = compose || null;
  if (location.hash !== buildHash({ a: id })) history.replaceState(null, '', buildHash({ a: id }));
  renderPanel();
  const p = $('#account-panel');
  p.hidden = false;
  document.body.classList.add('panel-open');
  setTimeout(() => (compose ? $('#compose')?.scrollIntoView({ block: 'start' }) : $('#panel-close')?.focus()), 30);
}

export function closePanel() {
  V.panel = null;
  $('#account-panel').hidden = true;
  document.body.classList.remove('panel-open');
  history.replaceState(null, '', buildHash({}));
}

export function renderPanel() {
  const id = V.panel;
  if (!id) return;
  const a = S.ws?.accounts.find((x) => x.id === id);
  const el = $('#panel-body');
  if (!a) {
    el.innerHTML = '<p class="empty">This account is not in the workspace.</p>';
    return;
  }
  const r = S.scores[a.id];
  const votes = S.ws.votes || {};
  const sigs = r ? r.signals : [];
  const actionable = sigs.filter((s) => s.type !== 'mention');
  const chosen = V.composeSignal && actionable.find((s) => s.id === V.composeSignal) ? V.composeSignal : actionable[0]?.id;
  el.innerHTML = `
    <div class="ap-hd">
      <div><h2 id="panel-title">${esc(a.name)}</h2><div class="muted small">${a.registryName ? `Registry: ${esc(a.registryName)} · ` : ''}Added ${esc(longDate(a.addedAt || new Date().toISOString()))}</div></div>
      ${r ? `<div class="score big ${bandCls(r.band)}" title="Heuristic score"><b>${r.score}</b><span>${esc(r.band)}</span></div>` : ''}
    </div>
    <div class="row-gap">${stageSelect(a)}</div>
    <section class="psec"><h3>Why this score <span class="muted small">heuristic · signals halve in weight every 14 days</span></h3>
      ${!r ? '<div class="skel"></div><div class="skel"></div>' : sigs.length ? `<ul class="breakdown">${sigs
        .map((s) => `<li>${signalLine(s, { compact: true })}<div class="bd-side"><span class="pts" title="Points added to the score">+${s.points}</span>
          <button type="button" class="vote${votes[s.id] === 1 ? ' on' : ''}" data-vote="${esc(s.id)}" data-v="1" aria-label="Useful signal" aria-pressed="${votes[s.id] === 1}">▲</button>
          <button type="button" class="vote${votes[s.id] === -1 ? ' on' : ''}" data-vote="${esc(s.id)}" data-v="-1" aria-label="Not useful" aria-pressed="${votes[s.id] === -1}">▼</button></div>
          ${s.context ? `<div class="muted small">${esc(s.context)}</div>` : ''}<div class="why small">${esc(s.why)}</div></li>`)
        .join('')}</ul>` : '<p class="muted">No signals in the last 30 days. The registry snapshot below still shows the account\'s current portfolio.</p>'}
    </section>
    <section class="psec" id="compose"><h3>Draft outreach</h3>
      ${actionable.length ? `<label class="label" for="compose-sig">Trigger signal</label>
        <select id="compose-sig">${actionable.map((s) => `<option value="${esc(s.id)}"${s.id === chosen ? ' selected' : ''}>${esc(s.label)}: ${esc(s.title.slice(0, 90))}</option>`).join('')}</select>
        <button type="button" class="btn btn-primary" id="compose-go">▶ Draft email, LinkedIn note and call opener</button>
        <div id="compose-out"></div>` : '<p class="muted">Outreach drafts need a trigger signal. None right now.</p>'}
    </section>
    <section class="psec"><h3>Account brief</h3><p class="muted small">Live trial portfolio from ClinicalTrials.gov, FDA approvals over 24 months from openFDA, matching headlines, then an AI pre-call brief.</p>
      <button type="button" class="btn" id="brief-go">▶ Build account brief</button><div id="brief-out"></div></section>
    <section class="psec"><h3>Matching and notes</h3>
      <form id="match-form" autocomplete="off">
        <label class="label" for="m-reg">Registry name <span class="muted">(lead sponsor on ClinicalTrials.gov)</span></label><input id="m-reg" maxlength="80" value="${esc(a.registryName || '')}" />
        <label class="label" for="m-alias">Aliases <span class="muted">(comma-separated)</span></label><input id="m-alias" maxlength="200" value="${esc((a.aliases || []).join(', '))}" />
        <label class="label" for="m-ex">Exclude phrases <span class="muted">(e.g. "Merck KGaA")</span></label><input id="m-ex" maxlength="200" value="${esc((a.exclude || []).join(', '))}" />
        <label class="label" for="m-note">Notes</label><textarea id="m-note" rows="3" maxlength="500">${esc(a.note || '')}</textarea>
        <div class="row-gap"><button type="submit" class="btn btn-primary">Save and rescore</button></div></form>
    </section>
    ${(a.stageHistory || []).length ? `<section class="psec"><h3>Stage history</h3><ul class="hist">${a.stageHistory.slice().reverse().map((h) => `<li><b>${esc(h.stage)}</b> · ${esc(longDate(h.at))}${h.score != null ? ` · score ${h.score}` : ''}${h.signal ? `<div class="muted small">${esc(h.signal)}</div>` : ''}</li>`).join('')}</ul></section>` : ''}
    <section class="psec danger"><button type="button" class="btn" id="remove-acct">Remove account</button></section>`;
}

async function draftOutreach() {
  const a = S.ws.accounts.find((x) => x.id === V.panel);
  const r = S.scores[a.id];
  const sid = $('#compose-sig').value;
  const sig = r.signals.find((s) => s.id === sid);
  const others = r.signals.filter((s) => s.id !== sid && s.type !== 'mention').slice(0, 3);
  const out = $('#compose-out');
  const btn = $('#compose-go');
  btn.disabled = true;
  btn.textContent = '⟳ Drafting…';
  out.innerHTML = '<div class="skel"></div>'.repeat(4);
  try {
    const { data } = await api('/api/ai', {
      method: 'POST',
      timeout: 30000,
      body: {
        task: 'outreach',
        input: {
          company: a.name,
          profile: profilePayload(),
          signal: { label: sig.label, title: sig.title, source: sig.source, date: sig.date.slice(0, 10), why: sig.why },
          context: others.map((s) => ({ label: s.label, title: s.title, source: s.source, date: s.date.slice(0, 10) })),
        },
      },
    });
    const d = data.result;
    const refs = [sig, ...others];
    const block = (id, title, text, note) => `<div class="draft"><div class="draft-hd"><b>${title}</b>${note ? `<span class="muted small">${note}</span>` : ''}<button type="button" class="act" data-copy="${id}">Copy</button></div><pre id="${id}">${esc(text)}</pre></div>`;
    out.innerHTML = `<div class="meta-line"><span class="flag">AI DRAFT · EDIT BEFORE SENDING</span><span>${esc(data.model || '')}${data.cached ? ' · cached' : ''}</span><span>cites ${refLinks(d.cites.length ? d.cites : [1], refs) || refLinks([1], refs)}</span></div>
      ${d.angle ? `<p class="small"><b>Bet:</b> ${esc(d.angle)}</p>` : ''}
      ${block('d-subj', 'Subject', d.subject)}
      ${block('d-email', 'Email', d.email, `${d.email.split(/\s+/).filter(Boolean).length} words`)}
      ${block('d-li', 'LinkedIn note', d.linkedin, `${d.linkedin.length}/300`)}
      ${block('d-open', 'Call opener', d.opener)}`;
  } catch (e) {
    out.innerHTML = aiErrorHtml(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '↺ Draft again';
  }
}

const PHASE_ORDER = ['EARLY_PHASE1', 'PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'NA'];
const PHASE_COL = { EARLY_PHASE1: '#4fd1c5', PHASE1: '#6c9bff', PHASE2: '#a78bfa', PHASE3: '#00e5b0', PHASE4: '#f5c542', NA: '#5f7b94' };
const phaseName = (p) => ({ EARLY_PHASE1: 'Early Ph1', PHASE1: 'Ph1', PHASE2: 'Ph2', PHASE3: 'Ph3', PHASE4: 'Ph4', NA: 'N/A' })[p] || p;
const shortList = (arr, n = 2) => {
  const a = (arr || []).map((x) => (x.length > 40 ? x.slice(0, 38) + '…' : x));
  return a.length ? a.slice(0, n).join('; ') + (a.length > n ? ` +${a.length - n} more` : '') : 'n/a';
};

async function buildBrief() {
  const a = S.ws.accounts.find((x) => x.id === V.panel);
  const out = $('#brief-out');
  const btn = $('#brief-go');
  btn.disabled = true;
  btn.textContent = '⟳ Looking up registries…';
  out.innerHTML = '<div class="skel"></div>'.repeat(4);
  let reg;
  try {
    reg = (await api('/api/company?name=' + encodeURIComponent(a.registryName || a.name), { timeout: 20000 })).data;
  } catch (e) {
    reg = { trials: { error: e.message }, fda: { error: e.message } };
  }
  const terms = [a.name, a.registryName, ...(a.aliases || []), shortName(a.name)].filter(Boolean);
  const re = new RegExp('(^|[^a-z0-9])(' + terms.map(reEsc).join('|') + ')($|[^a-z0-9])', 'i');
  const news = ((M.news && M.news.items) || []).filter((it) => re.test(it.title)).slice(0, 10);
  out.innerHTML = registryHtml(a, reg, news);
  btn.textContent = '⟳ Writing brief…';
  try {
    const { data } = await api('/api/ai', {
      method: 'POST',
      timeout: 30000,
      body: {
        task: 'prospect',
        input: {
          company: a.name,
          profile: profilePayload(),
          data: { trials: reg.trials && !reg.trials.error ? reg.trials : {}, fda: reg.fda && !reg.fda.error ? reg.fda : {}, news: news.map((n) => ({ title: n.title, source: n.source, date: n.date })) },
        },
      },
    });
    out.insertAdjacentHTML('afterbegin', briefHtml(a, data, news));
    const md = briefMarkdown(a, data.result, reg, news);
    $('#pb-copy').addEventListener('click', (ev) => copyText(md, ev.currentTarget));
    $('#pb-dl').addEventListener('click', () => download(`${a.id}-account-brief.md`, md, 'text/markdown'));
  } catch (e) {
    out.insertAdjacentHTML('afterbegin', aiErrorHtml(e));
  } finally {
    btn.disabled = false;
    btn.textContent = '↺ Rebuild brief';
  }
}

function registryHtml(a, reg, news) {
  const t = reg.trials || {};
  const f = reg.fda || {};
  const phases = t.phases || {};
  const tot = Object.values(phases).reduce((x, y) => x + y, 0) || 1;
  const bar = PHASE_ORDER.filter((p) => phases[p]).map((p) => `<span style="width:${(phases[p] / tot) * 100}%;background:${PHASE_COL[p]}" title="${phaseName(p)}: ${phases[p]}"></span>`).join('');
  const legend = PHASE_ORDER.filter((p) => phases[p]).map((p) => `<span><i style="background:${PHASE_COL[p]}"></i>${phaseName(p)} ${phases[p]}</span>`).join('');
  const trials = t.error
    ? `<p class="err">${esc(t.error)}</p>`
    : t.activeTotal
      ? `<div class="phase-bar">${bar}</div><div class="phase-legend">${legend}</div><p class="muted small">Phase mix of the ${t.sampled} most recently updated active trials. Matched: ${esc(shortList(t.sponsorNames))}</p>
         ${(t.topConditions || []).length ? `<p class="small"><b>Top conditions:</b> ${esc(t.topConditions.map((c) => `${c.name} (${c.n})`).join(', '))}</p>` : ''}
         ${(t.recent || []).map((x) => `<div class="mini"><a href="https://clinicaltrials.gov/study/${esc(encodeURIComponent(x.nct))}" target="_blank" rel="noopener noreferrer"><code>${esc(x.nct)}</code></a> ${esc((x.phases || []).map(phaseName).join('/'))} · ${esc(x.title)}</div>`).join('')}`
      : `<p class="muted">No active trials with this lead sponsor name. Set the registry name under Matching (e.g. "Hoffmann-La Roche", "Janssen").</p>`;
  const fda = f.error
    ? `<p class="err">${esc(f.error)}</p>`
    : (f.originals || []).length
      ? f.originals.map((x) => `<div class="mini"><a href="${esc(safeUrl(x.url) || '#')}" target="_blank" rel="noopener noreferrer">${esc(x.brand || x.application)}</a> ${x.ingredient ? `(${esc(x.ingredient.toLowerCase())})` : ''} · ${esc(longDate(x.date))}${x.type ? ' · ' + esc(x.type) : ''}</div>`).join('') + `<p class="muted small">${fmtInt(f.supplements)} supplemental approvals in the same period. Matched: ${esc(shortList(f.matchedSponsors))}</p>`
      : `<p class="muted">No original NDA/BLA approvals for this sponsor in openFDA over 24 months.${f.supplements ? ` ${fmtInt(f.supplements)} supplemental approvals.` : ''}</p>`;
  const nl = news.length ? news.map((n) => `<div class="mini"><a href="${esc(safeUrl(n.link) || '#')}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a> <span class="muted">· ${esc(n.source)} · ${esc(timeAgo(n.date))}</span></div>`).join('') : '<p class="muted">No headlines about this company in the current feed.</p>';
  return `<h4 class="sect">Source data</h4><div class="facts"><div class="fact"><b>${t.error ? '—' : fmtInt(t.activeTotal)}</b><span>Active trials</span></div><div class="fact"><b>${f.error ? '—' : fmtInt((f.originals || []).length)}</b><span>FDA originals 24m</span></div><div class="fact"><b>${fmtInt(news.length)}</b><span>Headlines</span></div></div>
    <div class="card"><div class="card-hd">ClinicalTrials.gov · lead sponsor portfolio</div>${trials}</div>
    <div class="card"><div class="card-hd amber">openFDA · approvals, last 24 months</div>${fda}</div>
    <div class="card"><div class="card-hd blue">Feed headlines</div>${nl}</div>`;
}

function briefHtml(a, data, news) {
  const r = data.result;
  const ul = (x) => (x.length ? `<ul>${x.map((y) => `<li>${esc(y)}</li>`).join('')}</ul>` : '<p class="muted">Nothing returned.</p>');
  return `<div class="meta-line"><span class="flag">AI-GENERATED</span><span>confidence: ${esc(r.confidence)}</span><span>${esc(data.model || '')}${data.cached ? ' · cached' : ''}</span><button type="button" class="act" id="pb-copy">Copy</button><button type="button" class="act" id="pb-dl">Download .md</button></div>
    <div class="card"><div class="card-hd">At a glance</div><p class="lead">${esc(r.summary)}</p></div>
    <div class="card"><div class="card-hd">Pipeline signals <span class="right">ClinicalTrials.gov</span></div>${ul(r.pipeline)}</div>
    <div class="card"><div class="card-hd amber">Regulatory <span class="right">openFDA</span></div>${ul(r.regulatory)}</div>
    ${r.news.length ? `<div class="card"><div class="card-hd blue">In the news</div><ul>${r.news.map((n) => `<li>${esc(n.text)}${refLinks(n.sources, news)}</li>`).join('')}</ul></div>` : ''}
    <div class="card"><div class="card-hd">Discovery questions</div>${ul(r.questions)}</div>
    <div class="card pitch"><div class="card-hd red">${esc(profile().firm || 'Your')} angle · ${esc(r.angle.title)}</div><p>${esc(r.angle.pitch)}</p><div class="hooks">${r.angle.hooks.map((h, i) => `<span class="hook${i < 2 ? ' hot' : ''}">${esc(h)}</span>`).join('')}</div></div>
    ${r.background.length ? `<div class="card"><div class="card-hd blue">Background <span class="flag">MODEL KNOWLEDGE · MAY BE OUTDATED</span></div>${ul(r.background)}</div>` : ''}`;
}

function briefMarkdown(a, r, reg, news) {
  const L = [`# Account brief: ${a.name}`, `_BioPulse, ${new Date().toLocaleDateString('en-GB')}. AI-written from registry data and headlines; verify before use._`, '', r.summary, ''];
  const sec = (title, arr) => arr.length && L.push(`## ${title}`, ...arr.map((x) => `- ${x}`), '');
  sec('Pipeline signals (ClinicalTrials.gov)', r.pipeline);
  sec('Regulatory (openFDA)', r.regulatory);
  if (r.news.length) sec('In the news', r.news.map((n) => n.text + ' ' + n.sources.map((s) => `[${s}]`).join('')));
  sec('Discovery questions', r.questions);
  L.push(`## Angle: ${r.angle.title}`, r.angle.pitch, '', r.angle.hooks.map((h) => `\`${h}\``).join(' '), '');
  sec('Background (model knowledge, may be outdated)', r.background);
  const sc = S.scores[a.id];
  if (sc?.signals?.length) {
    L.push('## Current signals');
    sc.signals.slice(0, 8).forEach((s) => L.push(`- ${s.label}: [${s.title}](${s.url}) (${s.source}, ${s.date.slice(0, 10)})`));
    L.push('');
  }
  if (news.length) {
    L.push('## Headline sources');
    news.forEach((n, i) => L.push(`${i + 1}. [${n.title}](${n.link}) (${n.source})`));
  }
  return L.join('\n');
}

// ── Settings ────────────────────────────────────────────────────────────────
export function renderSettings() {
  const el = $('#view-settings');
  const p = profile();
  const ws = S.ws;
  const h = S.health || {};
  const votes = ws?.votes || {};
  const fb = {};
  for (const [id, v] of Object.entries(votes)) {
    const t = id.split(':')[0];
    fb[t] = fb[t] || { up: 0, down: 0 };
    fb[t][v === 1 ? 'up' : 'down']++;
  }
  const items = Object.values(S.healthItems || {});
  el.innerHTML = `
    <div class="page-hd"><div><h1>Settings</h1><p class="muted">${S.mode === 'workspace' ? 'Saved to your workspace and synced across devices.' : S.mode === 'demo' ? 'Demo mode: changes are not saved.' : 'No workspace yet.'}</p></div></div>
    <div class="settings-grid">
      <form class="side-card" id="set-profile" autocomplete="off"><h2>Your firm</h2><p class="muted small">Used to tailor outreach drafts, briefs and event fit.</p>
        <label class="label" for="set-firm">Firm name</label><input id="set-firm" maxlength="80" value="${esc(ws?.profile?.firm || '')}" placeholder="e.g. Acme Analytics" />
        <label class="label" for="set-offering">What you sell</label><textarea id="set-offering" rows="4" maxlength="500">${esc(ws?.profile?.offering || DEFAULT_PROFILE.offering)}</textarea>
        <label class="label" for="set-focus">Focus areas</label><input id="set-focus" maxlength="200" value="${esc(ws?.profile?.focus || DEFAULT_PROFILE.focus)}" />
        <button type="submit" class="btn btn-primary">Save profile</button></form>

      <section class="side-card"><h2>Workspace link</h2>
        ${S.mode === 'workspace' ? `<p class="small">Anyone with this link can open and edit this workspace. Keep it private, like a password.</p>
          <div class="row"><label for="ws-link" class="sr-only">Workspace link</label><input id="ws-link" readonly value="${esc(workspaceLink())}" /><button type="button" class="btn" id="ws-copy">Copy</button></div>
          <p class="muted small">Open it on your phone or another laptop to see the same accounts.</p>
          <div class="row-gap"><button type="button" class="btn" data-act="export-json">Export JSON</button><button type="button" class="btn" data-act="csv">Export CSV</button></div>
          <div class="danger-zone"><button type="button" class="btn" id="ws-delete">Delete workspace</button><span id="ws-delete-msg" class="small"></span></div>`
          : `<p class="small">${S.mode === 'demo' ? 'The demo is not saved.' : 'Create a workspace to save your accounts.'}</p><button type="button" class="btn btn-primary" data-act="onboard">Create workspace</button>`}
        <h3 class="sect">Open an existing workspace</h3>
        <form id="ws-open" class="row" autocomplete="off"><label for="ws-paste" class="sr-only">Workspace link</label><input id="ws-paste" placeholder="Paste a workspace link" /><button type="submit" class="btn">Open</button></form>
      </section>

      <form class="side-card" id="set-digest" autocomplete="off"><h2>Weekly digest</h2>
        <p class="muted small">Mondays around 07:00 IST: accounts with new signals since the last digest. Skipped when nothing changed. One-click unsubscribe, no tracking.</p>
        ${h.email && !h.email.configured ? '<p class="warn small">Email is not configured on the server yet (RESEND_API_KEY).</p>' : ''}
        ${h.email && h.email.configured && h.email.testSender ? '<p class="muted small">Using Resend\'s test sender: email only reaches the address that owns the Resend account until a domain is verified.</p>' : ''}
        <label class="label" for="dg-email">Email</label><input id="dg-email" type="email" maxlength="254" value="${esc(ws?.digest?.email || '')}" placeholder="you@company.com" ${S.mode !== 'workspace' ? 'disabled' : ''}/>
        <label class="check"><input type="checkbox" id="dg-on" ${ws?.digest?.enabled ? 'checked' : ''} ${S.mode !== 'workspace' ? 'disabled' : ''}/> Send me the weekly digest</label>
        ${ws?.digest?.lastSentAt ? `<p class="muted small">Last digest: ${esc(longDate(ws.digest.lastSentAt))}</p>` : ''}
        <div class="row-gap"><button type="submit" class="btn btn-primary" ${S.mode !== 'workspace' ? 'disabled' : ''}>Save</button><button type="button" class="btn" id="dg-test" ${S.mode !== 'workspace' ? 'disabled' : ''}>Send test now</button></div>
        <p id="dg-msg" class="small" role="status"></p></form>

      <section class="side-card"><h2>Signal feedback</h2><p class="muted small">Your ▲/▼ votes per signal type. Used to recalibrate the scoring weights.</p>
        ${Object.keys(fb).length ? `<table class="mini-table"><thead><tr><th>Type</th><th>▲</th><th>▼</th><th>Useful</th></tr></thead><tbody>${Object.entries(fb).map(([t, c]) => `<tr><td>${esc(t.replace(/_/g, ' '))}</td><td>${c.up}</td><td>${c.down}</td><td>${Math.round((c.up / (c.up + c.down)) * 100)}%</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No votes yet. Vote on signals in any account panel.</p>'}</section>

      <form class="side-card" id="set-market" autocomplete="off"><h2>Market tab</h2>
        <label class="label" for="set-tickers">Tickers (comma-separated, max 16)</label><input id="set-tickers" maxlength="200" value="${esc((ws?.tickers?.length ? ws.tickers : DEFAULT_TICKERS).join(', '))}" />
        <label class="label" for="set-api">Backend URL <span class="muted">(leave blank on Netlify)</span></label><input id="set-api" maxlength="200" value="${esc(local.get('bp:apiBase') || '')}" placeholder="https://your-site.netlify.app" />
        <button type="submit" class="btn btn-primary">Save</button><p id="mk-msg" class="small" role="status"></p></form>

      <section class="side-card"><h2>Data sources</h2>
        <p class="muted small">Backend: ${esc(apiBase() || location.origin)}${h.ai ? ` · AI ${h.ai.configured ? 'configured' : 'not configured'} · email ${h.email?.configured ? 'configured' : 'not configured'}` : ''}</p>
        ${items.length ? items.map((x) => `<div class="src-row"><span class="dot ${x.level === 'ok' ? 'ok' : x.level === 'warn' ? 'warn' : 'bad'}"></span><span>${esc(x.label)}</span><span class="why">${esc(x.detail || '')}</span></div>`).join('') : '<p class="muted small">Open the Market tab to check every source.</p>'}
      </section>
    </div>`;
}

export function wireSettings() {
  const root = $('#view-settings');
  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'set-profile') {
      if (demoGuard() || !S.ws) return;
      S.ws.profile = { firm: $('#set-firm').value.trim(), offering: $('#set-offering').value.trim(), focus: $('#set-focus').value.trim() };
      await save({ immediate: true });
      toast('Profile saved.');
      emit('profile');
    } else if (f.id === 'set-digest') {
      const email = $('#dg-email').value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return ($('#dg-msg').textContent = 'That email address does not look right.');
      S.ws.digest = { ...S.ws.digest, email, enabled: $('#dg-on').checked && Boolean(email) };
      await save({ immediate: true });
      $('#dg-msg').textContent = S.ws.digest.enabled ? `Saved. The digest goes to ${email} on Mondays.` : 'Saved. The digest is off.';
    } else if (f.id === 'set-market') {
      const t = [...new Set($('#set-tickers').value.toUpperCase().split(/[\s,]+/).filter((s) => /^\^?[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(s)))].slice(0, 16);
      const apiNew = $('#set-api').value.trim().replace(/\/+$/, '');
      if (apiNew && !safeUrl(apiNew)) return ($('#mk-msg').textContent = 'Backend URL must be a full https:// address.');
      const changed = apiNew !== (local.get('bp:apiBase') || '');
      if (apiNew) local.set('bp:apiBase', apiNew);
      else local.del('bp:apiBase');
      if (S.ws && !readOnly()) {
        S.ws.tickers = t;
        save();
      }
      $('#mk-msg').textContent = 'Saved.';
      if (changed) location.reload();
    } else if (f.id === 'ws-open') {
      const v = $('#ws-paste').value.trim();
      const m = /[?&#]w=([A-Za-z0-9_-]{22})/.exec(v) || /^([A-Za-z0-9_-]{22})$/.exec(v);
      if (!m) return toast('That does not look like a workspace link.', { kind: 'error' });
      location.hash = `#/week?w=${m[1]}`;
      location.reload();
    }
  });
  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.id === 'ws-copy') copyText($('#ws-link').value, t);
    if (t.id === 'dg-test') {
      const msg = $('#dg-msg');
      if (!S.ws.digest?.email) return (msg.textContent = 'Save an email address first.');
      t.disabled = true;
      msg.textContent = 'Scoring your accounts and sending…';
      try {
        const { data } = await api('/api/digest', { method: 'POST', body: { id: S.ws.id }, timeout: 40000 });
        msg.textContent = data.sent ? `Sent to ${data.to} with ${data.accounts} accounts.` : data.message;
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        t.disabled = false;
      }
    }
    if (t.id === 'ws-delete') {
      if (t.dataset.confirm !== '1') {
        t.dataset.confirm = '1';
        t.textContent = 'Click again to delete permanently';
        $('#ws-delete-msg').textContent = 'This removes your accounts, stages and digest settings from the server.';
        return;
      }
      try {
        await deleteWorkspace();
        toast('Workspace deleted.');
        location.hash = '#/week';
      } catch (err) {
        toast("Couldn't delete: " + err.message, { kind: 'error' });
      }
    }
  });
}

export function exportJson() {
  const { digest, ...rest } = S.ws;
  download(`biopulse-workspace-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ ...rest, digest: { email: digest?.email, enabled: digest?.enabled } }, null, 2), 'application/json');
}

// ── Onboarding ──────────────────────────────────────────────────────────────
const OB = { step: 1, draft: null };

export async function openOnboarding() {
  OB.step = 1;
  OB.draft = { profile: { ...DEFAULT_PROFILE }, accounts: [], digest: { email: '', enabled: false } };
  renderOnboarding();
  const d = $('#onboard');
  if (!d.open) d.showModal();
}

async function renderOnboarding() {
  const body = $('#onboard-body');
  const d = OB.draft;
  const steps = `<ol class="ob-steps">${['Your firm', 'Your accounts', 'Weekly digest'].map((s, i) => `<li class="${OB.step === i + 1 ? 'on' : OB.step > i + 1 ? 'done' : ''}">${i + 1}. ${s}</li>`).join('')}</ol>`;
  if (backendMissing()) {
    body.innerHTML = `${steps}<p class="warn">This copy runs on GitHub Pages without a backend, so it can't create workspaces. Set the backend URL in Settings, or use the Netlify site.</p><div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn" data-ob="close">Close</button></div>`;
    return;
  }
  if (OB.step === 1) {
    body.innerHTML = `${steps}<h2 id="onboard-title">What do you sell?</h2><p class="muted small">Outreach drafts and briefs connect each signal to this.</p>
      <label class="label" for="ob-firm">Firm name</label><input id="ob-firm" maxlength="80" value="${esc(d.profile.firm)}" placeholder="e.g. Acme Analytics" />
      <label class="label" for="ob-off">What you sell</label><textarea id="ob-off" rows="4" maxlength="500">${esc(d.profile.offering)}</textarea>
      <label class="label" for="ob-focus">Focus areas</label><input id="ob-focus" maxlength="200" value="${esc(d.profile.focus)}" />
      <div class="dialog-actions"><button type="button" class="btn" data-ob="demo">Try the demo instead</button><span class="spacer"></span><button type="button" class="btn" data-ob="close">Cancel</button><button type="button" class="btn btn-primary" data-ob="next">Next</button></div>`;
  } else if (OB.step === 2) {
    const packs = await loadPacks().catch(() => []);
    body.innerHTML = `${steps}<h2 id="onboard-title">Which accounts do you own?</h2><p class="muted small">Up to 50. You can change these any time.</p>
      <div class="chips">${packs.map((p) => `<button type="button" class="btn btn-small" data-obpack="${esc(p.id)}">+ ${esc(p.name)}</button>`).join('')}</div>
      <label class="label" for="ob-list">Or type or paste names, one per line</label><textarea id="ob-list" rows="6" maxlength="4000" placeholder="Pfizer&#10;Moderna"></textarea>
      <p class="small" id="ob-count">${d.accounts.length} selected${d.accounts.length ? ': ' + esc(d.accounts.slice(0, 6).map((a) => a.name).join(', ')) + (d.accounts.length > 6 ? '…' : '') : ''}</p>
      <div class="dialog-actions"><button type="button" class="btn" data-ob="back">Back</button><span class="spacer"></span><button type="button" class="btn btn-primary" data-ob="next">Next</button></div>`;
  } else {
    body.innerHTML = `${steps}<h2 id="onboard-title">Get a Monday digest?</h2><p class="muted small">An email listing accounts with new signals. Optional, and you can unsubscribe from any email.</p>
      <label class="label" for="ob-email">Email (optional)</label><input id="ob-email" type="email" maxlength="254" value="${esc(d.digest.email)}" placeholder="you@company.com" />
      <p class="muted small">Your workspace is private to its link. No password, no tracking.</p>
      <p id="ob-err" class="err small" role="alert"></p>
      <div class="dialog-actions"><button type="button" class="btn" data-ob="back">Back</button><span class="spacer"></span><button type="button" class="btn btn-primary" data-ob="create">Create workspace</button></div>`;
  }
  setTimeout(() => body.querySelector('input, textarea')?.focus(), 30);
}

function collectStep() {
  const d = OB.draft;
  if (OB.step === 1) d.profile = { firm: $('#ob-firm').value.trim(), offering: $('#ob-off').value.trim() || DEFAULT_PROFILE.offering, focus: $('#ob-focus').value.trim() || DEFAULT_PROFILE.focus };
  if (OB.step === 2) addTyped();
  if (OB.step === 3) d.digest = { email: $('#ob-email').value.trim(), enabled: Boolean($('#ob-email').value.trim()) };
}

function addTyped() {
  const el = $('#ob-list');
  if (!el) return;
  const names = el.value.split(/\n|,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
  mergeDraft(names.map((name) => ({ name })));
  el.value = '';
}

function mergeDraft(list) {
  const have = new Set(OB.draft.accounts.map((a) => a.name.toLowerCase()));
  for (const a of list) {
    if (OB.draft.accounts.length >= 50) break;
    if (!a.name || have.has(a.name.toLowerCase())) continue;
    have.add(a.name.toLowerCase());
    OB.draft.accounts.push({ ...a, stage: 'Monitoring' });
  }
}

export function wireOnboarding() {
  const dlg = $('#onboard');
  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ob], [data-obpack]');
    if (!b) return;
    if (b.dataset.obpack) {
      const packs = await loadPacks();
      mergeDraft(packs.find((p) => p.id === b.dataset.obpack).accounts);
      addTyped();
      $('#ob-count').textContent = `${OB.draft.accounts.length} selected: ${OB.draft.accounts.slice(0, 6).map((a) => a.name).join(', ')}${OB.draft.accounts.length > 6 ? '…' : ''}`;
      return;
    }
    const act = b.dataset.ob;
    if (act === 'close') return dlg.close();
    if (act === 'demo') {
      dlg.close();
      await startDemo();
      location.hash = '#/week?demo=1';
      return;
    }
    if (act === 'back') {
      collectStep();
      OB.step--;
      return renderOnboarding();
    }
    if (act === 'next') {
      collectStep();
      OB.step++;
      return renderOnboarding();
    }
    if (act === 'create') {
      collectStep();
      const email = OB.draft.digest.email;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return ($('#ob-err').textContent = 'That email address does not look right.');
      b.disabled = true;
      b.textContent = 'Creating…';
      try {
        await createWorkspace(OB.draft);
        dlg.close();
        history.replaceState(null, '', buildHash({ view: 'week' }));
        emit('route');
        scoreAccounts();
        toast('Workspace created. Bookmark this page or copy the link from Settings to open it on other devices.', { ms: 9000 });
      } catch (err) {
        $('#ob-err').textContent = err.message;
        b.disabled = false;
        b.textContent = 'Create workspace';
      }
    }
  });
}

// ── Shared delegated handlers (week, accounts, panel) ───────────────────────
export function wireViews() {
  document.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-stage]');
    if (sel) {
      if (readOnly()) {
        sel.value = S.ws.accounts.find((a) => a.id === sel.dataset.stage)?.stage;
        demoGuard();
        return;
      }
      setStage(sel.dataset.stage, sel.value);
      toast(`${S.ws.accounts.find((a) => a.id === sel.dataset.stage).name}: ${sel.value}`);
    }
    if (e.target.id === 'hide-notfit') {
      V.hideNotFit = e.target.checked;
      renderWeek();
    }
  });
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.open) return openPanel(t.dataset.open);
    if (t.dataset.compose) return openPanel(t.dataset.compose, { compose: t.dataset.sig });
    if (t.dataset.fam) {
      V.family = t.dataset.fam;
      return renderWeek();
    }
    if (t.dataset.addfrom) {
      const row = V.marketRows?.[Number(t.dataset.addfrom)];
      if (!row) return;
      if (demoGuard()) return;
      if (row.add) {
        const { added } = addAccounts([{ name: row.add, registryName: row.add }]);
        if (added) toast(`Added ${row.add}. Scoring now.`);
      } else {
        location.hash = buildHash({ view: 'accounts' });
        setTimeout(() => $('#add-name')?.focus(), 100);
        toast('Type the company name to add it.');
      }
      return;
    }
    if (t.dataset.pack) {
      const packs = await loadPacks();
      const { added, full } = addAccounts(packs.find((p) => p.id === t.dataset.pack).accounts);
      toast(added ? `Added ${added} accounts.${full ? ' Stopped at the 50-account limit.' : ''}` : 'Those accounts are already in your list.');
      return;
    }
    if (t.dataset.remove) {
      if (t.dataset.confirm !== '1') {
        t.dataset.confirm = '1';
        t.textContent = 'Confirm';
        setTimeout(() => {
          if (t.isConnected) {
            t.dataset.confirm = '';
            t.textContent = 'Remove';
          }
        }, 4000);
        return;
      }
      return removeAccount(t.dataset.remove);
    }
    if (t.dataset.vote) return vote(t.dataset.vote, Number(t.dataset.v));
    if (t.dataset.copy) return copyText($('#' + t.dataset.copy).textContent, t);
    if (t.id === 'panel-close') return closePanel();
    if (t.id === 'compose-go') return draftOutreach();
    if (t.id === 'brief-go') return buildBrief();
    if (t.id === 'remove-acct') {
      if (t.dataset.confirm !== '1') {
        t.dataset.confirm = '1';
        t.textContent = 'Click again to remove this account';
        return;
      }
      const id = V.panel;
      closePanel();
      return removeAccount(id);
    }
    const act = t.dataset.act;
    if (act === 'onboard') return openOnboarding();
    if (act === 'demo') {
      await startDemo();
      location.hash = '#/week?demo=1';
      return;
    }
    if (act === 'rescore') return scoreAccounts();
    if (act === 'csv') return S.ws && exportCsv();
    if (act === 'export-json') return exportJson();
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'add-one') {
      e.preventDefault();
      const name = $('#add-name').value.trim();
      if (!name) return;
      const { added, full } = addAccounts([{ name, registryName: $('#add-reg').value.trim() || null, aliases: $('#add-alias').value.split(',').map((s) => s.trim()).filter(Boolean) }]);
      toast(added ? `Added ${name}. Scoring now.` : full ? 'You have reached the 50-account limit.' : `${name} is already in your list.`);
    }
    if (e.target.id === 'add-many') {
      e.preventDefault();
      const names = $('#add-list').value.split('\n').map((s) => s.trim()).filter(Boolean);
      const { added, full } = addAccounts(names.map((name) => ({ name })));
      toast(added ? `Added ${added} accounts.${full ? ' Stopped at the 50-account limit.' : ''}` : 'Nothing new to add.');
    }
    if (e.target.id === 'match-form') {
      e.preventDefault();
      const split = (v) => v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
      updateAccount(V.panel, { registryName: $('#m-reg').value.trim() || null, aliases: split($('#m-alias').value), exclude: split($('#m-ex').value), note: $('#m-note').value.trim() });
      toast('Saved. Rescoring this account.');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && V.panel && !$('#onboard').open) closePanel();
  });
}
