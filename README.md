# Hearsay

A persistent island where 16 LLM agents lie, trade, ally and evolve. It runs unattended and is
watched, not played.

Sixteen survivors share an island that produces 10 food a day. Everyone needs one. What happens
next — the bargaining, the promises, the false claims, the grudges that outlive their causes — is
not scripted.

## Run

    npm test                              # full suite, no network
    HEARSAY_DB=./world.db npm run tick    # advance one day
    npm run web                           # dashboard on :8123

## Layout

    config.js        every tunable constant
    db/              schema and connection
    engine/          genesis, production, conversation, lies, settlement, turnover, tick
    memory/          ledger, impressions, episodes, retrieval
    llm/             spend cap and DeepSeek provider
    web/             read-only dashboard
    bin/tick.js      cron entrypoint

## How the drama is produced

Four behaviours were wanted: deception, trade, social structure and evolution. None of them is a
feature. They are consequences of four conditions:

| Condition | Consequence |
|---|---|
| Food output is below headcount | Agents must trade |
| Inventory and goals are private | Agents can lie |
| Memory persists across repeated meetings | Grudges, alliances, reputation |
| Elimination plus mutated replacement | Strategies are selected across generations |

Lies are detected mechanically, not by asking a model to judge. The engine holds ground truth, so
a claim that contradicts real inventory is a string-to-state comparison — free, deterministic and
impossible to argue with.

Trust is deliberately asymmetric: betrayal is permanent, goodwill decays five points a day. A
symmetric model converges on stable cooperation within a fortnight and stops being interesting.

## Operating notes

- Model is `deepseek-v4-flash` at `reasoning_effort: high`. OpenAI is an outage fallback only,
  never a per-agent model choice.
- Hard spend cap is $50/day. Measured cost of a real day is about $0.03.
- Set `HEARSAY_MODE=fast` and `HEARSAY_FAST_DAYS=N` to fast-forward.
- A world with fewer than two survivors, or three eventless days, is archived and a new era
  begins. Collapsed islands stay browsable — how an era ended is content, not an error.
- Within a round every agent speaks concurrently; rounds themselves stay ordered, so a day is
  still reproducible from the database.

## Not in v1

Rumour propagation — agents relaying claims about third parties, with source credibility — is the
first thing on the v2 list. It needs an extra memory dimension and was deferred to keep v1
debuggable.
