'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { openWorldDb } = require('../db/db');
const { currentWorld } = require('../engine/tick');

const INDEX = path.join(__dirname, 'public', 'index.html');

function buildSnapshot(db) {
  const world = currentWorld(db);
  if (!world) return { era: 0, day: 0, agents: [], timeline: [], lies: [], prices: [], edges: [] };

  const agents = db.prepare(`SELECT id, name, tribe, alive, born_day, died_day, hungry_days,
    honesty, aggression, loyalty, greed, paranoia, goal_type, goal_target
    FROM agents WHERE world_id = ? ORDER BY id`).all(world.id);

  const timeline = db.prepare(`SELECT u.day, u.round, u.text, s.name AS speaker, l.name AS listener
    FROM utterances u
    JOIN agents s ON s.id = u.speaker
    JOIN agents l ON l.id = u.listener
    WHERE u.world_id = ? ORDER BY u.day DESC, u.round DESC, u.id DESC LIMIT 60`).all(world.id);

  const lies = db.prepare(`SELECT a.name, COUNT(*) AS count
    FROM lies li JOIN agents a ON a.id = li.speaker
    WHERE li.world_id = ? GROUP BY li.speaker ORDER BY count DESC LIMIT 10`).all(world.id);

  const prices = db.prepare(`SELECT day,
      SUM(CASE WHEN resource = 'food' THEN qty ELSE 0 END) AS food,
      SUM(CASE WHEN resource = 'wood' THEN qty ELSE 0 END) AS wood,
      SUM(CASE WHEN resource = 'medicine' THEN qty ELSE 0 END) AS medicine
    FROM ledger WHERE world_id = ? AND kind = 'transfer'
    GROUP BY day ORDER BY day ASC LIMIT 60`).all(world.id);

  const edges = db.prepare(`SELECT i.subject, i.object, i.trust, s.name AS subject_name, o.name AS object_name
    FROM impressions i
    JOIN agents s ON s.id = i.subject
    JOIN agents o ON o.id = i.object
    WHERE i.world_id = ? AND ABS(i.trust) >= 10 ORDER BY ABS(i.trust) DESC LIMIT 40`).all(world.id);

  return { era: world.era, day: world.day, agents, timeline, lies, prices, edges };
}

function createServer(dbFile = config.dbFile) {
  return http.createServer((req, res) => {
    if (req.url.startsWith('/api/snapshot')) {
      const db = openWorldDb(dbFile);
      const snapshot = buildSnapshot(db);
      db.close();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(snapshot));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(INDEX));
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8123;
  createServer().listen(port, '127.0.0.1', () => console.log(`[hearsay] dashboard on :${port}`));
}

module.exports = { buildSnapshot, createServer };
