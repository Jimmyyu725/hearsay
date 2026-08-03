# Hearsay — Design

**Date:** 2026-08-03
**Status:** Approved, ready for implementation planning
**Owner:** Jimmy Yu (jimmynas)

## Summary

Hearsay is a persistent multi-agent world that runs unattended on jimmynas. Sixteen LLM agents
live on an island where resources do not cover everyone. They talk, trade, promise, lie, ally and
betray. Agents that cannot eat are eliminated; replacements inherit mutated personalities from the
survivors. The owner watches through a dashboard rather than participating.

The project is entertainment, not a tool. Success is "I open the dashboard in the morning and the
overnight events are worth reading."

## Goals

- Produce emergent social drama that nobody scripted.
- Run 24/7 without supervision and without runaway cost.
- Make the drama legible at a glance — the dashboard is the product, the simulation is the engine.

## Non-goals

- Not a game the owner plays. No player controls in v1.
- Not an economic simulator. Scarcity exists to give conversation stakes, nothing more.
- Not a benchmark. Model comparison was explicitly cut; every agent runs the same model.

## Why one world instead of four features

The owner wanted four things: agents that deceive each other, trade with each other, form a society,
and evolve. These are not four subsystems. They are four consequences of one set of conditions:

| Condition | Consequence |
|---|---|
| Resources do not cover everyone | Agents must trade |
| Inventory and goals are private | Agents can lie |
| Memory persists and agents meet repeatedly | Grudges, alliances, reputation |
| Elimination plus mutated replacement | Strategies are selected across generations |

Building the conditions produces all four behaviours. Building four features produces four features.

## World rules

### Setting

An island with sixteen survivors, split into two tribes of eight. Tribes matter because
cross-tribe trade is where scarcity bites hardest and trust is thinnest.

### Resources

Three resources, produced daily by the island and distributed by standing agreements:

| Resource | Daily island output | Purpose |
|---|---|---|
| Food | 10 | 1 per agent per day; 16 agents compete for 10 |
| Wood | 6 | Shelter; missing it worsens illness odds |
| Medicine | 2 | Cures illness; the scarcest and most lied-about item |

Food output below headcount is the engine of the whole simulation. It cannot be raised without
draining the tension.

### The day cycle

```
Morning     Production is distributed per standing agreements from the previous day
   |
Day         6 conversation rounds — the main event
            Agents talk freely: negotiate, trade, promise, spread claims, threaten, ally
            Everyone in a round speaks simultaneously; rounds themselves stay ordered
   |
Evening     Settlement: the day's lies are revealed, then who eats, who starves,
            who is eliminated
   |
Turnover    Each elimination spawns a replacement whose personality is crossbred from the
            two longest-surviving agents, with random mutation applied to one trait
```

**Lies are revealed at settlement.** The island is small enough that everyone sees who actually
ate and who was holding out, so a lie told during the day costs the liar trust with its target
that evening, in proportion to the size of the lie, and leaves a permanent betrayal episode.
Without this step the lie board fills up while trust never moves, no grudge ever forms, and the
relationship graph stays empty — the first live run demonstrated exactly that.

### Private information

Each agent knows only its own true inventory and its own secret goal. Everything an agent knows
about anyone else came from what that agent was told. This gap is what makes lying possible.

Secret goals in v1 come from four templates, assigned at spawn:

- Bankrupt a specific named agent
- Corner the medicine supply
- Survive to a specific day number
- Ensure a specific named agent survives (a protector role, which creates sacrifice)

### Elimination and turnover

Three consecutive days without food eliminates an agent. Replacements keep the population at
sixteen, so the world never quietly empties out.

Personality is a small fixed vector (for example: honesty, aggression, loyalty, greed, paranoia).
Crossbreeding averages the two parents' vectors and mutates a single randomly chosen trait. Over
dozens of days the surviving distribution is the evolutionary result, and watching it drift is a
core part of the appeal.

## Agent memory

Loading full history into the prompt would break both the context window and the budget. Memory is
split into three layers, and only the parts relevant to the current conversation partner are
injected. Prompt size stays roughly constant no matter how many days have elapsed.

### Layer 1 — Ledger (structured, never LLM-judged)

Machine-recorded facts: debts, deliveries, promises made, promises kept, promises broken. Written
by the engine from actual state transitions, so it is always accurate and costs no tokens.

### Layer 2 — Impressions (one line plus a trust score per pair)

Each agent holds a short opinion and a trust score from -100 to +100 for every agent it has met.
Updated once per day during settlement. With sixteen agents this is a few hundred short rows.

**Trust is asymmetric on purpose:** betrayal is permanent, goodwill decays a few points per day.
Without this asymmetry the island converges on stable cooperation within a couple of weeks and
stops being interesting.

### Layer 3 — Episodes (short event summaries)

One-sentence summaries of notable events with day numbers. The most recent twenty are retained,
plus every betrayal event permanently.

### Retrieval

Before an agent speaks, the engine injects: the ledger rows involving the present parties, the
impressions of those parties, and the episodes mentioning them. Target prompt size is roughly
1500 input tokens regardless of world age.

## Lie detection

The engine holds ground truth, so claims can be checked mechanically. When an agent asserts
something about its own inventory that contradicts the world state, the engine records a lie event
with the speaker, the target, the claim and the truth.

This is deliberately not an LLM judgement call. It is a string-to-state comparison, which makes the
Lie Board free, deterministic and un-gameable.

## Architecture

```
cron (every N minutes)
   |
   v
tick.js  --  flock guard prevents overlapping runs
   |
   +--> advance one day: production, 6 conversation rounds, settlement, turnover
   +--> all LLM calls go through provider.js (DeepSeek)
   +--> write to world.db (SQLite)
   |
   v
world.db  <--  dashboard (read-only) served by Caddy at hearsay.jimmyyu888.com
```

Cron plus `flock` mirrors the existing Sim Companies autopilot rather than the systemd approach used
by LedgerWall. This is intentional: the owner already debugs that shape daily.

### Model provider

Every agent runs on **DeepSeek**. The multi-model competition idea was cut from v1.

The provider module is adapted from `chrome-automation/sim/autopilot/brain-provider.js`, which
already implements health tracking and half-open recovery. OpenAI is retained **only** as an outage
fallback — if the DeepSeek API is unreachable the world keeps running rather than dying overnight.
It is never a per-agent model choice.

Credentials:

- DeepSeek: `/home/jimmy/.config/sim-benchmark/deepseek-v4-pro.txt` (mode 0600)
- OpenAI (outage fallback): `OPENAI_API_KEY` in `/srv/appdata/ledgerwall/.env`

### Storage

SQLite (`world.db`) with tables for agents, inventory, ledger, impressions, episodes, lies,
conversations, and day summaries. The dashboard reads this file directly; there is no API layer in
v1.

### Speed modes

- **Live**: one island day per real-world day (the default), for long-term evolution watching.
- **Fast-forward**: roughly 50 island days per night, for seeing evolutionary drift quickly.

The mode is a config value read at tick time, so it can be switched without a restart.

## Dashboard

Layout B — a four-pane grid, chosen from three mockups. Everything visible on one screen:

```
+----------------------+----------------------+
|  Relationship graph  |  Today's timeline    |
|  red = grudge        |  event stream        |
|  green = alliance    |                      |
+----------------------+----------------------+
|  Lie Board           |  Resource prices     |
|  who lied, how often |  scarcity over time  |
+----------------------+----------------------+
```

Read-only, no realtime push in v1 — a page refresh is enough for a world that advances on a cron.

## Safety valves

| Risk | Valve |
|---|---|
| Runaway spend | Hard cap of **$50/day**. Token spend accumulates from midnight; exceeding the cap skips further ticks that day. |
| Infinite conversation loops | 6 rounds per day, enforced by the engine. Agents cannot request more. |
| Dead world | If everyone is eliminated, nobody speaks, or three days pass with no events, the world archives itself and restarts. |

The spend cap is a backstop, not a budget. Expected cost is roughly $0.2/day in live mode and
$3–6/night in fast-forward, so the cap sits about 250x above normal operation and should only ever
trigger on a bug.

Archived worlds are kept and browsable as past eras — "how the third island collapsed" is content,
not an error state.

## v1 scope

**In:**

- 16 agents in two tribes, fixed personality templates at genesis
- 3 resources, daily production, trading
- Secret goals from 4 templates
- Three-layer memory with relevance-based retrieval
- Mechanical lie detection and Lie Board
- Elimination, crossbred and mutated replacements
- Four-pane dashboard
- DeepSeek for all agents, OpenAI outage fallback
- All three safety valves

**Out (deferred to v2):**

- **Rumour propagation** — agents relaying claims about third parties, with source credibility.
  The most requested v2 item; deferred because it needs an extra memory dimension and makes v1
  debugging significantly harder.
- Social consequences of lies modelled beyond the trust score
- Dynamically generated secret goals
- Multi-model competition between agents
- Realtime dashboard push and replay animation
- Owner intervention (planting private information with a chosen agent)

## Lessons from the first live run (2026-08-03)

Two things only a real run could show, both now fixed and covered by tests:

- **Reasoning tokens are billed against `max_tokens`.** At `reasoning_effort: high` the model spent
  an entire 800-token budget thinking and returned an empty string. Between a third and a half of
  the island said nothing, and the share grew as contexts lengthened. The ceiling is now 3000 and
  the provider raises a named truncation error instead of passing an empty reply through as
  silence. Empty replies fell from 32–51% to 3–9%.
- **Sequential turns made a day take about thirteen minutes**, which put fast-forward out of reach
  (50 days would have needed eleven hours). A round's calls now overlap, eight at a time, and a
  day takes just over two minutes.

## Open questions

None blocking. Resource output ratios and the trust decay rate are tuning constants expected to
change once the first world has run for a few days.
