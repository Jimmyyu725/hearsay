'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb } = require('../db/db');
const { spentToday, recordSpend, canSpend } = require('../llm/budget');
const config = require('../config');

test('spend accumulates per day and the cap blocks further calls', () => {
  const db = openWorldDb(':memory:');
  assert.equal(spentToday(db, '2026-08-03'), 0);
  assert.equal(canSpend(db, '2026-08-03'), true);

  recordSpend(db, '2026-08-03', { tokensIn: 1_000_000, tokensOut: 1_000_000 });
  const expected = config.llm.pricePerMillion.input + config.llm.pricePerMillion.output;
  assert.ok(Math.abs(spentToday(db, '2026-08-03') - expected) < 1e-9);

  // A different day is unaffected.
  assert.equal(spentToday(db, '2026-08-04'), 0);

  const hugeTokens = Math.ceil((config.budget.dailyCapUsd / config.llm.pricePerMillion.input) * 1_000_000);
  recordSpend(db, '2026-08-03', { tokensIn: hugeTokens, tokensOut: 0 });
  assert.equal(canSpend(db, '2026-08-03'), false);
});
