'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { advanceDay, currentWorld, archiveAndRestart } = require('../engine/tick');
const config = require('../config');

const chatImpl = async () => ({ content: JSON.stringify({ say: 'hello', claims: [], offer: null }) });

test('the first tick creates a world and advances it to day 1', async () => {
  const db = openWorldDb(':memory:');
  const result = await advanceDay(db, { chatImpl, ymd: '2026-08-03' });
  assert.equal(result.day, 1);
  const world = currentWorld(db);
  assert.equal(world.day, 1);
  assert.equal(world.era, 1);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM agents WHERE world_id = ? AND alive = 1').get(world.id).n,
    config.population);
});

test('consecutive ticks keep the population constant', async () => {
  const db = openWorldDb(':memory:');
  for (let i = 0; i < 4; i += 1) await advanceDay(db, { chatImpl, ymd: '2026-08-03' });
  const world = currentWorld(db);
  assert.equal(world.day, 4);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM agents WHERE world_id = ? AND alive = 1').get(world.id).n,
    config.population);
});

test('archiveAndRestart closes the era and opens the next one', () => {
  const db = openWorldDb(':memory:');
  db.prepare("INSERT INTO worlds (era, day, status, started_at) VALUES (1, 9, 'alive', '2026-08-03')").run();
  const next = archiveAndRestart(db, 9);
  assert.equal(next.era, 2);
  const old = db.prepare('SELECT status, ended_at FROM worlds WHERE era = 1').get();
  assert.equal(old.status, 'archived');
  assert.ok(old.ended_at);
});
