-- =============================================================================
-- APA Duty Outside — Telegram duplicate-import fix migration
-- Run on the PRODUCTION database BEFORE deploying the new backend code:
--   mysql -u <USER> -p <DB_NAME> < migrate_telegram_dedup.sql
-- Safe to run multiple times. Stop the backend while applying it.
-- =============================================================================

SET NAMES utf8mb4;

SET @has_update_column := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND COLUMN_NAME = 'telegram_update_id'
);
SET @add_update_column := IF(@has_update_column = 0,
  'ALTER TABLE duty_request ADD COLUMN telegram_update_id BIGINT NULL AFTER source',
  'SELECT 1'
);
PREPARE stmt FROM @add_update_column;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_update_index := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND INDEX_NAME = 'uq_req_telegram_update'
);
SET @add_update_index := IF(@has_update_index = 0,
  'ALTER TABLE duty_request ADD UNIQUE KEY uq_req_telegram_update (telegram_update_id)',
  'SELECT 1'
);
PREPARE stmt FROM @add_update_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Marker table: per-chat "already replied & handled" tracking. Do not drop
-- the (update_id, chat_id) key is guaranteed even if an older single-column
-- version already exists. Safe to run again — only holds dedup markers.
CREATE TABLE IF NOT EXISTS telegram_processed_update (
  update_id  BIGINT      NOT NULL,
  chat_id    VARCHAR(64) NOT NULL DEFAULT '',
  kind       VARCHAR(20) NOT NULL DEFAULT 'other',
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (update_id, chat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
