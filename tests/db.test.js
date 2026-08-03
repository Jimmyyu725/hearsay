'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openWorldDb, closeWorldDb } = require('../db/db');
const config = require('../config');

test('config exposes the locked v1 constants', () => {
  assert.equal(config.population, 16);
  assert.equal(config.tribes.length, 2);
  assert.deepEqual(config.dailyProduction, { food: 10, wood: 6, medicine: 2 });
  assert.equal(config.conversationRounds, 6);
  assert.equal(config.starvationDeathDays, 3);
  assert.equal(config.budget.dailyCapUsd, 50);
  assert.equal(config.llm.model, 'deepseek-v4-flash');
  assert.equal(config.llm.effort, 'high');
});

test('openWorldDb creates every table and is idempotent', () => {
  const db = openWorldDb(':memory:');
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['worlds', 'agents', 'inventory', 'ledger', 'impressions',
    'episodes', 'lies', 'utterances', 'days', 'spend']) {
    assert.ok(names.includes(t), `missing table ${t}`);
  }
  db.exec(require('node:fs').readFileSync(require('node:path').join(__dirname, '../db/schema.sql'), 'utf8'));
  closeWorldDb(db);
});
