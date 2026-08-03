'use strict';
const config = require('../config');

function clamp(value) {
  return Math.max(config.trust.min, Math.min(config.trust.max, value));
}

function getImpression(db, worldId, subject, object) {
  const row = db.prepare(
    'SELECT trust, opinion FROM impressions WHERE world_id = ? AND subject = ? AND object = ?')
    .get(worldId, subject, object);
  return row || { trust: 0, opinion: '' };
}

function adjustTrust(db, worldId, subject, object, delta, day, opinion = null) {
  const current = getImpression(db, worldId, subject, object);
  const next = clamp(current.trust + delta);
  const text = opinion === null ? current.opinion : opinion;
  db.prepare(`INSERT INTO impressions (world_id, subject, object, trust, opinion, updated_day)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (world_id, subject, object)
    DO UPDATE SET trust = excluded.trust, opinion = excluded.opinion, updated_day = excluded.updated_day`)
    .run(worldId, subject, object, next, text, day);
  return next;
}

// Positive trust erodes; negative trust does not. This asymmetry is what lets grudges
// accumulate — a symmetric model converges on peace and stops producing drama.
function decayGoodwill(db, worldId, day) {
  const result = db.prepare(`UPDATE impressions
    SET trust = MAX(0, trust - ?), updated_day = ?
    WHERE world_id = ? AND trust > 0`).run(config.trust.goodwillDecayPerDay, day, worldId);
  return result.changes;
}

function impressionsOf(db, worldId, subject) {
  return db.prepare('SELECT * FROM impressions WHERE world_id = ? AND subject = ?').all(worldId, subject);
}

module.exports = { getImpression, adjustTrust, decayGoodwill, impressionsOf };
