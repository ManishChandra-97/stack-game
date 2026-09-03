PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS runs (
 id TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('random','daily')), status TEXT NOT NULL CHECK(status IN ('active','awaiting_decision','banked','busted')),
 started_at TEXT NOT NULL, ended_at TEXT, daily_date TEXT, daily_seed TEXT, rng_seed INTEGER NOT NULL,
 starting_score INTEGER NOT NULL DEFAULT 100 CHECK(starting_score > 0), current_score INTEGER NOT NULL CHECK(current_score >= 0), final_score INTEGER,
 highest_score INTEGER NOT NULL CHECK(highest_score >= 0), rounds_completed INTEGER NOT NULL DEFAULT 0, current_round_number INTEGER NOT NULL DEFAULT 1,
 streak INTEGER NOT NULL DEFAULT 0, max_streak INTEGER NOT NULL DEFAULT 0, biggest_gain INTEGER NOT NULL DEFAULT 0, bank_round INTEGER, risk_profile TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rounds (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, round_number INTEGER NOT NULL, hidden_state TEXT NOT NULL,
 difficulty REAL NOT NULL, signal_strength INTEGER NOT NULL, volatility INTEGER NOT NULL, trend TEXT NOT NULL, risk_indicator TEXT NOT NULL,
 safe_probability REAL NOT NULL, push_probability REAL NOT NULL, yolo_probability REAL NOT NULL, safe_gain REAL NOT NULL, push_gain REAL NOT NULL, yolo_gain REAL NOT NULL,
 safe_loss REAL NOT NULL, push_loss REAL NOT NULL, yolo_loss REAL NOT NULL, safe_roll REAL, push_roll REAL, yolo_roll REAL,
 choice TEXT, success INTEGER, score_before INTEGER, score_after INTEGER, resolved_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(run_id, round_number)
);
CREATE INDEX IF NOT EXISTS idx_runs_ended_at ON runs(ended_at);
CREATE INDEX IF NOT EXISTS idx_rounds_run_id ON rounds(run_id);
