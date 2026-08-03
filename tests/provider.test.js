'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { chat, buildRequestBody } = require('../llm/provider');
const config = require('../config');

test('the request body pins the model and reasoning effort', () => {
  const body = buildRequestBody([{ role: 'user', content: 'hi' }]);
  assert.equal(body.model, config.llm.model);
  assert.equal(body.reasoning_effort, config.llm.effort);
  assert.equal(body.max_tokens, config.llm.maxTokens);
});

test('chat returns content and records token spend', async () => {
  const db = openWorldDb(':memory:');
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: '{"say":"hello"}' } }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    }),
  });
  const result = await chat([{ role: 'user', content: 'hi' }],
    { db, ymd: '2026-08-03', fetchImpl, apiKey: 'sk-test' });
  assert.equal(result.content, '{"say":"hello"}');
  assert.equal(result.tokensIn, 120);
  const { spentToday } = require('../llm/budget');
  assert.ok(spentToday(db, '2026-08-03') > 0);
});

test('chat refuses to call out once the daily cap is reached', async () => {
  const db = openWorldDb(':memory:');
  const { recordSpend } = require('../llm/budget');
  const hugeTokens = Math.ceil((config.budget.dailyCapUsd / config.llm.pricePerMillion.input) * 1_000_000);
  recordSpend(db, '2026-08-03', { tokensIn: hugeTokens, tokensOut: 0 });

  let called = false;
  const fetchImpl = async () => { called = true; throw new Error('should not be reached'); };
  await assert.rejects(
    () => chat([{ role: 'user', content: 'hi' }], { db, ymd: '2026-08-03', fetchImpl, apiKey: 'sk-test' }),
    /daily spend cap/i);
  assert.equal(called, false);
});
