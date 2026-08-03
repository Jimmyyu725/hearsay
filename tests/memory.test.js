'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { createWorld } = require('../engine/genesis');
const { recordLedger, ledgerBetween } = require('../memory/ledger');
const { adjustTrust, decayGoodwill, getImpression } = require('../memory/impressions');
const { recordEpisode, pruneEpisodes, episodesAbout } = require('../memory/episodes');
const config = require('../config');

function freshWorld() {
  const db = openWorldDb(':memory:');
  const world = createWorld(db, { era: 1 });
  return { db, ...world };
}

test('ledger records and reads back a two-way history', () => {
  const { db, worldId, agentIds } = freshWorld();
  const [a, b] = agentIds;
  recordLedger(db, worldId, 1, { from: a, to: b, kind: 'transfer', resource: 'food', qty: 2 });
  recordLedger(db, worldId, 2, { from: b, to: a, kind: 'promise', resource: 'medicine', qty: 1, note: 'tomorrow' });
  const rows = ledgerBetween(db, worldId, a, b);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, 'transfer');
});

test('trust clamps to the configured range', () => {
  const { db, worldId, agentIds } = freshWorld();
  const [a, b] = agentIds;
  adjustTrust(db, worldId, a, b, 500, 1, 'saved my life');
  assert.equal(getImpression(db, worldId, a, b).trust, config.trust.max);
  adjustTrust(db, worldId, a, b, -1000, 1, 'betrayed me');
  assert.equal(getImpression(db, worldId, a, b).trust, config.trust.min);
});

test('goodwill decays but grudges do not', () => {
  const { db, worldId, agentIds } = freshWorld();
  const [a, b, c] = agentIds;
  adjustTrust(db, worldId, a, b, 40, 1, 'helpful');
  adjustTrust(db, worldId, a, c, -40, 1, 'liar');
  decayGoodwill(db, worldId, 2);
  assert.equal(getImpression(db, worldId, a, b).trust, 40 - config.trust.goodwillDecayPerDay);
  assert.equal(getImpression(db, worldId, a, c).trust, -40);
});

test('pruning keeps recent episodes and every betrayal', () => {
  const { db, worldId, agentIds } = freshWorld();
  const [a, b] = agentIds;
  recordEpisode(db, worldId, 1, a, 'betrayal', 'B broke a promise', b);
  for (let day = 2; day < 2 + config.episodes.keepRecent + 10; day += 1) {
    recordEpisode(db, worldId, day, a, 'note', `day ${day} was uneventful`, b);
  }
  pruneEpisodes(db, worldId);
  const rows = db.prepare('SELECT kind FROM episodes WHERE world_id = ? AND agent_id = ?').all(worldId, a);
  assert.equal(rows.filter(r => r.kind === 'betrayal').length, 1);
  assert.equal(rows.filter(r => r.kind === 'note').length, config.episodes.keepRecent);
  assert.ok(episodesAbout(db, worldId, a, b).length > 0);
});
