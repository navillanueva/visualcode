-- Plan 5 (v0.5) — World ID personhood gate: bind a nullifier hash to an account.
-- The verify-human route binds the (human, app, action) nullifier to the account;
-- the unique index enforces one-human-one-account (the anti-Sybil constraint judges grade).
-- Idempotent (matches 0001_fund_payment.sql style); applied by src/db/migrate.ts on start.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS world_id_nullifier text;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS world_id_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_world_id_nullifier_idx
  ON accounts (world_id_nullifier)
