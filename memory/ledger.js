'use strict';

// Layer 1. Machine-recorded facts only — written from real state transitions, never
// from anything an agent said. Always accurate, costs no tokens.
function recordLedger(db, worldId, day, { from = null, to = null, kind, resource = null, qty = null, note = null }) {
  db.prepare(`INSERT INTO ledger (world_id, day, from_agent, to_agent, kind, resource, qty, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(worldId, day, from, to, kind, resource, qty, note);
}

function ledgerBetween(db, worldId, a, b, limit = 20) {
  return db.prepare(`SELECT * FROM ledger
    WHERE world_id = ?
      AND ((from_agent = ? AND to_agent = ?) OR (from_agent = ? AND to_agent = ?))
    ORDER BY day ASC, id ASC LIMIT ?`).all(worldId, a, b, b, a, limit);
}

function ledgerFor(db, worldId, agentId, limit = 40) {
  return db.prepare(`SELECT * FROM ledger
    WHERE world_id = ? AND (from_agent = ? OR to_agent = ?)
    ORDER BY day DESC, id DESC LIMIT ?`).all(worldId, agentId, agentId, limit);
}

module.exports = { recordLedger, ledgerBetween, ledgerFor };
