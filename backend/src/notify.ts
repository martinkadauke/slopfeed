import sql from './db.js';
import { sendPush } from './push.js';

// ── Timezone math (no external lib) ────────────────────────────────────────
/** Offset (ms) of `tz` from UTC at the given instant. tz ahead of UTC → positive. */
function offsetMs(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? '0' : p.hour), +p.minute, +p.second);
  return asUTC - date.getTime();
}

/** Current local hour (0..23) in tz. */
function localHour(tz: string, now: Date): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit' }).format(now);
  const n = parseInt(h, 10);
  return n === 24 ? 0 : n;
}

/** Local Y/M/D in tz. */
function localYMD(tz: string, now: Date): { y: number; m: number; d: number } {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day };
}

/** UTC instant corresponding to a wall-clock time in tz. */
function localWallToUtc(tz: string, y: number, m: number, d: number, hh: number): Date {
  const guess = Date.UTC(y, m - 1, d, hh, 0, 0);
  const off = offsetMs(tz, new Date(guess));
  return new Date(guess - off);
}

function isQuiet(hour: number, start: number, end: number): boolean {
  if (start === end) return false;            // empty window → never quiet
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;         // wraps midnight
}

/** When may we push to this user? now if outside quiet hours, else the next
 *  local quiet-end. Defensive: bad tz falls back to immediate delivery. */
export function nextDeliverAt(tz: string, quietStart: number, quietEnd: number, now: Date): Date {
  try {
    const hour = localHour(tz, now);
    if (!isQuiet(hour, quietStart, quietEnd)) return now;
    const { y, m, d } = localYMD(tz, now);
    let target = localWallToUtc(tz, y, m, d, quietEnd);   // today at quiet-end
    if (target.getTime() <= now.getTime()) target = new Date(target.getTime() + 86_400_000); // → tomorrow
    return target;
  } catch {
    return now;
  }
}

// ── Enqueue + flush ────────────────────────────────────────────────────────
export interface NotifyContent { title: string; body: string; url: string }

/** Enqueue a push for every user subscribed to `topicId`, scheduled to respect
 *  each user's timezone quiet hours. */
export async function enqueueTopicNotifications(topicId: number, articleId: number, c: NotifyContent): Promise<number> {
  const subs = await sql`
    SELECT u.id, u.timezone, u.quiet_start, u.quiet_end
    FROM user_topic ut JOIN users u ON u.id = ut.user_id
    WHERE ut.topic_id = ${topicId}
  `;
  const now = new Date();
  for (const u of subs) {
    const deliverAt = nextDeliverAt(u.timezone as string, u.quiet_start as number, u.quiet_end as number, now);
    await sql`
      INSERT INTO pending_notification (user_id, article_id, title, body, url, deliver_at)
      VALUES (${u.id as number}, ${articleId}, ${c.title}, ${c.body}, ${c.url}, ${deliverAt})
    `;
  }
  return subs.length;
}

/** Send all due, unsent notifications. Called by a frequent cron. */
export async function flushDueNotifications(): Promise<number> {
  const due = await sql`
    SELECT id, user_id, article_id, title, body, url
    FROM pending_notification
    WHERE sent_at IS NULL AND deliver_at <= NOW()
    ORDER BY deliver_at
    LIMIT 200
  `;
  let sent = 0;
  for (const n of due) {
    try {
      await sendPush(n.user_id as number, {
        title: n.title as string, body: n.body as string,
        url: (n.url as string) ?? '/', tag: `article-${n.article_id}`,
      });
      sent++;
    } catch (e) {
      console.error('[notify] push failed:', (e as Error).message);
    }
    await sql`UPDATE pending_notification SET sent_at = NOW() WHERE id = ${n.id as number}`;
  }
  return sent;
}
