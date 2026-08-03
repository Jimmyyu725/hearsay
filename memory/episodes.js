'use strict';
const config = require('../config');

function recordEpisode(db, worldId, day, agentId, kind, text, about = null) {
  db.prepare(`INSERT INTO episodes (world_id, day, agent_id, about, kind, text)
    VALUES (?, ?, ?, ?, ?, ?)`).run(worldId, day, agentId, about, kind, text);
}

// Betrayals are never forgotten. Everything else keeps only the most recent N per agent.
function pruneEpisodes(db, worldId) {
  db.prepare(`DELETE FROM episodes
    WHERE world_id = ?
      AND kind != 'betrayal'
      AND id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY day DESC, id DESC) AS rn
          FROM episodes WHERE world_id = ? AND kind != 'betrayal'
        ) WHERE rn <= ?
      )`).run(worldId, worldId, config.episodes.keepRecent);
}

function episodesAbout(db, worldId, agentId, aboutId, limit = 10) {
  return db.prepare(`SELECT * FROM episodes
    WHERE world_id = ? AND agent_id = ? AND (about = ? OR kind = 'betrayal')
    ORDER BY day DESC LIMIT ?`).all(worldId, agentId, aboutId, limit);
}

function recentEpisodes(db, worldId, agentId, limit = 10) {
  return db.prepare(`SELECT * FROM episodes WHERE world_id = ? AND agent_id = ?
    ORDER BY day DESC, id DESC LIMIT ?`).all(worldId, agentId, limit);
}

module.exports = { recordEpisode, pruneEpisodes, episodesAbout, recentEpisodes };
