'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { createWorld } = require('../engine/genesis');
const config = require('../config');

test('createWorld seats a full population split across two tribes', () => {
  const db = openWorldDb(':memory:');
  const { worldId } = createWorld(db, { era: 1 });

  const agents = db.prepare('SELECT * FROM agents WHERE world_id = ?').all(worldId);
  assert.equal(agents.length, config.population);

  const byTribe = {};
  for (const a of agents) byTribe[a.tribe] = (byTribe[a.tribe] || 0) + 1;
  assert.deepEqual(Object.keys(byTribe).sort(), [...config.tribes].sort());
  for (const tribe of config.tribes) {
    assert.equal(byTribe[tribe], config.population / config.tribes.length);
  }

  for (const a of agents) {
    assert.equal(a.alive, 1);
    for (const trait of config.personalityTraits) {
      assert.ok(a[trait] >= 0 && a[trait] <= 100, `${trait} out of range`);
    }
    assert.ok(a.goal_type.length > 0);
  }
});

test('createWorld gives every agent an inventory row per resource', () => {
  const db = openWorldDb(':memory:');
  const { worldId } = createWorld(db, { era: 1 });
  const rows = db.prepare('SELECT COUNT(*) AS n FROM inventory WHERE world_id = ?').get(worldId);
  assert.equal(rows.n, config.population * Object.keys(config.dailyProduction).length);
});

test('a protect goal never targets the agent itself', () => {
  const db = openWorldDb(':memory:');
  const { worldId } = createWorld(db, { era: 1 });
  const rows = db.prepare(
    "SELECT id, goal_target FROM agents WHERE world_id = ? AND goal_type IN ('protect','bankrupt')").all(worldId);
  for (const r of rows) assert.notEqual(String(r.id), String(r.goal_target));
});
