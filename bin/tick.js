'use strict';
// Cron entrypoint. Run under flock so overlapping ticks cannot corrupt a day:
//   */30 * * * * flock -n /home/jimmy/projects/hearsay/.tick.lock \
//     /usr/bin/node --no-warnings /home/jimmy/projects/hearsay/bin/tick.js >> tick.log 2>&1
const config = require('../config');
const { openWorldDb, closeWorldDb } = require('../db/db');
const { advanceDay } = require('../engine/tick');
const { chat } = require('../llm/provider');
const { canSpend, spentToday } = require('../llm/budget');

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const db = openWorldDb(config.dbFile);
  const ymd = today();

  if (!canSpend(db, ymd)) {
    console.log(`[hearsay] spend cap reached ($${spentToday(db, ymd).toFixed(2)}/${config.budget.dailyCapUsd}), skipping`);
    closeWorldDb(db);
    return;
  }

  const days = process.env.HEARSAY_MODE === 'fast' ? Number(process.env.HEARSAY_FAST_DAYS || 5) : 1;
  for (let i = 0; i < days; i += 1) {
    if (!canSpend(db, ymd)) break;
    const result = await advanceDay(db, { chatImpl: chat, ymd });
    console.log(`[hearsay] day ${result.day}: ${result.ate.length} ate, ${result.starved.length} hungry, ` +
      `${result.eliminated.length} eliminated, ${result.born.length} born, ${result.utterances} utterances`);
  }

  console.log(`[hearsay] spent today: $${spentToday(db, ymd).toFixed(4)}`);
  closeWorldDb(db);
}

main().catch((error) => {
  console.error('[hearsay] tick failed:', error.message);
  process.exitCode = 1;
});
