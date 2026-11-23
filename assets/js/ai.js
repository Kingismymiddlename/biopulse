// Shared AI presentation helpers.
import { esc, safeUrl } from './util.js';

const TIPS = {
  ai_not_configured: 'The site owner needs to add GROQ_API_KEY in Netlify (Site configuration → Environment variables) and redeploy.',
  ai_bad_key: 'The Groq key on the server was rejected. Generate a new key at console.groq.com and update GROQ_API_KEY in Netlify.',
  no_backend: 'This copy of BioPulse is not connected to a backend. Set the API base URL in Settings.',
  limit_ip: 'Hourly limit reached for your connection.',
  limit_global: "The site's daily AI budget is used up.",
};

export function aiErrorHtml(e) {
  const replace = ['ai_not_configured', 'ai_bad_key', 'no_backend'].includes(e.code);
  const body = replace ? TIPS[e.code] : e.message + (TIPS[e.code] ? ' ' + TIPS[e.code] : '');
  return `<div class="card"><div class="card-hd red">Couldn't generate</div><p>${esc(body)}</p></div>`;
}

export const refLinks = (sources, refs) =>
  (sources || [])
    .map((n) => {
      const it = refs[n - 1];
      if (!it) return '';
      return `<a class="ref" href="${esc(safeUrl(it.link || it.url) || '#')}" target="_blank" rel="noopener noreferrer" title="${esc((it.source || '') + ': ' + it.title)}">${n}</a>`;
    })
    .join('');
