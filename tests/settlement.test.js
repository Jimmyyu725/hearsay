'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { createWorld } = require('../engine/genesis');
const { produceAndDistribute } = require('../engine/production');
const { settle } = require('../engine/settlement');
const config = require('../config');

test('production hands out exactly the island output', () => {
  const db = openWorldDb(':memory:');
  const { worldId } = createWorld(db, { era: 1 });
  const handed = produceAndDistribute(db, worldId, 1);
  for (const [resource, amount] of Object.entries(config.dailyProduction)) {
    assert.equal(handed[resource], amount);
    const total = db.prepare(
      'SELECT COALESCE(SUM(qty),0) AS n FROM inventory WHERE world_id = ? AND resource = ?')
      .get(worldId, resource).n;
    assert.equal(total, amount);
  }
});

test('eating consumes one food and resets the hunger counter', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const a = agentIds[0];
  db.prepare('UPDATE inventory SET qty = 3 WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(worldId, a, 'food');
  db.prepare('UPDATE agents SET hungry_days = 2 WHERE id = ?').run(a);

  const result = settle(db, worldId, 1);
  assert.ok(result.ate.includes(a));
  const after = db.prepare('SELECT qty FROM inventory WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .get(worldId, a, 'food').qty;
  assert.equal(after, 2);
  assert.equal(db.prepare('SELECT hungry_days FROM agents WHERE id = ?').get(a).hungry_days, 0);
});

test('three consecutive foodless days eliminates an agent', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const a = agentIds[0];
  for (let day = 1; day <= config.starvationDeathDays; day += 1) settle(db, worldId, day);
  const row = db.prepare('SELECT alive, died_day, hungry_days FROM agents WHERE id = ?').get(a);
  assert.equal(row.alive, 0);
  assert.equal(row.died_day, config.starvationDeathDays);
  assert.equal(row.hungry_days, config.starvationDeathDays);
});
