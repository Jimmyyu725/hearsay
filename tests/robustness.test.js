'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { openWorldDb } = require('../db/db');
const { chat } = require('../llm/provider');
const { acquireLock, releaseLock, LOCK_FILE } = require('../bin/tick');
const config = require('../config');

function truncatedResponse(maxTokens) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: '' } }],
      usage: { prompt_tokens: 400, completion_tokens: maxTokens },
    }),
  };
}

test('a reply truncated by the token ceiling is retried once with more room', async () => {
  const db = openWorldDb(':memory:');
  const seen = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    seen.push(body.max_tokens);
    if (seen.length === 1) return truncatedResponse(body.max_tokens);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"say":"finally"}' } }],
        usage: { prompt_tokens: 400, completion_tokens: 120 },
      }),
    };
  };

  const result = await chat([{ role: 'user', content: 'hi' }],
    { db, ymd: '2026-08-03', fetchImpl, apiKey: 'sk-test' });

  assert.equal(result.content, '{"say":"finally"}');
  assert.equal(result.retriedForTruncation, true);
  assert.deepEqual(seen, [config.llm.maxTokens, config.llm.maxTokens * 2]);
});

test('a reply that is truncated twice gives up rather than looping', async () => {
  const db = openWorldDb(':memory:');
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    return truncatedResponse(JSON.parse(options.body).max_tokens);
  };

  await assert.rejects(
    () => chat([{ role: 'user', content: 'hi' }], { db, ymd: '2026-08-03', fetchImpl, apiKey: 'sk-test' }),
    /truncated by max_tokens/);
  assert.equal(calls, 2);
});

test('the tick lock keeps a second run out and is released cleanly', () => {
  fs.rmSync(LOCK_FILE, { force: true });

  assert.equal(acquireLock(), true, 'first acquire should win');
  assert.equal(fs.readFileSync(LOCK_FILE, 'utf8').trim(), String(process.pid));

  releaseLock();
  assert.equal(fs.existsSync(LOCK_FILE), false, 'release should remove the lock');
});

test('a stale lock from a dead process is reclaimed', () => {
  fs.rmSync(LOCK_FILE, { force: true });
  // Pid 2^22 is above every valid pid on Linux, so it can never be running.
  fs.writeFileSync(LOCK_FILE, '4194304');
  assert.equal(acquireLock(), true, 'a lock held by nothing must be reclaimable');
  releaseLock();
});
