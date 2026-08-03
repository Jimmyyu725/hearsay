'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { createWorld } = require('../engine/genesis');
const { parseReply, runConversations } = require('../engine/conversation');
const config = require('../config');

test('parseReply tolerates prose around the JSON and bad shapes', () => {
  const good = parseReply('Sure thing.\n{"say":"I have nothing","claims":[{"resource":"food","qty":0}]}');
  assert.equal(good.say, 'I have nothing');
  assert.equal(good.claims.length, 1);

  const broken = parseReply('no json at all');
  assert.equal(broken.say, '');
  assert.deepEqual(broken.claims, []);
  assert.equal(broken.offer, null);
});

test('a full day of conversation writes utterances and honours the round count', async () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  db.prepare('UPDATE inventory SET qty = 5 WHERE world_id = ? AND resource = ?').run(worldId, 'food');

  let calls = 0;
  const chatImpl = async () => {
    calls += 1;
    return { content: JSON.stringify({ say: `line ${calls}`, claims: [{ resource: 'food', qty: 0 }] }) };
  };

  const said = await runConversations(db, worldId, 1, { chatImpl, ymd: '2026-08-03' });
  const living = agentIds.length;
  assert.equal(said.length, config.conversationRounds * living);

  const rows = db.prepare('SELECT COUNT(*) AS n FROM utterances WHERE world_id = ?').get(worldId);
  assert.equal(rows.n, config.conversationRounds * living);

  // Every speaker claimed 0 food while holding 5, so every utterance is a recorded lie.
  const lies = db.prepare('SELECT COUNT(*) AS n FROM lies WHERE world_id = ?').get(worldId);
  assert.equal(lies.n, config.conversationRounds * living);
});

test('a transfer offer moves goods and is written to the ledger', async () => {
  const db = openWorldDb(':memory:');
  const { worldId, agentIds } = createWorld(db, { era: 1 });
  const [a] = agentIds;
  db.prepare('UPDATE inventory SET qty = 4 WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(worldId, a, 'wood');

  const chatImpl = async (messages) => {
    const isA = messages[1].content.includes(`(#${a})`);
    return {
      content: JSON.stringify(isA
        ? { say: 'take it', claims: [], offer: { resource: 'wood', qty: 2 } }
        : { say: 'ok', claims: [] }),
    };
  };

  await runConversations(db, worldId, 1, { chatImpl, ymd: '2026-08-03', rounds: 1 });
  const transfers = db.prepare(
    "SELECT COUNT(*) AS n FROM ledger WHERE world_id = ? AND kind = 'transfer'").get(worldId);
  assert.ok(transfers.n >= 1);
});
