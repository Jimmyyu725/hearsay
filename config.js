'use strict';

// Every tunable in one place. The values here are the ones locked in the design
// spec; changing them changes how the world behaves, not how it is built.
module.exports = Object.freeze({
  population: 16,
  tribes: ['North', 'South'],

  // Food output is deliberately below headcount — this gap is the engine of the
  // entire simulation and must not be raised without draining the tension.
  dailyProduction: { food: 10, wood: 6, medicine: 2 },

  conversationRounds: 6,

  // How many agents speak concurrently within a round. Sequential turns made one island
  // day take about a quarter of an hour, which put fast-forward out of reach.
  conversationConcurrency: 8,

  starvationDeathDays: 3,

  trust: {
    min: -100,
    max: 100,
    // Asymmetric on purpose: betrayal is permanent, goodwill decays. Without the
    // asymmetry the island converges on stable cooperation and stops being interesting.
    goodwillDecayPerDay: 5,
  },

  episodes: { keepRecent: 20 },

  budget: { dailyCapUsd: 50 },

  llm: {
    model: 'deepseek-v4-flash',
    effort: 'high',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    // Reasoning tokens are billed against this same ceiling. At effort "high" the model
    // spent all 800 of an earlier budget thinking and returned an empty string, which
    // silenced half the island. Leave generous headroom above the reasoning cost.
    maxTokens: 3000,
    deepseekKeyFile: '/home/jimmy/.config/sim-benchmark/deepseek-v4-pro.txt',
    openaiEnvFile: '/srv/appdata/ledgerwall/.env',
    openaiFallbackModel: 'gpt-5.6-luna',
    // Rough public per-million-token prices, used only to enforce the spend cap.
    pricePerMillion: { input: 0.28, output: 0.42 },
  },

  deadWorld: { noEventDays: 3 },

  personalityTraits: ['honesty', 'aggression', 'loyalty', 'greed', 'paranoia'],

  dbFile: process.env.HEARSAY_DB || require('node:path').join(__dirname, 'world.db'),
});
