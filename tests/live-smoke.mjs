// Live smoke test: runs the real function handlers against the real upstream APIs.
// Usage: node tests/live-smoke.mjs   (optionally GROQ_API_KEY=... to test AI too)
process.env.BIOPULSE_DISABLE_BLOBS = '1';
const mods = {
  news: (await import('../netlify/functions/news.mjs')).default,
  trials: (await import('../netlify/functions/trials.mjs')).default,
  fda: (await import('../netlify/functions/fda.mjs')).default,
  quotes: (await import('../netlify/functions/quotes.mjs')).default,
  company: (await import('../netlify/functions/company.mjs')).default,
  ai: (await import('../netlify/functions/ai.mjs')).default,
};
const get = async (fn, url) => {
  const t = Date.now();
  const r = await fn(new Request(url), {});
  return { status: r.status, ms: Date.now() - t, body: await r.json() };
};
const line = (name, r, info) => console.log(`${r.status === 200 ? 'OK  ' : 'FAIL'} ${name.padEnd(18)} ${String(r.ms).padStart(5)}ms  ${info}`);

const n = await get(mods.news, 'https://x/api/news');
line('news', n, n.status === 200 ? `${n.body.items.length} items, ${n.body.deals.length} deals · ` + n.body.sources.map((s) => `${s.name}:${s.ok ? s.count : 'ERR ' + s.error}`).join(', ') : n.body.error);
if (n.status === 200) {
  console.log('     sample:', n.body.items.slice(0, 4).map((i) => `[${i.tag}] ${i.title}`).join('\n             '));
  console.log('     deals :', n.body.deals.slice(0, 5).map((d) => `${d.value} ${d.type}: ${d.title}`).join('\n             ') || 'none');
}
const a = await get(mods.trials, 'https://x/api/trials?view=areas');
line('trials areas', a, a.status === 200 ? `total ${a.body.total}, new7d ${a.body.totalNew7d}, partial=${a.body.partial} · ` + a.body.areas.map((x) => `${x.name} ${x.new7d}/${x.recruiting}`).join(', ') : a.body.error);
const c = await get(mods.trials, 'https://x/api/trials?view=countries');
line('trials countries', c, c.status === 200 ? `partial=${c.body.partial} · ` + c.body.countries.map((x) => `${x.name} ${x.recruiting}`).join(', ') : c.body.error);
const f = await get(mods.fda, 'https://x/api/fda');
line('fda', f, f.status === 200 ? `${f.body.approvals.length} approvals · ` + f.body.approvals.slice(0, 6).map((x) => `${x.date} ${x.brand} (${x.sponsor}, ${x.type})`).join('; ') : f.body.error);
const q = await get(mods.quotes, 'https://x/api/quotes');
line('quotes', q, q.status === 200 ? q.body.quotes.map((x) => `${x.symbol} ${x.price ?? 'ERR'} ${x.source || ''}`).join(', ') : q.body.error);
for (const name of ['Novo Nordisk', 'Eli Lilly', 'Hoffmann-La Roche', 'Merck Sharp & Dohme', 'Janssen', 'AstraZeneca']) {
  const r = await get(mods.company, 'https://x/api/company?name=' + encodeURIComponent(name));
  line('company ' + name.slice(0, 10), r, r.status === 200 ? `trials ${r.body.trials.activeTotal ?? r.body.trials.error} (${(r.body.trials.sponsorNames || []).join('; ')}) · FDA originals ${r.body.fda.originals?.length ?? r.body.fda.error}, suppl ${r.body.fda.supplements ?? ''} (${(r.body.fda.matchedSponsors || []).join('; ')})` : r.body.error);
}
if (process.env.GROQ_API_KEY) {
  const headlines = (n.body.items || []).slice(0, 20).map((i) => ({ title: i.title, source: i.source, tag: i.tag }));
  const r = await mods.ai(new Request('http://localhost:8888/api/ai', { method: 'POST', headers: { origin: 'http://localhost:8888', 'content-type': 'application/json' }, body: JSON.stringify({ task: 'dailyBrief', input: { headlines } }) }), { ip: 'smoke' });
  const b = await r.json();
  console.log(r.status === 200 ? 'OK  ' : 'FAIL', 'ai dailyBrief', JSON.stringify(b).slice(0, 600));
} else {
  console.log('SKIP ai (set GROQ_API_KEY to test)');
}

// ── v3: workspace + signal scoring against live sources ──────────────────────
{
  const ws = (await import('../netlify/functions/workspace.mjs')).default;
  const sig = (await import('../netlify/functions/signals.mjs')).default;
  const origin = 'http://localhost:8888';
  const mk = await ws(new Request(origin + '/api/workspace', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ workspace: { accounts: [{ name: 'Pfizer' }] } }) }), { ip: 'smoke' });
  const created = (await mk.json()).workspace;
  console.log(mk.status === 201 ? 'OK  ' : 'FAIL', 'workspace create      ', created?.id ? 'id ' + created.id.slice(0, 4) + '…' : '');
  const accounts = [
    { id: 'sanofi', name: 'Sanofi' }, { id: 'merck', name: 'Merck & Co.', registryName: 'Merck Sharp & Dohme', aliases: ['Merck', 'MSD'], exclude: ['Merck KGaA'] },
    { id: 'novo', name: 'Novo Nordisk' }, { id: 'lilly', name: 'Eli Lilly', aliases: ['Lilly'] }, { id: 'az', name: 'AstraZeneca' }, { id: 'pfizer', name: 'Pfizer' },
  ];
  const t = Date.now();
  const r = await sig(new Request(origin + '/api/signals', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ accounts }) }), { ip: 'smoke' });
  const d = await r.json();
  const fams = new Set(d.results.flatMap((x) => x.signals.map((s) => s.family)));
  console.log(r.status === 200 && fams.size >= 2 ? 'OK  ' : 'FAIL', 'signals              ', `${Date.now() - t}ms · source families: ${[...fams].join(', ')}`);
  for (const x of d.results.sort((a, b) => b.score - a.score)) console.log(`     ${String(x.score).padStart(3)} ${x.band.padEnd(5)} ${x.name.padEnd(14)} ${x.signals.filter((s) => s.type !== 'mention').map((s) => s.label).join(', ') || 'no triggers'}`);
}
