'use strict';
const config = require('../config');
const { recordLedger } = require('../memory/ledger');

// Output is distributed round-robin over the living population in id order. Standing
// agreements are not modelled in v1 — trading is how goods actually move.
function produceAndDistribute(db, worldId, day) {
  const living = db.prepare('SELECT id FROM agents WHERE world_id = ? AND alive = 1 ORDER BY id')
    .all(worldId).map(r => r.id);
  const handed = {};
  if (!living.length) return handed;

  const give = db.prepare(`UPDATE inventory SET qty = qty + 1
    WHERE world_id = ? AND agent_id = ? AND resource = ?`);

  for (const [resource, amount] of Object.entries(config.dailyProduction)) {
    handed[resource] = 0;
    for (let i = 0; i < amount; i += 1) {
      const agentId = living[(day + i) % living.length];
      give.run(worldId, agentId, resource);
      recordLedger(db, worldId, day, { to: agentId, kind: 'production', resource, qty: 1 });
      handed[resource] += 1;
    }
  }
  return handed;
}

module.exports = { produceAndDistribute };
