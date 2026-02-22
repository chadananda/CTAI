-- v4: Per-call cost logging for pipeline API calls
CREATE TABLE IF NOT EXISTS api_call_log (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES translation_jobs(id),
  phase TEXT NOT NULL,
  agent_role TEXT,
  model TEXT NOT NULL,
  prompt_chars INTEGER NOT NULL,
  response_chars INTEGER NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  duration_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_calls_job ON api_call_log(job_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_phase ON api_call_log(phase);
