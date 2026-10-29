-- ============================================================================
-- APA Duty Outside Register
-- Migration: allow source='public'
--
-- Why: the "Staff Request (No Login Required)" tab files records without a
-- session. Marking them 'public' lets the register tell them apart from portal
-- and Telegram submissions, so management can review every unauthenticated
-- entry in one place instead of trusting that it was genuinely the named person.
--
-- Run in MySQL Workbench with: Execute All (the whole script)
-- Prerequisite: the backend is stopped, and a current backup exists.
-- Re-running is harmless — MODIFY COLUMN to the same definition is a no-op.
-- ============================================================================

SET @safe_updates := @@SESSION.sql_safe_updates;
SET SESSION sql_safe_updates = 0;

-- --- PRE flight -------------------------------------------------------------
SELECT 'PRE-FLIGHT: about to widen the source enum on 2 tables' AS step;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND COLUMN_NAME = 'source'
   AND TABLE_NAME IN ('duty_request', 'audit_log')
 ORDER BY TABLE_NAME;

SELECT COUNT(*) AS public_rows_already_present
  FROM duty_request
 WHERE source = 'public';

-- --- Migration --------------------------------------------------------------

-- duty_request: records filed through the public no-login tab.
ALTER TABLE duty_request
  MODIFY COLUMN source ENUM('web','telegram','public') NOT NULL DEFAULT 'web';

-- audit_log: the trail for those submissions.
ALTER TABLE audit_log
  MODIFY COLUMN source ENUM('web','telegram','public') NOT NULL DEFAULT 'web';

-- --- POST flight ------------------------------------------------------------
SELECT 'POST-FLIGHT: source should now list public on both tables' AS step;

SELECT TABLE_NAME, COLUMN_TYPE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND COLUMN_NAME = 'source'
   AND TABLE_NAME IN ('duty_request', 'audit_log')
 ORDER BY TABLE_NAME;

SELECT source, COUNT(*) AS rows_total
  FROM duty_request
 GROUP BY source
 ORDER BY source;

SET SESSION sql_safe_updates = @safe_updates;

SELECT 'MIGRATION COMPLETE — restart the backend to use the public staff tab' AS done;
