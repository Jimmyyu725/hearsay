'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { createWorld } = require('../engine/genesis');
const { mapWithLimit, runConversations } = require('../engine/conversation');
const config = require('../config');

test('mapWithLimit preserves order and respects the concurrency ceiling', async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 20 }, (_, i) => i);

  const out = await mapWithLimit(items, 4, async (value) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise(resolve => setImmediate(resolve));
    inFlight -= 1;
    return value * 2;
  });

  assert.deepEqual(out, items.map(i => i * 2));
  assert.ok(peak <= 4, `peak concurrency was ${peak}`);
  assert.ok(peak > 1, 'calls should actually overlap');
});

test('a round overlaps its calls instead of running them one at a time', async () => {
  const db = openWorldDb(':memory:');
  const { worldId } = createWorld(db, { era: 1 });

  let inFlight = 0;
  let peak = 0;
  const chatImpl = async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise(resolve => setImmediate(resolve));
    inFlight -= 1;
    return { content: JSON.stringify({ say: 'hi', claims: [], offer: null }) };
  };

  await runConversations(db, worldId, 1, { chatImpl, ymd: '2026-08-03', rounds: 1 });
  assert.ok(peak > 1, `expected overlapping calls, peak was ${peak}`);
  assert.ok(peak <= config.conversationConcurrency);
});

test('one failing agent turn does not abort the day', async () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });

  let calls = 0;
  const chatImpl = async () => {
    calls += 1;
    if (calls === 3) throw new Error('upstream hiccup');
    return { content: JSON.stringify({ say: 'still here', claims: [], offer: null }) };
  };

  const said = await runConversations(db, worldId, 1, { chatImpl, ymd: '2026-08-03', rounds: 1 });
  assert.equal(said.length, agentIds.length);
  const rows = db.prepare('SELECT COUNT(*) AS n FROM utterances WHERE world_id = ?').get(worldId);
  assert.equal(rows.n, agentIds.length);
  assert.equal(said.filter(s => s.say === '').length, 1);
});
