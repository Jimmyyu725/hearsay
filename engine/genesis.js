'use strict';
const config = require('../config');

const SECRET_GOALS = ['bankrupt', 'corner_medicine', 'survive_to', 'protect'];

const NAMES = [
  'Ash', 'Bran', 'Cass', 'Dill', 'Esk', 'Fen', 'Gale', 'Hollis',
  'Ivo', 'Juno', 'Kestrel', 'Lark', 'Mira', 'Nix', 'Orin', 'Pike',
  'Quill', 'Rook', 'Sable', 'Thorn', 'Umber', 'Vale', 'Wren', 'Yarrow',
];

function randomPersonality(rng = Math.random) {
  const personality = {};
  for (const trait of config.personalityTraits) {
    personality[trait] = Math.floor(rng() * 101);
  }
  return personality;
}

function assignGoal(index, ids, rng = Math.random) {
  const type = SECRET_GOALS[index % SECRET_GOALS.length];
  if (type === 'corner_medicine') return { type, target: null };
  if (type === 'survive_to') return { type, target: String(20 + Math.floor(rng() * 30)) };
  const others = ids.filter(id => id !== ids[index]);
  return { type, target: String(others[Math.floor(rng() * others.length)]) };
}

function createWorld(db, { era = 1, rng = Math.random } = {}) {
  const startedAt = new Date().toISOString();
  db.prepare('INSERT INTO worlds (era, day, status, started_at) VALUES (?, 0, ?, ?)')
    .run(era, 'alive', startedAt);
  const worldId = db.prepare('SELECT last_insert_rowid() AS id').get().id;

  const perTribe = config.population / config.tribes.length;
  const insertAgent = db.prepare(`INSERT INTO agents
    (world_id, name, tribe, alive, born_day, honesty, aggression, loyalty, greed, paranoia,
     goal_type, goal_target, parents, hungry_days)
    VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`);

  const ids = [];
  for (let i = 0; i < config.population; i += 1) {
    const tribe = config.tribes[Math.floor(i / perTribe)];
    const p = randomPersonality(rng);
    insertAgent.run(worldId, NAMES[i % NAMES.length], tribe,
      p.honesty, p.aggression, p.loyalty, p.greed, p.paranoia, 'pending', null);
    ids.push(db.prepare('SELECT last_insert_rowid() AS id').get().id);
  }

  const setGoal = db.prepare('UPDATE agents SET goal_type = ?, goal_target = ? WHERE id = ?');
  for (let i = 0; i < ids.length; i += 1) {
    const goal = assignGoal(i, ids, rng);
    setGoal.run(goal.type, goal.target, ids[i]);
  }

  const insertInventory = db.prepare(
    'INSERT INTO inventory (world_id, agent_id, resource, qty) VALUES (?, ?, ?, 0)');
  for (const id of ids) {
    for (const resource of Object.keys(config.dailyProduction)) {
      insertInventory.run(worldId, id, resource);
    }
  }

  return { worldId, era, agentIds: ids };
}

module.exports = { createWorld, randomPersonality, assignGoal, SECRET_GOALS, NAMES };
