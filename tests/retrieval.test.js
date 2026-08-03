'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { createWorld } = require('../engine/genesis');
const { recordLedger } = require('../memory/ledger');
const { adjustTrust } = require('../memory/impressions');
const { recordEpisode } = require('../memory/episodes');
const { buildContext } = require('../memory/retrieval');

test('context includes only the parties involved and stays bounded', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const [a, b, c] = agentIds;

  db.prepare('UPDATE inventory SET qty = 4 WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(worldId, a, 'food');
  recordLedger(db, worldId, 1, { from: a, to: b, kind: 'transfer', resource: 'food', qty: 2 });
  recordLedger(db, worldId, 1, { from: a, to: c, kind: 'transfer', resource: 'wood', qty: 9 });
  adjustTrust(db, worldId, a, b, -30, 1, 'broke a promise');
  recordEpisode(db, worldId, 1, a, 'note', 'B haggled hard', b);
  recordEpisode(db, worldId, 1, a, 'note', 'C is quiet', c);

  const ctx = buildContext(db, worldId, 2, a, b);
  assert.equal(ctx.self.id, a);
  assert.equal(ctx.listener.id, b);
  assert.equal(ctx.impression.trust, -30);
  assert.equal(ctx.ledger.length, 1);
  assert.ok(ctx.text.includes('B haggled hard'));
  assert.ok(!ctx.text.includes('C is quiet'), 'unrelated episodes must not leak in');
  assert.ok(ctx.text.includes('food: 4'), 'own true inventory must be present');
  assert.ok(ctx.text.length < 4000, 'context must stay bounded');
});

test('context exposes the secret goal to its owner only', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const [a, b] = agentIds;
  const ctx = buildContext(db, worldId, 1, a, b);
  const goal = db.prepare('SELECT goal_type FROM agents WHERE id = ?').get(a).goal_type;
  assert.ok(ctx.text.includes(goal));
  const other = db.prepare('SELECT goal_type FROM agents WHERE id = ?').get(b).goal_type;
  if (other !== goal) assert.ok(!ctx.text.includes(`SECRET GOAL: ${other}`));
});
