'use strict';
const config = require('../config');
const { inventoryOf } = require('../memory/retrieval');
const { recordEpisode } = require('../memory/episodes');

const RESOURCES = new Set(Object.keys(config.dailyProduction));

// Deliberately not an LLM judgement. The engine holds ground truth, so a lie is a
// string-to-state comparison: free, deterministic and impossible to argue with.
function checkClaims(db, worldId, day, speakerId, listenerId, claims = []) {
  const truth = inventoryOf(db, worldId, speakerId);
  const insert = db.prepare(`INSERT INTO lies (world_id, day, speaker, target, resource, claimed, truth)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const found = [];

  for (const claim of claims) {
    if (!claim || !RESOURCES.has(claim.resource)) continue;
    const claimed = Number(claim.qty);
    if (!Number.isFinite(claimed)) continue;
    const actual = truth[claim.resource] ?? 0;
    if (claimed === actual) continue;

    insert.run(worldId, day, speakerId, listenerId, claim.resource, claimed, actual);
    recordEpisode(db, worldId, day, speakerId, 'note',
      `told #${listenerId} I had ${claimed} ${claim.resource} (really ${actual})`, listenerId);
    found.push({ resource: claim.resource, claimed, truth: actual });
  }

  return found;
}

module.exports = { checkClaims };
