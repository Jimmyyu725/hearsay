'use strict';
const fs = require('node:fs');
const config = require('../config');
const { canSpend, recordSpend } = require('./budget');

function readDeepseekKey() {
  return fs.readFileSync(config.llm.deepseekKeyFile, 'utf8').trim();
}

function readOpenaiKey() {
  const text = fs.readFileSync(config.llm.openaiEnvFile, 'utf8');
  const match = text.match(/^OPENAI_API_KEY=(.+)$/mu);
  return match ? match[1].trim() : null;
}

function buildRequestBody(messages) {
  return {
    model: config.llm.model,
    messages,
    reasoning_effort: config.llm.effort,
    max_tokens: config.llm.maxTokens,
    stream: false,
  };
}

async function callEndpoint(url, apiKey, body, fetchImpl) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('LLM returned no content');
  const tokensOut = json?.usage?.completion_tokens || 0;
  // An empty body at the token ceiling means reasoning ate the whole budget. Name it,
  // rather than letting it look like an agent that chose to stay quiet.
  if (content.trim() === '' && tokensOut >= body.max_tokens) {
    const error = new Error(`LLM truncated by max_tokens (${body.max_tokens}) before emitting content`);
    error.truncated = true;
    throw error;
  }
  return {
    content,
    tokensIn: json?.usage?.prompt_tokens || 0,
    tokensOut,
  };
}

// DeepSeek runs every agent. OpenAI exists only so an upstream outage does not kill the
// world overnight — it is never a per-agent model choice.
async function chat(messages, { db, ymd, fetchImpl = globalThis.fetch, apiKey = null } = {}) {
  if (!canSpend(db, ymd)) {
    throw new Error(`daily spend cap of $${config.budget.dailyCapUsd} reached for ${ymd}`);
  }
  const body = buildRequestBody(messages);
  const deepseekUrl = `${String(config.llm.baseUrl).replace(/\/+$/u, '')}/chat/completions`;

  try {
    const key = apiKey || readDeepseekKey();
    const result = await callEndpoint(deepseekUrl, key, body, fetchImpl);
    recordSpend(db, ymd, result);
    return { ...result, provider: 'deepseek' };
  } catch (deepseekError) {
    const fallbackKey = apiKey ? null : readOpenaiKey();
    if (!fallbackKey) throw deepseekError;
    const fallbackBody = { ...body, model: config.llm.openaiFallbackModel };
    const result = await callEndpoint(
      'https://api.openai.com/v1/chat/completions', fallbackKey, fallbackBody, fetchImpl);
    recordSpend(db, ymd, result);
    return { ...result, provider: 'openai-fallback' };
  }
}

module.exports = { chat, buildRequestBody, readDeepseekKey, readOpenaiKey };
