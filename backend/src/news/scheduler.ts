import cron from 'node-cron';
import { getConfig } from '../config.js';
import { runNews, isNewsRunning } from './pipeline.js';
import { flushDueNotifications } from '../notify.js';

let newsTask: cron.ScheduledTask | null = null;
let flushTask: cron.ScheduledTask | null = null;

/** (Re)start the daily news cron from app_config, plus the per-minute push flush. */
export async function rescheduleNews(): Promise<void> {
  if (newsTask) { newsTask.stop(); newsTask = null; }

  const enabled = await getConfig('news.enabled');
  const schedule = await getConfig('news.cron');
  if (!enabled) {
    console.log('[news] disabled');
  } else if (!cron.validate(schedule)) {
    console.error(`[news] invalid cron "${schedule}", not scheduling`);
  } else {
    newsTask = cron.schedule(schedule, () => {
      if (isNewsRunning()) return;
      runNews('cron').catch(e => console.error('[news] cron run failed:', e));
    });
    console.log(`[news] scheduled: ${schedule}`);
  }

  // Notification flush is independent of news.enabled (delivers deferred pushes).
  if (!flushTask) {
    flushTask = cron.schedule('* * * * *', () => {
      flushDueNotifications().catch(e => console.error('[notify] flush failed:', e));
    });
    console.log('[notify] flush scheduled: every minute');
  }
}
