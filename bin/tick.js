'use strict';
// Cron entrypoint:
//   */30 * * * * flock -n /home/jimmy/projects/hearsay/.tick.lock \
//     /usr/bin/node --no-warnings /home/jimmy/projects/hearsay/bin/tick.js >> tick.log 2>&1
//
// The lock is also taken here, not only in the cron line. A manual run that skipped flock
// once overlapped a scheduled tick and produced a day with 176 utterances instead of 96.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { openWorldDb, closeWorldDb } = require('../db/db');
const { advanceDay } = require('../engine/tick');
const { chat } = require('../llm/provider');
const { canSpend, spentToday } = require('../llm/budget');

const LOCK_FILE = path.join(__dirname, '..', '.tick.pid.lock');

// Exclusive create is the lock. A leftover file from a killed process is reclaimed only
// when its recorded pid is genuinely gone.
function acquireLock() {
  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const holder = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim());
    try {
      process.kill(holder, 0);
      return false;
    } catch (_) {
      fs.unlinkSync(LOCK_FILE);
      return acquireLock();
    }
  }
}

function releaseLock() {
  try {
    if (Number(fs.readFileSync(LOCK_FILE, 'utf8').trim()) === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch (_) { /* already gone */ }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  if (!acquireLock()) {
    console.log('[hearsay] another tick is already running, skipping');
    return;
  }
  process.on('exit', releaseLock);

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

if (require.main === module) {
  main().catch((error) => {
    console.error('[hearsay] tick failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { acquireLock, releaseLock, LOCK_FILE };
