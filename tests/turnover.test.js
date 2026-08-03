'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { createWorld } = require('../engine/genesis');
const { crossbreed, replaceEliminated } = require('../engine/turnover');
const config = require('../config');

test('crossbreed averages parents and mutates exactly one trait', () => {
  const a = { honesty: 100, aggression: 0, loyalty: 50, greed: 20, paranoia: 80 };
  const b = { honesty: 0, aggression: 100, loyalty: 50, greed: 40, paranoia: 20 };
  // rng: first call picks the trait index, second call drives the mutation size.
  const values = [0, 1];
  let i = 0;
  const child = crossbreed(a, b, () => values[i++ % values.length]);

  let mutated = 0;
  for (const trait of config.personalityTraits) {
    const mean = Math.round((a[trait] + b[trait]) / 2);
    if (child[trait] !== mean) mutated += 1;
    assert.ok(child[trait] >= 0 && child[trait] <= 100);
  }
  assert.equal(mutated, 1);
});

test('every eliminated agent is replaced so population stays constant', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  db.prepare('UPDATE agents SET alive = 0, died_day = 4 WHERE id IN (?, ?)').run(agentIds[0], agentIds[1]);

  const created = replaceEliminated(db, worldId, 5);
  assert.equal(created.length, 2);

  const living = db.prepare('SELECT COUNT(*) AS n FROM agents WHERE world_id = ? AND alive = 1').get(worldId).n;
  assert.equal(living, config.population);

  for (const id of created) {
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    assert.equal(row.born_day, 5);
    assert.ok(row.parents && row.parents.includes(','));
    const inv = db.prepare('SELECT COUNT(*) AS n FROM inventory WHERE world_id = ? AND agent_id = ?')
      .get(worldId, id).n;
    assert.equal(inv, Object.keys(config.dailyProduction).length);
  }
});
