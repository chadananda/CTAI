import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(import.meta.dirname, '..', 'scripts', 'migrate-users-db-v3.sql'), 'utf-8');

describe('migrate-users-db-v3.sql', () => {
  it('creates job_blocks table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS job_blocks');
  });

  it('job_blocks has all required columns', () => {
    const requiredColumns = [
      'id TEXT PRIMARY KEY',
      'job_id TEXT NOT NULL',
      'block_index INTEGER NOT NULL',
      'source_text TEXT NOT NULL',
      'paragraph_indices TEXT',
      'status TEXT DEFAULT',
      'delib_round INTEGER DEFAULT 0',
      'output_json TEXT',
      'tokens_used INTEGER DEFAULT 0',
      'cost_usd REAL DEFAULT 0',
      'workflow_id TEXT',
      'error_message TEXT',
      'created_at TEXT',
      'completed_at TEXT',
    ];
    for (const col of requiredColumns) {
      expect(sql).toContain(col);
    }
  });

  it('job_blocks has status CHECK constraint with all valid statuses', () => {
    const statuses = ['pending', 'researching', 'translating', 'deliberating', 'converging', 'complete', 'failed'];
    for (const s of statuses) {
      expect(sql).toContain(`'${s}'`);
    }
  });

  it('adds total_blocks column to translation_jobs', () => {
    expect(sql).toContain('ALTER TABLE translation_jobs ADD COLUMN total_blocks INTEGER DEFAULT 0');
  });

  it('adds blocks_done column to translation_jobs', () => {
    expect(sql).toContain('ALTER TABLE translation_jobs ADD COLUMN blocks_done INTEGER DEFAULT 0');
  });

  it('adds segment_workflow_id column to translation_jobs', () => {
    expect(sql).toContain('ALTER TABLE translation_jobs ADD COLUMN segment_workflow_id TEXT');
  });

  it('adds finalize_workflow_id column to translation_jobs', () => {
    expect(sql).toContain('ALTER TABLE translation_jobs ADD COLUMN finalize_workflow_id TEXT');
  });

  it('adds user_email column to translation_jobs', () => {
    expect(sql).toContain('ALTER TABLE translation_jobs ADD COLUMN user_email TEXT');
  });

  it('adds email_digest column to users', () => {
    expect(sql).toContain('ALTER TABLE users ADD COLUMN email_digest INTEGER DEFAULT 1');
  });

  it('creates indexes on job_blocks', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_blocks_job ON job_blocks(job_id, block_index)');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_blocks_status ON job_blocks(job_id, status)');
  });

  it('does not contain DROP or DELETE statements', () => {
    expect(sql.toUpperCase()).not.toContain('DROP TABLE');
    expect(sql.toUpperCase()).not.toContain('DELETE FROM');
  });

  it('uses IF NOT EXISTS for safety', () => {
    expect(sql).toContain('IF NOT EXISTS job_blocks');
    expect(sql).toContain('IF NOT EXISTS idx_blocks_job');
    expect(sql).toContain('IF NOT EXISTS idx_blocks_status');
  });
});
