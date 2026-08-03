'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { createWorld } = require('../engine/genesis');
const { checkClaims } = require('../engine/lies');

test('a claim that contradicts true inventory is recorded as a lie', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const [a, b] = agentIds;
  db.prepare('UPDATE inventory SET qty = 3 WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(worldId, a, 'medicine');

  const lies = checkClaims(db, worldId, 5, a, b, [{ resource: 'medicine', qty: 0 }]);
  assert.equal(lies.length, 1);
  assert.equal(lies[0].claimed, 0);
  assert.equal(lies[0].truth, 3);

  const stored = db.prepare('SELECT * FROM lies WHERE world_id = ? AND speaker = ?').all(worldId, a);
  assert.equal(stored.length, 1);
});

test('a truthful claim records nothing', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const [a, b] = agentIds;
  db.prepare('UPDATE inventory SET qty = 2 WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(worldId, a, 'food');
  assert.equal(checkClaims(db, worldId, 5, a, b, [{ resource: 'food', qty: 2 }]).length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lies WHERE world_id = ?').get(worldId).n, 0);
});

test('unknown resources in a claim are ignored rather than counted as lies', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const [a, b] = agentIds;
  assert.equal(checkClaims(db, worldId, 5, a, b, [{ resource: 'gold', qty: 99 }]).length, 0);
});
