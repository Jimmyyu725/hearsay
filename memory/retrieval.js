'use strict';
const { ledgerBetween } = require('./ledger');
const { getImpression } = require('./impressions');
const { episodesAbout } = require('./episodes');

function agentRow(db, id) {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
}

function inventoryOf(db, worldId, agentId) {
  const rows = db.prepare('SELECT resource, qty FROM inventory WHERE world_id = ? AND agent_id = ?')
    .all(worldId, agentId);
  const out = {};
  for (const r of rows) out[r.resource] = r.qty;
  return out;
}

function describeGoal(agent) {
  if (agent.goal_type === 'corner_medicine') return 'corner_medicine (hold every dose of medicine)';
  if (agent.goal_type === 'survive_to') return `survive_to (stay alive until day ${agent.goal_target})`;
  return `${agent.goal_type} (target agent #${agent.goal_target})`;
}

// Only the rows touching the two parties are loaded, so prompt size stays flat no matter
// how old the world is.
function buildContext(db, worldId, day, speakerId, listenerId) {
  const self = agentRow(db, speakerId);
  const listener = agentRow(db, listenerId);
  const inventory = inventoryOf(db, worldId, speakerId);
  const ledger = ledgerBetween(db, worldId, speakerId, listenerId);
  const impression = getImpression(db, worldId, speakerId, listenerId);
  const episodes = episodesAbout(db, worldId, speakerId, listenerId);

  const lines = [
    `YOU ARE: ${self.name} (#${self.id}) of the ${self.tribe} tribe, day ${day}.`,
    `PERSONALITY: honesty ${self.honesty}, aggression ${self.aggression}, loyalty ${self.loyalty}, greed ${self.greed}, paranoia ${self.paranoia}.`,
    `SECRET GOAL: ${describeGoal(self)}`,
    `YOUR TRUE INVENTORY: ${Object.entries(inventory).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
    `DAYS WITHOUT FOOD: ${self.hungry_days}`,
    '',
    `TALKING TO: ${listener.name} (#${listener.id}) of the ${listener.tribe} tribe.`,
    `YOUR TRUST IN THEM: ${impression.trust}${impression.opinion ? ` — "${impression.opinion}"` : ''}`,
  ];

  if (ledger.length) {
    lines.push('', 'HISTORY WITH THEM:');
    for (const row of ledger) {
      const direction = row.from_agent === speakerId ? 'you gave them' : 'they gave you';
      lines.push(`  day ${row.day}: ${row.kind} — ${direction} ${row.qty ?? ''} ${row.resource ?? ''}${row.note ? ` (${row.note})` : ''}`);
    }
  }

  if (episodes.length) {
    lines.push('', 'WHAT YOU REMEMBER:');
    for (const e of episodes) lines.push(`  day ${e.day}: ${e.text}`);
  }

  return { self, listener, inventory, ledger, impression, episodes, text: lines.join('\n') };
}

module.exports = { buildContext, inventoryOf, agentRow };
