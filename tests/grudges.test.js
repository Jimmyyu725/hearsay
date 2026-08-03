'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { createWorld } = require('../engine/genesis');
const { checkClaims } = require('../engine/lies');
const { settle, revealLies } = require('../engine/settlement');
const { getImpression } = require('../memory/impressions');
const config = require('../config');

test('a lie told today is discovered at settlement and costs trust permanently', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const [a, b] = agentIds;

  db.prepare('UPDATE inventory SET qty = 4 WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(worldId, a, 'medicine');
  checkClaims(db, worldId, 1, a, b, [{ resource: 'medicine', qty: 0 }]);

  assert.equal(getImpression(db, worldId, b, a).trust, 0, 'trust is untouched before settlement');

  settle(db, worldId, 1);

  const after = getImpression(db, worldId, b, a).trust;
  assert.ok(after <= -10, `expected a grudge, trust was ${after}`);
  assert.match(after === 0 ? '' : getImpression(db, worldId, b, a).opinion, /lied/);

  const betrayals = db.prepare(
    "SELECT COUNT(*) AS n FROM episodes WHERE world_id = ? AND kind = 'betrayal' AND agent_id = ?")
    .get(worldId, b).n;
  assert.equal(betrayals, 1);
});

test('a grudge does not decay while goodwill does', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const [a, b] = agentIds;

  db.prepare('UPDATE inventory SET qty = 3 WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(worldId, a, 'food');
  checkClaims(db, worldId, 1, a, b, [{ resource: 'food', qty: 0 }]);
  settle(db, worldId, 1);
  const grudge = getImpression(db, worldId, b, a).trust;

  for (let day = 2; day <= 6; day += 1) settle(db, worldId, day);
  assert.equal(getImpression(db, worldId, b, a).trust, grudge, 'grudges must never fade');
});

test('bigger lies cost more trust than small ones', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const [a, b, c, d] = agentIds;

  db.prepare('UPDATE inventory SET qty = 1 WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(worldId, a, 'wood');
  db.prepare('UPDATE inventory SET qty = 8 WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(worldId, c, 'wood');
  checkClaims(db, worldId, 1, a, b, [{ resource: 'wood', qty: 0 }]);
  checkClaims(db, worldId, 1, c, d, [{ resource: 'wood', qty: 0 }]);
  revealLies(db, worldId, 1);

  assert.ok(getImpression(db, worldId, d, c).trust < getImpression(db, worldId, b, a).trust);
});

test('the token ceiling leaves room for content after reasoning', () => {
  // A high reasoning effort spent an entire 800-token budget thinking and returned nothing.
  assert.ok(config.llm.maxTokens >= 2000,
    `max_tokens ${config.llm.maxTokens} is too tight for reasoning_effort "${config.llm.effort}"`);
});
