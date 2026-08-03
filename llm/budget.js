'use strict';
const config = require('../config');

function priceFor({ tokensIn = 0, tokensOut = 0 }) {
  return (tokensIn / 1_000_000) * config.llm.pricePerMillion.input
       + (tokensOut / 1_000_000) * config.llm.pricePerMillion.output;
}

function spentToday(db, ymd) {
  const row = db.prepare('SELECT COALESCE(SUM(usd), 0) AS total FROM spend WHERE ymd = ?').get(ymd);
  return row.total;
}

function recordSpend(db, ymd, usage) {
  const usd = priceFor(usage);
  db.prepare('INSERT INTO spend (ymd, usd, tokens_in, tokens_out) VALUES (?, ?, ?, ?)')
    .run(ymd, usd, usage.tokensIn || 0, usage.tokensOut || 0);
  return usd;
}

// The cap is a runaway backstop, not a budget: normal operation sits about 250x below it.
function canSpend(db, ymd) {
  return spentToday(db, ymd) < config.budget.dailyCapUsd;
}

module.exports = { spentToday, recordSpend, canSpend, priceFor };
