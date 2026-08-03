'use strict';
const config = require('../config');
const { NAMES, assignGoal } = require('./genesis');
const { recordLedger } = require('../memory/ledger');

const MUTATION_RANGE = 40; // +/- 20 around the parental mean

// Average the parents, then knock exactly one trait off course. Averaging alone would
// collapse the population toward the mean within a few generations.
function crossbreed(parentA, parentB, rng = Math.random) {
  const child = {};
  for (const trait of config.personalityTraits) {
    child[trait] = Math.round((parentA[trait] + parentB[trait]) / 2);
  }
  const traits = config.personalityTraits;
  const index = Math.min(traits.length - 1, Math.floor(rng() * traits.length));
  const shift = Math.round(rng() * MUTATION_RANGE) - MUTATION_RANGE / 2;
  const picked = traits[index];
  child[picked] = Math.max(0, Math.min(100, child[picked] + (shift === 0 ? 1 : shift)));
  return child;
}

function longestSurvivors(db, worldId, limit = 2) {
  return db.prepare(`SELECT * FROM agents
    WHERE world_id = ? AND alive = 1
    ORDER BY born_day ASC, id ASC LIMIT ?`).all(worldId, limit);
}

function replaceEliminated(db, worldId, day, rng = Math.random) {
  const alive = db.prepare(
    'SELECT COUNT(*) AS n FROM agents WHERE world_id = ? AND alive = 1').get(worldId).n;
  const needed = config.population - alive;
  if (needed <= 0) return [];

  const parents = longestSurvivors(db, worldId, 2);
  if (parents.length < 2) return [];

  const insert = db.prepare(`INSERT INTO agents
    (world_id, name, tribe, alive, born_day, honesty, aggression, loyalty, greed, paranoia,
     goal_type, goal_target, parents, hungry_days)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`);
  const insertInventory = db.prepare(
    'INSERT INTO inventory (world_id, agent_id, resource, qty) VALUES (?, ?, ?, 0)');

  const created = [];
  for (let i = 0; i < needed; i += 1) {
    const child = crossbreed(parents[0], parents[1], rng);
    const tribe = config.tribes[i % config.tribes.length];
    const seq = db.prepare('SELECT COUNT(*) AS n FROM agents WHERE world_id = ?').get(worldId).n;
    const name = `${NAMES[seq % NAMES.length]}-${Math.floor(seq / NAMES.length) + 2}`;

    insert.run(worldId, name, tribe, day,
      child.honesty, child.aggression, child.loyalty, child.greed, child.paranoia,
      'pending', null, `${parents[0].id},${parents[1].id}`);
    const id = db.prepare('SELECT last_insert_rowid() AS id').get().id;

    const living = db.prepare('SELECT id FROM agents WHERE world_id = ? AND alive = 1').all(worldId).map(r => r.id);
    const goal = assignGoal(living.indexOf(id), living, rng);
    db.prepare('UPDATE agents SET goal_type = ?, goal_target = ? WHERE id = ?').run(goal.type, goal.target, id);

    for (const resource of Object.keys(config.dailyProduction)) insertInventory.run(worldId, id, resource);
    recordLedger(db, worldId, day, { to: id, kind: 'born', note: `child of ${parents[0].id} and ${parents[1].id}` });
    created.push(id);
  }

  return created;
}

module.exports = { crossbreed, replaceEliminated, longestSurvivors };
