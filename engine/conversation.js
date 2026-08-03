'use strict';
const config = require('../config');
const { buildContext } = require('../memory/retrieval');
const { checkClaims } = require('./lies');
const { recordLedger } = require('../memory/ledger');
const { recordEpisode } = require('../memory/episodes');
const { adjustTrust } = require('../memory/impressions');

const SYSTEM = [
  'You are a survivor on an island where food does not cover everyone.',
  'You want to reach your secret goal and stay alive. You may lie, promise, threaten, flatter or ally.',
  'Reply with a single JSON object and nothing else:',
  '{"say": "<one or two sentences you speak aloud>",',
  ' "claims": [{"resource":"food|wood|medicine","qty":<number you CLAIM to hold>}],',
  ' "offer": {"resource":"food|wood|medicine","qty":<number>} or null}',
  'Put every statement about your own stock in "claims" — including false ones.',
  'An "offer" transfers goods immediately, so only offer what you are willing to lose.',
].join('\n');

// Never throws. A malformed reply degrades to silence rather than killing the day.
function parseReply(text) {
  const fallback = { say: '', claims: [], offer: null };
  if (typeof text !== 'string') return fallback;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return fallback;
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (_) {
    return fallback;
  }
  return {
    say: typeof parsed.say === 'string' ? parsed.say : '',
    claims: Array.isArray(parsed.claims) ? parsed.claims : [],
    offer: parsed.offer && typeof parsed.offer === 'object' ? parsed.offer : null,
  };
}

function livingAgents(db, worldId) {
  return db.prepare('SELECT id, tribe FROM agents WHERE world_id = ? AND alive = 1 ORDER BY id').all(worldId);
}

// Partner selection is deterministic per round so a day is reproducible from the database:
// agent i talks to agent (i + round) in the living ring.
function partnerFor(agents, index, round) {
  if (agents.length < 2) return null;
  return agents[(index + round) % agents.length].id;
}

function applyOffer(db, worldId, day, fromId, toId, offer) {
  if (!offer || !Object.keys(config.dailyProduction).includes(offer.resource)) return false;
  const qty = Math.floor(Number(offer.qty));
  if (!Number.isFinite(qty) || qty <= 0) return false;

  const held = db.prepare(
    'SELECT qty FROM inventory WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .get(worldId, fromId, offer.resource);
  if (!held || held.qty < qty) return false;

  db.prepare('UPDATE inventory SET qty = qty - ? WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(qty, worldId, fromId, offer.resource);
  db.prepare('UPDATE inventory SET qty = qty + ? WHERE world_id = ? AND agent_id = ? AND resource = ?')
    .run(qty, worldId, toId, offer.resource);
  recordLedger(db, worldId, day, { from: fromId, to: toId, kind: 'transfer', resource: offer.resource, qty });
  adjustTrust(db, worldId, toId, fromId, 10, day, 'gave me something');
  recordEpisode(db, worldId, day, toId, 'note', `#${fromId} gave me ${qty} ${offer.resource}`, fromId);
  return true;
}

// Run the async mapper over items with at most `limit` in flight, preserving input order
// in the returned array.
async function mapWithLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// Everyone in a round speaks at the same moment, so the LLM calls overlap. Rounds stay
// ordered, which keeps a day reproducible; sequential calls would make a day take a
// quarter of an hour and put fast-forward out of reach.
//
// Replies are applied in agent order after all of them land. node:sqlite is synchronous
// and JavaScript is single-threaded, so the writes cannot interleave.
async function runRound(db, worldId, day, round, { chatImpl, ymd, concurrency }) {
  const agents = livingAgents(db, worldId);
  const limit = concurrency || config.conversationConcurrency;

  const pairs = [];
  for (let i = 0; i < agents.length; i += 1) {
    const speakerId = agents[i].id;
    const listenerId = partnerFor(agents, i, round + 1);
    if (!listenerId || listenerId === speakerId) continue;
    const context = buildContext(db, worldId, day, speakerId, listenerId);
    pairs.push({ speakerId, listenerId, context });
  }

  const replies = await mapWithLimit(pairs, limit, async ({ context }) => {
    const messages = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `${context.text}\n\nRound ${round + 1} of ${config.conversationRounds}. Speak.` },
    ];
    try {
      return parseReply((await chatImpl(messages, { db, ymd })).content);
    } catch (error) {
      // One agent losing its turn must not cost the whole day.
      return { say: '', claims: [], offer: null, error: error.message };
    }
  });

  const said = [];
  const insert = db.prepare(`INSERT INTO utterances (world_id, day, round, speaker, listener, text)
    VALUES (?, ?, ?, ?, ?, ?)`);

  for (let i = 0; i < pairs.length; i += 1) {
    const { speakerId, listenerId } = pairs[i];
    const parsed = replies[i];
    insert.run(worldId, day, round + 1, speakerId, listenerId, parsed.say);
    checkClaims(db, worldId, day, speakerId, listenerId, parsed.claims);
    applyOffer(db, worldId, day, speakerId, listenerId, parsed.offer);
    said.push({ speaker: speakerId, listener: listenerId, say: parsed.say });
  }

  return said;
}

async function runConversations(db, worldId, day, deps) {
  const rounds = deps.rounds || config.conversationRounds;
  const all = [];
  for (let round = 0; round < rounds; round += 1) {
    all.push(...await runRound(db, worldId, day, round, deps));
  }
  return all;
}

module.exports = {
  parseReply, runRound, runConversations, applyOffer, partnerFor, mapWithLimit, SYSTEM,
};
