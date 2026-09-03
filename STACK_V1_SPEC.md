# STACK V1 - Implementation Specification

**Status:** Build specification only. Do not build the application from this document in the current task.  
**Product:** `STACK`  
**V1 boundary:** A local, single-player, server-authoritative risk-and-probability game.  
**Target:** A future coding agent must be able to implement V1 using this document alone.

---

## 1. Product definition

### 1.1 One-sentence concept

**STACK is a fast, replayable probability-and-risk game asking: _How far can you compound your score before you bust?_**

Each run starts with a stack of 100 points. A round presents three visible choices - **SAFE**, **PUSH**, and **YOLO**. The player sees imperfect signals about a hidden market/risk state, chooses one option, and either compounds their stack or takes a substantial hit. After every successful round, the player chooses to bank the stack or continue.

The game is a fictional score-chasing strategy experience. It has **no real-money mechanics, payments, wagering, crypto, ads, or gambling functionality**.

### 1.2 Product goals

- Teach the core loop in under 20 seconds.
- Make a typical run last 1-3 minutes (target median: 7-12 completed rounds).
- Reward reading signals without making outcomes perfectly predictable.
- Make each option situationally defensible; no always-correct choice.
- Make banking feel like an earned, active decision rather than a passive end screen.
- Work entirely on a developer's local machine, while remaining easy to deploy later to Vercel.

### 1.3 Explicitly out of scope for V1

- Authentication, accounts, social login, multiplayer, friend features, leaderboards, payments, subscriptions, ads, real-money mechanics, gambling, crypto, external APIs, AI features, and cloud hosting.
- Any client-authoritative game outcome or score calculation.

---

## 2. V1 technical architecture

Use this deliberately simple stack:

| Layer | V1 choice | Responsibility |
|---|---|---|
| Frontend | HTML, CSS, vanilla JavaScript | Render UI, request actions, animate only server-confirmed outcomes |
| Backend | Node.js 20+ with Express | Authoritative game engine, validation, persistence, APIs |
| Database | SQLite via `better-sqlite3` | Runs, round telemetry, aggregate stats |
| Tests | Node built-in test runner (`node --test`) | Unit and API/integration tests |
| Styling | Plain CSS | Responsive cyberpunk terminal design; no UI framework |

Do not add React for V1. Do not introduce an ORM. `better-sqlite3` with parameterized prepared statements is adequate and easier to inspect.

### 2.1 Project structure

```text
stack-game/
  public/
    index.html                 # Accessible application shell
    styles.css                 # Responsive cyberpunk design system and motion
    app.js                     # DOM rendering, UI state, fetch calls only

  src/
    server.js                  # Express setup, static files, middleware, startup
    game/
      constants.js             # All tunable game numbers; no magic numbers elsewhere
      engine.js                # Pure authoritative round, score, banking logic
      signals.js               # Pure hidden-state-to-signal projection
      rng.js                   # Seed hashing, mulberry32 PRNG, deterministic helpers
      daily.js                 # Daily seed/date helpers and fixed daily round deck
    db/
      database.js              # DB connection, migrations, prepared statements
      schema.sql               # SQLite tables, indexes, constraints
    routes/
      runs.js                  # Start, choose, bank, read a run
      stats.js                 # Local aggregate stats endpoint
      daily.js                 # Daily metadata endpoint
    middleware/
      errors.js                # Safe JSON error responses; no stack traces
      validate.js              # Narrow request and route parameter validation

  scripts/
    simulate.js                # At least 100,000-run balance simulation

  tests/
    game-engine.test.js
    rng.test.js
    signals.test.js
    api.test.js
    database.test.js

  data/
    .gitkeep
    stack.db                   # Generated locally; ignored by Git

  .env.example
  .gitignore
  package.json
  README.md
  BUILD_PROGRESS.md
```

### 2.2 File responsibilities

- `constants.js`: exports frozen configuration objects for score limits, risk states, option formulas, difficulty, bust threshold, and API limits. Changing game balance begins here and must be documented.
- `rng.js`: has no UI/database imports. It turns a seed into repeatable random values.
- `signals.js`: converts a hidden round state into the non-authoritative signal payload that is safe to return to the browser.
- `engine.js`: pure functions that take a server-owned run/round state and RNG and return the next authoritative state. It must not access Express, request objects, or SQLite directly.
- `daily.js`: creates the date seed and deterministic deck for Daily mode.
- `routes/*`: validates inputs, invokes the engine, persists results atomically, and sends a narrow public response.
- `public/app.js`: never calculates probability, outcomes, scores, or hidden state. It only displays server responses and submits a valid choice or bank request.

---

## 3. Game loop and state machine

### 3.1 Starting state

Every new run has:

```js
{
  mode: "random" | "daily",
  startingScore: 100,
  currentScore: 100,
  highestScore: 100,
  roundNumber: 1,
  streak: 0,
  maxStreak: 0,
  roundsCompleted: 0,
  status: "active",
  currentRound: null
}
```

`currentScore`, `highestScore`, and all persisted score values are positive integers. Calculations are rounded at the end of each resolved round. The maximum stack is `9,999,999`; cap a successful score at this value so UI, SQLite, and share text stay sane.

### 3.2 State machine

Use the following server-side status values and transitions. The frontend may have matching display states, but it must treat the server response as truth.

```text
START_SCREEN
  -> PLAYING                 (player starts random or daily run)

PLAYING / status=active
  -> ROUND_RESULT            (valid SAFE, PUSH, or YOLO action resolved)

ROUND_RESULT / success=true / status=awaiting_decision
  -> DECISION                (show Bank / Keep Going)

DECISION / status=awaiting_decision
  -> PLAYING                 (Keep Going; create next round)
  -> BANKED                  (Bank; persist banked outcome)

ROUND_RESULT / success=false / score > BUST_THRESHOLD / status=active
  -> PLAYING                 (show SYSTEM HIT, then Continue)

ROUND_RESULT / success=false / score <= BUST_THRESHOLD
  -> BUST                    (persist busted outcome)

BUST or BANKED
  -> GAME_OVER               (show final stats/profile)

GAME_OVER
  -> START_SCREEN | PLAYING  (Home or Play Again)
```

Database status values are `active`, `awaiting_decision`, `banked`, and `busted`. `ROUND_RESULT`, `DECISION`, and `GAME_OVER` are frontend presentation states derived from a response. A run in `awaiting_decision` must reject a second choice until the player banks or keeps going.

### 3.3 Authoritative action rules

1. `POST /api/run/start` creates a run and its first round.
2. While `status=active`, exactly one choice may be submitted for the current round.
3. A successful choice increments `roundsCompleted`, `streak`, and possibly `highestScore`, then changes status to `awaiting_decision`.
4. A non-bust failure increments `roundsCompleted`, resets `streak` to `0`, leaves status `active`, and creates **no new round** until the UI calls `continue` via the same run read/next action described below.
5. A bust sets final score, timestamps the run, and makes it immutable.
6. Bank is available after **every successful round** and only then. Bank ends the run immediately; it does not generate a new round.
7. Terminal runs (`banked`, `busted`) reject all actions with HTTP `409`.

To avoid adding an unnecessary endpoint, `POST /api/run/:runId/continue` creates the next round after either a success awaiting decision or a non-bust failure. It is needed even though it was not in the example endpoint list; otherwise there is no explicit server-authoritative way to create a new round.

---

## 4. Mathematical game model

### 4.1 Hidden risk state

Each round has one hidden `riskState`. It determines the underlying chance quality for all three options. Never return it to the browser during an active run.

| State | Latent quality `L` | Meaning | Initial weight |
|---|---:|---|---:|
| `favorable` | 86 | Conditions support deliberate aggression | 20% |
| `calm` | 68 | Stable conditions; small gains are reliable | 30% |
| `unstable` | 50 | Mixed conditions | 25% |
| `dangerous` | 29 | Poor conditions; preserve stack | 16% |
| `chaotic` | 13 | Signals are noisy and downside is severe | 9% |

The first round samples these weights. Later rounds use this Markov transition matrix so states have short, readable regimes instead of unrelated random flips. Row = prior state, column order = `favorable`, `calm`, `unstable`, `dangerous`, `chaotic`.

```js
const RISK_TRANSITIONS = {
  favorable: [0.42, 0.27, 0.18, 0.09, 0.04],
  calm:      [0.19, 0.44, 0.23, 0.10, 0.04],
  unstable:  [0.14, 0.25, 0.34, 0.19, 0.08],
  dangerous: [0.07, 0.16, 0.29, 0.34, 0.14],
  chaotic:   [0.05, 0.10, 0.24, 0.31, 0.30]
};
```

Difficulty does **not** alter this transition matrix. Difficulty instead worsens payoff/downside, increases signal noise, and creates more ambiguity gradually. This preserves the intended relationship between signals and underlying conditions.

### 4.2 Difficulty progression

For round `r`, calculate:

```js
difficulty = Math.min(1, (r - 1) / 20);
```

This is `0.00` in round 1, `0.20` in round 5, `0.70` in round 15, and reaches `1.00` at round 21. Runs should rarely get this far, but the cap makes behaviour predictable.

| Phase | Rounds | Effect |
|---|---|---|
| Opening | 1-5 | Clearer signals, modest downside, safe recovery is viable |
| Pressure | 6-14 | More signal noise, probability edge narrows, loss severity rises |
| Deep run | 15+ | Highest noise/downside; continued compounding is an explicit risk choice |

### 4.3 Exact option formulas

For each option, calculate a probability from its base probability, state adjustment, round difficulty, and an independent small jitter. `clamp(x, min, max)` limits a number, and `roundTo4` rounds to four decimal places for persistence/debugging only.

```js
const STATE_EDGE = {
  favorable:  0.15,
  calm:       0.06,
  unstable:   0.00,
  dangerous: -0.10,
  chaotic:   -0.18
};

// uniform(rng, a, b) uses the server-owned PRNG; it is never generated in the browser.
safeProbability = clamp(
  0.82 + STATE_EDGE[riskState] * 1.35 - difficulty * 0.055 + uniform(rng, -0.025, 0.025),
  0.58, 0.95
);

pushProbability = clamp(
  0.58 + STATE_EDGE[riskState] * 1.10 - difficulty * 0.080 + uniform(rng, -0.040, 0.040),
  0.28, 0.82
);

yoloProbability = clamp(
  0.35 + STATE_EDGE[riskState] * 1.65 - difficulty * 0.105 + uniform(rng, -0.055, 0.055),
  0.10, 0.65
);

safeGain = 0.08 + difficulty * 0.025;  // 8.0% to 10.5%
pushGain = 0.27 + difficulty * 0.080;  // 27.0% to 35.0%
yoloGain = 0.85 + difficulty * 0.220;  // 85.0% to 107.0%

safeLoss = 0.18 + difficulty * 0.050;  // 18.0% to 23.0%
pushLoss = 0.44 + difficulty * 0.080;  // 44.0% to 52.0%
yoloLoss = 0.85 + difficulty * 0.080;  // 85.0% to 93.0%
```

The reward shown on each card is `Math.round(gain * 100) + '%'`; show no probabilities, loss percentages, expected values, or hidden-state labels in the game UI. Risk intensity is communicated only through the card name, styling, and the signals panel.

#### Why these values create meaningful trade-offs

- **SAFE** has a small positive baseline expected value in calm/favorable conditions but turns unfavorable in dangerous/chaotic conditions. It is about survival, not a free win.
- **PUSH** is roughly break-even/slightly negative in unstable conditions but has strong upside in favorable conditions; it is the most common skill expression.
- **YOLO** has strongly negative expected value in neutral/bad states, but positive expected value in distinctly favorable conditions. It is not correct often, but is not automatically irrational.
- Longer runs become harder because downside and noise rise. Rewards also rise, maintaining temptation without a flat optimal policy.

### 4.4 Outcome and scoring formula

On choice, the server rolls `roll = rng()` (`0 <= roll < 1`). The choice succeeds when `roll < choice.probability`.

```js
if (success) {
  scoreAfter = Math.min(
    MAX_SCORE,
    Math.max(0, Math.round(scoreBefore * (1 + choice.gain)))
  );
} else {
  scoreAfter = Math.max(0, Math.round(scoreBefore * (1 - choice.loss)));
}

isBust = scoreAfter <= BUST_THRESHOLD;
```

Set `BUST_THRESHOLD = 20`. A score of 20 or below is a bust. There is no separate random instant-bust rule in V1; the high YOLO loss naturally creates frequent busts at low/mid stacks while allowing a large stack to survive a hit. This is easier to explain and test.

The UI displays rounded integer scores only. It must never calculate the displayed result optimistically; animate from the old score to the score in the server response.

### 4.5 Expected value reference (round 1, before jitter)

The following is for balancing documentation, tests, and `README.md`, not for the player-facing game screen. Expected multiplier is:

```text
E[multiplier] = p × (1 + gain) + (1 - p) × (1 - loss)
```

| State | SAFE | PUSH | YOLO | Intended observation |
|---|---:|---:|---:|---|
| favorable | 1.067 | 1.089 | 1.166 | Aggression can be correct |
| calm | 1.054 | 1.019 | 0.913 | SAFE has a clean edge |
| unstable | 1.033 | 0.972 | 0.745 | Do not force high risk |
| dangerous | 0.998 | 0.894 | 0.465 | Damage limitation matters |
| chaotic | 0.971 | 0.831 | 0.320 | Signals should make caution feel earned |

Values are approximate, exclude jitter/difficulty, and should be reproduced by unit tests with a tolerance of `0.002`.

### 4.6 Geometric growth and survival

Arithmetic expected value is not the same as typical compounded outcome. Track log growth in simulations:

```text
geometricGrowth = exp(mean(log(scoreAfter / scoreBefore))) - 1
```

Calculate survival after `N` resolved rounds as `runsNotBustedBeforeN / runsThatReachedOrCouldReachN`. Report this curve in the simulation output at N = 3, 5, 8, 10, and 15. The V1 target is a median completed-run duration of 7-12 rounds; it is acceptable that the right tail produces dramatic stacks, but only if it remains rare and capped.

---

## 5. Signal model

Signals are clues, not probabilities. They must correlate with the hidden state enough to reward attention but retain sufficient noise to prevent mechanical certainty.

### 5.1 Signal generation

For each generated round, use the hidden state latent quality `L` and the same server-owned/daily deterministic PRNG.

```js
signalNoise = 12 + difficulty * 10;
volatilityNoise = 11 + difficulty * 12;

signalStrength = clamp(
  Math.round(L + uniform(rng, -signalNoise, signalNoise) - difficulty * 5),
  0, 100
);

volatility = clamp(
  Math.round((100 - L) + uniform(rng, -volatilityNoise, volatilityNoise) + difficulty * 8),
  0, 100
);

trendUpChance = clamp(0.15 + (L / 100) * 0.65 - difficulty * 0.08, 0.10, 0.85);
trend = Array.from({ length: 5 }, () => rng() < trendUpChance ? 'up' : 'down');

riskValue = volatility - signalStrength * 0.25 + uniform(rng, -7, 7);
riskIndicator = riskValue < 24 ? 'LOW' : riskValue < 51 ? 'MEDIUM' : 'HIGH';
```

Display `signalStrength` and `volatility` as segmented 10-block meters, not numerical percentages. The accessible labels may state e.g. `Signal strength: 7 of 10 bars`; do not expose the original 0-100 number through hidden DOM attributes. Display `trend` as five arrows such as `↑ ↑ ↓ ↑ ↑`; its accessible text is `Trend: up, up, down, up, up`. Display `riskIndicator` exactly as `LOW`, `MEDIUM`, or `HIGH`.

### 5.2 Signal interpretation intended for players

| Visible pattern | Typical, not guaranteed, implication |
|---|---|
| Strong signal + low volatility + mostly up trend | Favorable/calm is more likely |
| Mid signal + mid volatility + mixed trend | Unstable is more likely |
| Weak signal + high volatility + mostly down trend | Dangerous/chaotic is more likely |

Never show this explanatory table in the in-game HUD. It may appear in a small optional **How signals work** modal, phrased as broad guidance and explicitly noting that signals are imperfect.

---

## 6. Daily and random modes

### 6.1 Random mode

`RANDOM RUN` uses a seed generated server-side with `crypto.randomBytes(4).readUInt32LE(0)`. Feed that seed to the same deterministic PRNG used everywhere else. Do not call `Math.random()` in engine code. Store the seed in `runs.rng_seed` so a developer can reproduce a run locally for debugging.

### 6.2 Daily mode

`DAILY RUN` must be deterministic for a local calendar date and be labelled **DAILY MODE** across the game screen and end screen.

- Define the daily date in the server's local timezone as `YYYY-MM-DD`. Return this date from `GET /api/daily`; the frontend must not independently decide it.
- Seed string: `stack-daily-v1:${YYYY-MM-DD}`.
- Convert this string to an unsigned 32-bit integer using FNV-1a (specified below), then seed `mulberry32`.
- At run start, generate and persist a **60-round deck**: risk state, signals, probabilities, gain/loss values, and three precomputed choice rolls for each round. A daily run consumes deck entries sequentially.
- For a given date, every player sees the same round signals/options. If two players select the same choice on the same round, they receive the same outcome. This is intentional for V1 fairness/replayability and is acceptable because the mode allows unlimited local attempts.
- Do not use client time, browser RNG, or `Math.random()` for Daily mode.

### 6.3 Deterministic PRNG reference

Implement a small seeded JavaScript PRNG such as `mulberry32`. Keep this implementation in `src/game/rng.js`, document it, and test it with known outputs.

```js
export function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

For a deck, always consume RNG values in the same order: choose initial/next risk state, calculate option jitters, calculate signals/trend/risk indicator, then generate `safeRoll`, `pushRoll`, `yoloRoll`. Do not change this order without incrementing the daily seed version (`v2`) and documenting the compatibility change.

---

## 7. Persistence and SQLite schema

### 7.1 Why persist individual rounds in V1

Persist the `rounds` table. It makes balancing measurable: future analysis can compare choices to states/signals, see bank-round distribution, verify daily determinism, and detect an accidental dominant strategy. The data volume is tiny for a local app.

Use a transaction for every state-changing action: read active run/current round, validate state, resolve/persist result, update run, and commit. On error, roll back.

### 7.2 SQL schema

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('random', 'daily')),
  status TEXT NOT NULL CHECK (status IN ('active', 'awaiting_decision', 'banked', 'busted')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  daily_date TEXT,
  daily_seed TEXT,
  rng_seed INTEGER NOT NULL,
  starting_score INTEGER NOT NULL DEFAULT 100 CHECK (starting_score > 0),
  current_score INTEGER NOT NULL CHECK (current_score >= 0),
  final_score INTEGER,
  highest_score INTEGER NOT NULL CHECK (highest_score >= 0),
  rounds_completed INTEGER NOT NULL DEFAULT 0 CHECK (rounds_completed >= 0),
  current_round_number INTEGER NOT NULL DEFAULT 1 CHECK (current_round_number >= 1),
  streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
  max_streak INTEGER NOT NULL DEFAULT 0 CHECK (max_streak >= 0),
  biggest_gain INTEGER NOT NULL DEFAULT 0 CHECK (biggest_gain >= 0),
  bank_round INTEGER,
  risk_profile TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((mode = 'daily' AND daily_date IS NOT NULL AND daily_seed IS NOT NULL) OR mode = 'random')
);

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number >= 1),
  hidden_state TEXT NOT NULL CHECK (hidden_state IN ('favorable', 'calm', 'unstable', 'dangerous', 'chaotic')),
  difficulty REAL NOT NULL CHECK (difficulty >= 0 AND difficulty <= 1),
  signal_strength INTEGER NOT NULL CHECK (signal_strength BETWEEN 0 AND 100),
  volatility INTEGER NOT NULL CHECK (volatility BETWEEN 0 AND 100),
  trend TEXT NOT NULL,
  risk_indicator TEXT NOT NULL CHECK (risk_indicator IN ('LOW', 'MEDIUM', 'HIGH')),
  safe_probability REAL NOT NULL CHECK (safe_probability BETWEEN 0 AND 1),
  push_probability REAL NOT NULL CHECK (push_probability BETWEEN 0 AND 1),
  yolo_probability REAL NOT NULL CHECK (yolo_probability BETWEEN 0 AND 1),
  safe_gain REAL NOT NULL,
  push_gain REAL NOT NULL,
  yolo_gain REAL NOT NULL,
  safe_loss REAL NOT NULL,
  push_loss REAL NOT NULL,
  yolo_loss REAL NOT NULL,
  safe_roll REAL,
  push_roll REAL,
  yolo_roll REAL,
  choice TEXT CHECK (choice IN ('SAFE', 'PUSH', 'YOLO')),
  success INTEGER CHECK (success IN (0, 1)),
  score_before INTEGER,
  score_after INTEGER,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (run_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_runs_ended_at ON runs(ended_at);
CREATE INDEX IF NOT EXISTS idx_runs_mode_status ON runs(mode, status);
CREATE INDEX IF NOT EXISTS idx_rounds_run_id ON rounds(run_id);
CREATE INDEX IF NOT EXISTS idx_rounds_choice ON rounds(choice);
```

For Daily mode, insert all 60 deck records at start. For Random mode, insert one unresolved round at start and each subsequent unresolved round only after the player continues. The round response must omit `hidden_state`, all probabilities, all losses, and rolls.

---

## 8. Backend API contract

All API responses use JSON. Set `Content-Type: application/json; charset=utf-8`. Parse only JSON bodies and apply `express.json({ limit: '16kb' })`.

### 8.1 Public round shape

Use this exact general shape wherever an active/current round is returned:

```json
{
  "roundNumber": 7,
  "signals": {
    "signalBars": 7,
    "volatilityBars": 3,
    "trend": ["up", "up", "down", "up", "up"],
    "riskIndicator": "LOW"
  },
  "options": [
    { "id": "SAFE", "label": "SAFE", "rewardPercent": 9, "riskClass": "low" },
    { "id": "PUSH", "label": "PUSH", "rewardPercent": 30, "riskClass": "medium" },
    { "id": "YOLO", "label": "YOLO", "rewardPercent": 91, "riskClass": "high" }
  ]
}
```

Never include `hiddenState`, `probability`, `loss`, RNG seed, or outcome rolls in a browser response for an active run.

### 8.2 `POST /api/run/start`

Request:

```json
{ "mode": "random" }
```

or

```json
{ "mode": "daily" }
```

Success: `201 Created`

```json
{
  "run": {
    "id": "uuid",
    "mode": "daily",
    "dailyDate": "2026-09-03",
    "status": "active",
    "currentScore": 100,
    "highestScore": 100,
    "streak": 0,
    "roundsCompleted": 0
  },
  "round": { "roundNumber": 1, "signals": {}, "options": [] }
}
```

Reject non-object body or `mode` not exactly `random`/`daily` with `400` and `{ "error": { "code": "INVALID_MODE", "message": "Mode must be random or daily." } }`.

### 8.3 `POST /api/run/:runId/choice`

Request:

```json
{ "choice": "PUSH" }
```

Server flow: validate UUID and choice, fetch current unresolved round under transaction, derive choice probability/payoff internally, select its stored daily roll or server RNG roll, calculate score, update round and run, commit.

Success response example (success):

```json
{
  "run": {
    "id": "uuid",
    "mode": "random",
    "status": "awaiting_decision",
    "currentScore": 127,
    "highestScore": 127,
    "streak": 1,
    "roundsCompleted": 1
  },
  "result": {
    "choice": "PUSH",
    "success": true,
    "scoreBefore": 100,
    "scoreAfter": 127,
    "message": "SIGNAL LOCKED"
  }
}
```

Failure-but-alive response uses `status: "active"`, `success: false`, and `message: "SYSTEM HIT"`. A bust uses `status: "busted"`, `isBust: true`, and `message: "SYSTEM FAILURE"`.

Ignore and reject extra client-provided `score`, `success`, `probability`, `outcome`, `hiddenState`, or `roll` fields with `400` / `UNEXPECTED_AUTHORITATIVE_FIELD`. Never silently use them.

### 8.4 `POST /api/run/:runId/continue`

No request body. Valid only when the current run is `awaiting_decision` after success, or `active` after a non-bust failure with no unresolved next round. Create/read the next round and return `200` with `{ run, round }` in the same shape as start. Reject a current unresolved round or terminal run with `409`.

### 8.5 `POST /api/run/:runId/bank`

No request body. Valid only while `status=awaiting_decision`.

```json
{
  "run": {
    "id": "uuid",
    "mode": "daily",
    "status": "banked",
    "finalScore": 749,
    "highestScore": 749,
    "roundsCompleted": 6,
    "maxStreak": 6,
    "riskProfile": "Calculated Menace",
    "bankRound": 6,
    "endedAt": "2026-09-03T12:00:00.000Z"
  }
}
```

### 8.6 `GET /api/run/:runId`

Returns current public run state. Return an unresolved current `round` only when the run is active. Return terminal summary for banked/busted runs. Never leak stored private round fields.

### 8.7 `GET /api/stats`

Returns SQLite-derived local aggregate stats:

```json
{
  "totalRuns": 28,
  "totalBankedRuns": 11,
  "totalBusts": 17,
  "bestScore": 1842,
  "averageFinalScore": 203,
  "longestStreak": 11,
  "averageRoundsSurvived": 6.8,
  "choiceCounts": { "SAFE": 63, "PUSH": 82, "YOLO": 31 }
}
```

Use `0` and empty count objects when there are no completed runs; do not return `null` or divide by zero.

### 8.8 `GET /api/daily`

```json
{
  "date": "2026-09-03",
  "label": "DAILY MODE",
  "seedVersion": "v1",
  "allowsUnlimitedAttempts": true
}
```

### 8.9 Errors

Use stable status codes: `400` malformed/invalid input, `404` missing run/route, `409` invalid state transition, `429` rate limited, `500` unexpected server error. Every error follows:

```json
{ "error": { "code": "INVALID_RUN_STATE", "message": "This run cannot be banked right now." } }
```

Log detailed errors server-side. Never send stack traces, SQL text, seeds, or internal round fields to the browser.

---

## 9. Frontend specification

### 9.1 Visual system

Create an 80s cyberpunk terminal / arcade atmosphere without sacrificing readability.

- Background: near-black `#07080D`, navy-black panels `#101321`, faint CRT scanline overlay at <= 4% opacity.
- Primary type: readable pixel/terminal-inspired mono face with a system monospace fallback. Do not use a hard-to-read novelty font for body copy.
- Accent mapping: green `#8CFF78` for safe/success, cyan `#5AE8FF` for data/info, magenta `#FF53BE` for PUSH/active energy, amber-red `#FF8C61` for YOLO/danger. Use text/icon/border signals as well as colour.
- Cards/panels: 1px neon-tinted borders, restrained shadow/glow, 8-12px corner radius (not excessive).
- Decorative scanlines, light flicker, and city-grid elements are `aria-hidden="true"`; motion is reduced or removed under `prefers-reduced-motion: reduce`.
- Use 160-240 ms transitions. Avoid constant animations. Critical state changes get one short success flash or bust shake, then stop.

### 9.2 Start screen

Required visible content:

```text
STACK
How far can you push it?

[ RANDOM RUN ] [ DAILY RUN ]

LOCAL BEST      1,842
TOTAL RUNS      28

Probability rewards the brave. Variance punishes the careless.
```

The final footer line is adjustable copy; do not use language that frames the product as real-world gambling. On mobile, buttons stack vertically and remain above the fold. Add a `STATS` secondary button that opens an accessible modal or full-screen mobile drawer.

### 9.3 Game screen

Required hierarchy:

```text
STACK                         DAILY MODE (only when applicable)
ROUND 07

CURRENT STACK                 STREAK
438                           6

SIGNALS
Signal Strength               ███████░░░
Volatility                    ███░░░░░░░
Trend                         ↑ ↑ ↓ ↑ ↑
Risk indicator                LOW

[ SAFE  +8% ] [ PUSH  +24% ] [ YOLO  +71% ]
```

- The score must use a tabular/monospace numeric style to prevent layout movement.
- The three option cards are buttons with visible focus states. Their labels and reward percentages are visible; probabilities are not.
- SAFE has the quietest green treatment, PUSH a stronger magenta/cyan treatment, and YOLO the strongest amber/magenta treatment. Each must still be distinguishable in grayscale via an icon and risk text (`LOW`, `MEDIUM`, `HIGH`).
- On a choice click: disable all option buttons immediately, show a short `CALCULATING…` state (max 350 ms; skip/reduce for reduced motion), send the request, then render only the returned result. Never fabricate a result client-side.
- Desktop: cards are three columns. Mobile: stack cards vertically in the same SAFE/PUSH/YOLO order.

### 9.4 Result and decision states

On success, show either `ACCESS GRANTED` or `SIGNAL LOCKED`, score transition (e.g. `438 → 749`), and streak. Then present two primary actions:

```text
[ BANK 749 ] [ KEEP GOING ]
```

On failure above bust threshold, show:

```text
SYSTEM HIT
438 → 241
[ CONTINUE ]
```

On bust:

```text
SYSTEM FAILURE
STACK LOST
```

Then immediately move into the end-screen summary. Use a single quick glitch/fade effect; never flash rapidly enough to be uncomfortable. Do not use audio in V1.

### 9.5 End screen

Show final score, local best, rounds, longest streak, mode, biggest gain, and risk profile. Required actions:

- `RUN IT AGAIN` - starts the same mode; daily uses the same date/seed.
- `HOME` - returns to start screen and refreshes local stats.
- `COPY RESULT` - uses `navigator.clipboard.writeText` to copy plain text. If unavailable, show a readable failure message and keep the result selectable.

Suggested copy format:

```text
STACK // DAILY MODE
Final stack: 749
Rounds: 6 | Longest streak: 6
Profile: Calculated Menace
```

### 9.6 Local stats modal/page

Fetch `/api/stats` when opened and show:

- Total runs, total banked runs, total busts, best score, average final score, longest streak, average rounds survived.
- SAFE, PUSH, and YOLO choice counts plus percentage of all resolved choices.
- Empty state: `NO RUNS LOGGED. THE STACK IS WAITING.`

No charts are required in V1. If simple CSS bars are used for choice distribution, provide a text equivalent and labelled values.

### 9.7 Risk profile formula

At terminal state calculate from persisted run values. Let:

```text
totalChoices = safeCount + pushCount + yoloCount
yoloRate = yoloCount / max(totalChoices, 1)
safeRate = safeCount / max(totalChoices, 1)
banked = outcome == "banked"
bankRound = roundsCompleted when banked, otherwise null
```

Evaluate in this order:

| Condition | Profile |
|---|---|
| `safeRate >= 0.65 && banked && bankRound <= 5` | `Risk Analyst` |
| `safeRate >= 0.65 && !banked` | `Cautious Operator` |
| `yoloRate >= 0.45 && banked` | `Calculated Menace` |
| `yoloRate >= 0.45 && !banked` | `Variance Enjoyer` |
| `banked && bankRound >= 10 && yoloRate < 0.45` | `Stack Architect` |
| `pushCount / max(totalChoices, 1) >= 0.50` | `Signal Chaser` |
| otherwise | `Adaptive Operator` |

Profiles are light flavour only. Do not present them as psychological assessment or use language that encourages real-world risk-taking.

---

## 10. Security and reliability

This is a local V1, but it must be built with ordinary web safety practices. No application should be described as unhackable.

- The backend, not the browser, generates states, probabilities, outcomes, scores, streaks, daily deck entries, and final run results.
- Validate request bodies, route IDs, allowed choice strings, and status transitions. Do not coerce arbitrary values into valid choices.
- Reject authoritative fields from clients (`score`, `success`, `probability`, `outcome`, `hiddenState`, `roll`), as specified above.
- Use server-owned deterministic PRNG / `crypto` seed generation; never trust browser random values.
- Use parameterized SQLite statements only. Never concatenate input into SQL.
- Use `helmet`, a restrictive Content Security Policy compatible with locally served assets, a JSON body limit, and `express-rate-limit` on `/api` (e.g. 120 requests/minute/IP). Keep rate limits generous enough for normal local play.
- Keep `.env`, `.env.local`, `data/*.db`, `node_modules/`, coverage output, and logs out of Git. Provide `.env.example` without secrets.
- Use `textContent`, `createElement`, and explicit attributes for dynamic player-visible text. Do not use `eval`, dynamic code execution, or unsanitized `innerHTML`.
- Return generic safe error payloads and log detailed server errors only locally. Do not expose stack traces.
- Run `npm audit` before release; review rather than blindly auto-fixing major dependency changes.
- Use UUIDs for run IDs. A local run ID is not authorization; future production authentication/ownership remains out of scope.

---

## 11. Testing plan

Run tests with `node --test`. Make engine/signal/RNG functions pure so they can be tested without a web server or database.

### 11.1 Required unit tests

- FNV-1a and `mulberry32` produce deterministic known sequences from an identical seed.
- A Daily seed is identical for one date and different for another date/version.
- A Daily deck reproduces the same 60 public rounds and per-choice outcomes for the same date.
- Starting state is exactly score 100, round 1, streak 0, active status.
- SAFE, PUSH, and YOLO probabilities conform to their formulas and clamp boundaries.
- Favorable state probability is higher than dangerous state probability for every option before jitter.
- Success and failure score calculations round correctly and respect max score.
- Score at 20 and score below 20 bust; score at 21 does not.
- Successful round increments streak and highest score; failed non-bust round resets streak.
- Bank is accepted only after a success and creates an immutable terminal run.
- Difficulty is 0 in round 1, 0.2 in round 5, 0.7 in round 15, and 1 at/after round 21.
- Signals are in bounds, have exactly five trend markers, and correlate statistically with latent quality across a large deterministic sample.
- Public round serialization omits hidden state, probabilities, losses, rolls, and seed.

### 11.2 Required API/integration tests

- Start random and daily runs, assert `201` and valid public round fields.
- Reject invalid mode, invalid UUID, invalid choice, malformed JSON, and extra authoritative fields.
- A choice resolves exactly once; duplicate choice request is `409`.
- Client attempts to specify score/final result never change the authoritative result.
- Bank before a success is `409`; bank after a success persists `banked` final score/timestamps/profile.
- Terminal runs reject choice, continue, and repeat bank actions.
- `GET /api/run/:id` does not reveal private fields.
- Stats values derive correctly from a temporary test database.
- Database records runs/rounds, foreign key behaviour, and round uniqueness work.

### 11.3 Edge cases

- Score cap of 9,999,999.
- YOLO loss from 100 busts; a high score can survive the same loss if it remains above 20.
- Refresh/reload mid-run: `GET /api/run/:id` restores the server state.
- Empty database stats.
- A date change produces a new daily seed only for newly started runs; existing runs retain their stored date/seed.
- Invalid/expired local route calls do not crash the server or reveal stack traces.

---

## 12. Balancing and simulation

Game values in `constants.js` are intentionally easy to change. Never alter a constant silently: record date, old value, new value, reason, and simulation result in `BUILD_PROGRESS.md` or a `Balance changes` section in `README.md`.

### 12.1 Simulation requirement

Implement `scripts/simulate.js` to run **at least 100,000 complete runs per strategy** with a reproducible CLI seed, using the exact `engine.js` functions and no UI/database code.

Required strategies:

1. Always SAFE.
2. Always PUSH.
3. Always YOLO.
4. Uniform random choice.
5. Signal-aware heuristic:
   - choose YOLO only when signal bars >= 8, volatility bars <= 3, and 4+ of 5 trend markers are up;
   - choose PUSH when signal bars >= 6 and volatility bars <= 5;
   - otherwise choose SAFE;
   - bank after a success when score >= 350, after 10 completed rounds, or when a score gain is followed by high risk.

For a fair comparison, give non-signal strategies a simple banking policy: bank after score >= 300 or after 10 completed rounds. Print JSON and a human-readable table with:

- Average final score, median final score, top 1% score, highest observed score.
- Bust rate, bank rate, average rounds, median rounds.
- Average and median score for banked runs.
- Survival at 3, 5, 8, 10, and 15 rounds.
- Arithmetic expected multiplier and geometric growth by option/state when feasible.

### 12.2 Initial balance hypotheses

These are hypotheses, not proved benchmarks:

- Always SAFE should have low volatility and frequent small banks, but should not dominate signal-aware play on average final banked score.
- Always YOLO should have high bust rate and a rare high-score tail; it should not win on median outcomes.
- Signal-aware play should outperform uniform random selection in median banked score and/or controlled survival, but not guarantee wins.
- No strategy should have both the highest median final score and the lowest bust rate by a large margin.
- With target interaction cadence, the median run should complete within 1-3 minutes.

If simulation finds a dominant strategy, adjust only the documented constants, rerun simulation, record the before/after metrics, and retest. Do not solve balance by hiding more information without evidence.

---

## 13. Local analytics

Do not add third-party analytics. Calculate all V1 analytics from SQLite.

| Metric | Definition | Why it matters |
|---|---|---|
| Runs started | Count all created runs | Basic activation |
| Runs completed | Count banked + busted runs | Detect abandoned/incomplete flow |
| Runs banked / busted | Terminal outcome counts | Risk/reward and frustration signal |
| Average/median rounds | Resolved rounds per terminal run | Checks target run duration |
| SAFE/PUSH/YOLO selection % | Choice counts divided by all resolved choices | Shows whether choices are meaningfully used |
| Bank-round distribution | Banked runs grouped by bank round | Shows whether banking is a real decision |
| Average/median final score | Terminal final scores | Detects extreme balance |
| Replay rate | A new run started within 10 minutes of a terminal run, grouped locally | Proxy for “one more run” appeal |
| Games per local session | Runs begun before 30 minutes of inactivity | Session engagement hypothesis |

For V1, session boundaries are an analytics query convention, not a user identity system. Use timestamps only. These metrics help assess whether players understand the signals, explore choices, bank intentionally, and voluntarily replay. They do not prove fun on their own; pair them with friend feedback.

---

## 14. Development phases

Work sequentially. Do not jump to visual polish before the engine and tests are correct.

### Phase 1 - Pure game engine

- **Files:** `src/game/constants.js`, `engine.js`, `signals.js`, `rng.js`, `tests/game-engine.test.js`, `tests/rng.test.js`, `tests/signals.test.js`.
- **Tasks:** Implement formulas, state transitions, public/private serialization, deterministic helpers, and tests.
- **Acceptance:** A test can run a complete random or seeded run without Express/SQLite; server-only fields cannot appear in a public round.

### Phase 2 - CLI simulation

- **Files:** `scripts/simulate.js`, optional `scripts/README.md` notes.
- **Tasks:** Run required strategies and print all required metrics for 100,000+ runs/strategy.
- **Acceptance:** `npm run simulate` completes reproducibly, detects no obvious dominant strategy, and output is logged in `BUILD_PROGRESS.md`.

### Phase 3 - Backend API

- **Files:** `src/server.js`, `src/routes/runs.js`, `src/routes/daily.js`, `src/middleware/errors.js`, `src/middleware/validate.js`, `tests/api.test.js`.
- **Tasks:** Add Express/static serving, safe validation/error handling, in-memory temporary repository if needed before Phase 4.
- **Acceptance:** Start, choose, continue, bank, read, and Daily metadata APIs pass contract tests. Browser cannot submit an outcome/score.

### Phase 4 - SQLite persistence

- **Files:** `src/db/schema.sql`, `src/db/database.js`, `data/.gitkeep`, `tests/database.test.js`, `.gitignore`.
- **Tasks:** Initialize/migrate schema; persist atomically; add stats queries; replace any temporary repository.
- **Acceptance:** Restarting the server preserves runs; a terminal run/its rounds are queryable; all required stats are correct in tests.

### Phase 5 - Functional frontend

- **Files:** `public/index.html`, `public/styles.css`, `public/app.js`.
- **Tasks:** Build start/game/result/end screens; hook to APIs; support reload recovery if a current run ID is stored in localStorage; add stats and copy result.
- **Acceptance:** Entire loop works with keyboard and touch; no score/outcome mathematics exists in frontend JS.

### Phase 6 - Cyberpunk polish

- **Files:** `public/styles.css`, minimal asset files only if necessary.
- **Tasks:** Apply token system, panels, scanlines, restrained transition effects, responsive layouts, focus states, reduced-motion rules.
- **Acceptance:** Readable at 320px mobile width and desktop; no clutter, rapid flashing, or hover-only action; Lighthouse/accessibility manual review finds no blocking interaction issue.

### Phase 7 - Daily challenge

- **Files:** `src/game/daily.js`, `src/routes/daily.js`, `tests/rng.test.js`, `tests/api.test.js`.
- **Tasks:** Implement date seed/deck, 60-round persistence, mode labels, deterministic tests.
- **Acceptance:** Two fresh daily runs for one date return matching public rounds/outcomes for equal choices; a new date differs.

### Phase 8 - Stats

- **Files:** `src/routes/stats.js`, `public/app.js`, `tests/database.test.js`.
- **Tasks:** Build aggregate SQL queries and accessible stats modal/page.
- **Acceptance:** Empty and populated stats are correct and UI receives no raw internal game data.

### Phase 9 - Final tests and balancing

- **Files:** all tests, `scripts/simulate.js`, `README.md`, `BUILD_PROGRESS.md`.
- **Tasks:** Run test suite, simulation, manual mobile/desktop checks, record balance result and known V1 limitations.
- **Acceptance:** All tests pass, simulation has been reviewed, no documented dominant strategy exists, and Definition of Done is checked.

---

## 15. Definition of done

V1 is done only when all items are true:

- [ ] App launches locally with one documented command.
- [ ] Player can start Random Run and Daily Run.
- [ ] Exactly three options appear each round, with no displayed probabilities.
- [ ] Signals are generated and visibly correlated, but not deterministically revealing.
- [ ] Backend determines all outcomes and score changes.
- [ ] Score compounds, can be banked, and can bust at/under threshold.
- [ ] Replay and Home work.
- [ ] Runs and rounds save to SQLite.
- [ ] Local stats calculate correctly.
- [ ] Daily Run is deterministic for a date and seed version.
- [ ] Desktop and mobile layouts are usable.
- [ ] Simulation runs and balance is documented.
- [ ] Automated unit/API/database tests pass.
- [ ] No client-authoritative score/outcome logic exists.
- [ ] README has the required setup and design documentation.

---

## 16. README requirements

The eventual `README.md` must contain:

1. Game description and a short V1 scope/non-goals statement.
2. Screenshot placeholders (do not claim screenshots exist until added).
3. Architecture diagram or concise architecture explanation.
4. Prerequisites: Node.js 20+ and npm.
5. Installation: `npm install`, database initialization, and environment setup.
6. Commands: `npm run dev`, `npm test`, `npm run simulate`, and production/start command if added.
7. Project structure and responsibility summary.
8. Game mathematics: risk state, signal relationship, option formulas, bust, banking, and Daily seed model.
9. API endpoint table with request/response outlines.
10. Security decisions and clear note that local V1 is not “unhackable.”
11. Balance changes / simulation summary.
12. Future roadmap and explicit V1 exclusions.

Suggested package scripts:

```json
{
  "dev": "node --watch src/server.js",
  "start": "node src/server.js",
  "test": "node --test",
  "simulate": "node scripts/simulate.js",
  "audit": "npm audit"
}
```

---

## 17. Future roadmap - out of scope for V1

Do not implement any of the following now:

- Accounts and user-owned cloud data.
- Cloud Postgres.
- Global leaderboard, friend leaderboard, private leagues, or a public daily challenge (V1 Daily mode remains local-only).
- Shareable result cards (plain text copy is sufficient V1).
- Native mobile applications.
- Paid cosmetic themes, subscriptions, achievements, persistent cross-device streak tracking.
- Server-hosted production deployment and stronger anti-cheat controls.

These may be revisited only after V1 gameplay/retention hypotheses have evidence.

---

## 18. BUILD INSTRUCTIONS FOR CODEX

1. Read this entire specification before creating files. Build **only** the V1 defined here; do not add product features or major dependencies on your own.
2. Create `BUILD_PROGRESS.md` first. Copy every phase acceptance criterion into it as unchecked tasks and date each completed task.
3. Implement phases sequentially. **Do not implement everything in one giant step.** Finish one phase, run its tests, update `BUILD_PROGRESS.md`, then begin the next phase.
4. Keep game math in `src/game/` and UI rendering in `public/`. The frontend must never calculate authoritative scores, probabilities, hidden state, or result outcomes.
5. Run `npm test` after every phase. Add/repair tests before proceeding when a required behaviour is missing.
6. Complete `npm run simulate` before declaring balance final. Record seed, run count, strategy metrics, and conclusions in `BUILD_PROGRESS.md`.
7. Do not change game mathematics silently. Any changed constant requires: old value, new value, reason, expected effect, simulation before/after results, and a relevant test update.
8. Keep database code separate from engine code. Use transactions and parameterized SQL.
9. Prefer simple code over clever abstractions. Keep constants configurable, avoid premature abstraction, and add comments explaining mathematical formulas and non-obvious deterministic RNG ordering.
10. Build responsive and keyboard-accessible behaviour from the start; do not defer mobile or focus states to a later rewrite.
11. Before adding a major new dependency, framework, cloud service, or scope item, stop and ask for approval. V1 deliberately uses Express, SQLite, plain HTML/CSS/JS, and a small dependency set.
12. Before handoff, run the full automated test suite, simulation, a desktop manual pass, and a mobile-width manual pass. Then check every Definition of Done item and ensure `README.md` documents setup, maths, APIs, security, and limitations.
