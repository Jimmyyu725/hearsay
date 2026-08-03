'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { createWorld } = require('../engine/genesis');
const { buildSnapshot } = require('../web/server');

test('snapshot exposes every pane the dashboard needs', () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 3 });
  db.prepare('UPDATE worlds SET day = 7 WHERE id = ?').run(worldId);
  db.prepare(`INSERT INTO lies (world_id, day, speaker, target, resource, claimed, truth)
    VALUES (?, 7, ?, ?, 'food', 0, 4)`).run(worldId, agentIds[0], agentIds[1]);
  db.prepare(`INSERT INTO utterances (world_id, day, round, speaker, listener, text)
    VALUES (?, 7, 1, ?, ?, 'give me your food')`).run(worldId, agentIds[0], agentIds[1]);
  db.prepare(`INSERT INTO impressions (world_id, subject, object, trust, opinion, updated_day)
    VALUES (?, ?, ?, -70, 'liar', 7)`).run(worldId, agentIds[1], agentIds[0]);

  const snap = buildSnapshot(db);
  assert.equal(snap.era, 3);
  assert.equal(snap.day, 7);
  assert.equal(snap.agents.length, 16);
  assert.equal(snap.lies[0].count, 1);
  assert.equal(snap.timeline.length, 1);
  assert.equal(snap.edges[0].trust, -70);
  assert.ok(Array.isArray(snap.prices));
});

test('snapshot on an empty database does not throw', () => {
  const db = openWorldDb(':memory:');
  const snap = buildSnapshot(db);
  assert.equal(snap.day, 0);
  assert.deepEqual(snap.agents, []);
});
