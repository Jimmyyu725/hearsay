'use strict';
const config = require('../config');
const { createWorld } = require('./genesis');
const { produceAndDistribute } = require('./production');
const { runConversations } = require('./conversation');
const { settle } = require('./settlement');
const { replaceEliminated } = require('./turnover');
const { pruneEpisodes } = require('../memory/episodes');

function currentWorld(db) {
  return db.prepare("SELECT * FROM worlds WHERE status = 'alive' ORDER BY era DESC LIMIT 1").get() || null;
}

function archiveAndRestart(db, day) {
  const world = currentWorld(db);
  const nextEra = world ? world.era + 1 : 1;
  if (world) {
    db.prepare("UPDATE worlds SET status = 'archived', ended_at = ?, day = ? WHERE id = ?")
      .run(new Date().toISOString(), day, world.id);
  }
  createWorld(db, { era: nextEra });
  return currentWorld(db);
}

// A world with nobody left, or one that has produced no events for several days, is not a
// failure — it is the end of an era. The record stays browsable and a new island opens.
function isDead(db, worldId, day) {
  const living = db.prepare(
    'SELECT COUNT(*) AS n FROM agents WHERE world_id = ? AND alive = 1').get(worldId).n;
  if (living < 2) return true;

  const since = day - config.deadWorld.noEventDays;
  if (since < 1) return false;
  const events = db.prepare(
    'SELECT COUNT(*) AS n FROM utterances WHERE world_id = ? AND day > ?').get(worldId, since).n;
  return events === 0;
}

async function advanceDay(db, deps) {
  let world = currentWorld(db);
  if (!world) {
    createWorld(db, { era: 1 });
    world = currentWorld(db);
  }

  const day = world.day + 1;
  produceAndDistribute(db, world.id, day);
  const utterances = await runConversations(db, world.id, day, deps);
  const { ate, starved, eliminated } = settle(db, world.id, day);
  const born = replaceEliminated(db, world.id, day);
  pruneEpisodes(db, world.id);

  db.prepare('UPDATE worlds SET day = ? WHERE id = ?').run(day, world.id);

  if (isDead(db, world.id, day)) archiveAndRestart(db, day);

  return {
    worldId: world.id, day, ate, starved, eliminated, born,
    utterances: utterances.length,
  };
}

module.exports = { advanceDay, currentWorld, archiveAndRestart, isDead };
