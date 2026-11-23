// Scheduled: Mondays, hourly 01:30-06:30 UTC (07:00-12:00 IST). Each run sends to
// workspaces not yet handled this week, so a run that hits the time limit is
// finished by the next one.
import { listWorkspaceIds, loadWorkspace, saveWorkspace } from '../lib/workspace.mjs';
import { selectDigest, renderDigest, sendEmail, emailConfigured } from '../lib/digest.mjs';
import { scoreWorkspace } from './digest.mjs';

export function weekStart(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * 86400000);
}

export async function runDigest({ now = new Date(), budgetMs = 24000 } = {}) {
  const started = Date.now();
  const summary = { sent: 0, skipped: 0, failed: 0, pending: 0 };
  if (!emailConfigured()) return { ...summary, note: 'email not configured' };
  const since = weekStart(now).getTime();
  for (const id of await listWorkspaceIds()) {
    if (Date.now() - started > budgetMs) {
      summary.pending++;
      continue;
    }
    const ws = await loadWorkspace(id);
    if (!ws?.digest?.enabled || !ws.digest.email || !ws.accounts?.length) continue;
    if (ws.digest.lastSentAt && Date.parse(ws.digest.lastSentAt) >= since) continue;
    try {
      const results = await scoreWorkspace(ws, now);
      const { rows, newIds } = selectDigest(ws, results, { mode: 'weekly', now: now.getTime() });
      if (rows.length) {
        await sendEmail({ to: ws.digest.email, ...renderDigest(ws, rows, { mode: 'weekly', now }) });
        summary.sent++;
      } else {
        summary.skipped++;
      }
      ws.digest.sentIds = [...new Set([...(ws.digest.sentIds || []), ...newIds])].slice(-300);
      ws.digest.lastSentAt = now.toISOString();
      await saveWorkspace(ws);
    } catch (e) {
      summary.failed++;
      console.error('[digest-weekly]', id.slice(0, 4) + '…', e.code || '', e.message);
    }
  }
  return summary;
}

export default async () => {
  const s = await runDigest();
  console.log('[digest-weekly]', JSON.stringify(s));
  return new Response(JSON.stringify(s), { headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '30 1-6 * * 1' };
