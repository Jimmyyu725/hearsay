'use strict';
const config = require('../config');
const { recordLedger } = require('../memory/ledger');
const { recordEpisode } = require('../memory/episodes');
const { decayGoodwill, adjustTrust } = require('../memory/impressions');

// The island is small: at the end of the day everyone sees who actually ate and who was
// holding out. Every lie told during the day is therefore discovered at settlement.
//
// Without this step lies had no social consequence at all — the lie board filled up while
// trust never moved, so grudges never formed and the relationship graph stayed empty.
// The permanent 'betrayal' episode is what makes the memory asymmetry bite.
function revealLies(db, worldId, day) {
  const lies = db.prepare(
    'SELECT speaker, target, resource, claimed, truth FROM lies WHERE world_id = ? AND day = ?')
    .all(worldId, day);

  for (const lie of lies) {
    const severity = Math.abs(lie.truth - lie.claimed);
    adjustTrust(db, worldId, lie.target, lie.speaker, -(10 + severity * 5), day,
      `lied to me about ${lie.resource}`);
    recordEpisode(db, worldId, day, lie.target, 'betrayal',
      `#${lie.speaker} claimed ${lie.claimed} ${lie.resource} but held ${lie.truth}`, lie.speaker);
  }

  return lies;
}

function settle(db, worldId, day) {
  const living = db.prepare('SELECT * FROM agents WHERE world_id = ? AND alive = 1 ORDER BY id').all(worldId);
  const ate = [];
  const starved = [];
  const eliminated = [];

  const foodOf = db.prepare(
    'SELECT qty FROM inventory WHERE world_id = ? AND agent_id = ? AND resource = ?');
  const eat = db.prepare(
    'UPDATE inventory SET qty = qty - 1 WHERE world_id = ? AND agent_id = ? AND resource = ?');
  const setHunger = db.prepare('UPDATE agents SET hungry_days = ? WHERE id = ?');
  const kill = db.prepare('UPDATE agents SET alive = 0, died_day = ? WHERE id = ?');

  for (const agent of living) {
    const food = foodOf.get(worldId, agent.id, 'food');
    if (food && food.qty > 0) {
      eat.run(worldId, agent.id, 'food');
      setHunger.run(0, agent.id);
      ate.push(agent.id);
      recordLedger(db, worldId, day, { to: agent.id, kind: 'ate', resource: 'food', qty: 1 });
      continue;
    }

    const hungry = agent.hungry_days + 1;
    setHunger.run(hungry, agent.id);
    starved.push(agent.id);
    recordEpisode(db, worldId, day, agent.id, 'note', `went hungry (${hungry} days in a row)`);

    if (hungry >= config.starvationDeathDays) {
      kill.run(day, agent.id);
      eliminated.push(agent.id);
      recordLedger(db, worldId, day, { to: agent.id, kind: 'eliminated', note: 'starvation' });
    }
  }

  const revealed = revealLies(db, worldId, day);
  decayGoodwill(db, worldId, day);

  db.prepare(`INSERT INTO days (world_id, day, summary, starved, eliminated)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (world_id, day) DO UPDATE SET
      summary = excluded.summary, starved = excluded.starved, eliminated = excluded.eliminated`)
    .run(worldId, day,
      `${ate.length} ate, ${starved.length} went hungry, ${eliminated.length} eliminated`,
      starved.length, eliminated.length);

  return { ate, starved, eliminated, revealed: revealed.length };
}

module.exports = { settle, revealLies };
