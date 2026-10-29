-- =============================================================================
-- APA Duty Outside — GM strike waiver + retroactive compliance migration
-- Adds the APA-MEMO_09-2026_05 compliance columns to duty_request:
--   Direct to Home, submission timing (advance/on_time/retroactive),
--   late submission justification, and the GM executive strike waiver.
--
-- Run on the PRODUCTION database BEFORE deploying the new backend code:
--   mysql -u <USER> -p <DB_NAME> < migrate_gm_waiver_retroactive.sql
--
-- Running in MySQL Workbench:
--   1. Back up first (Server > Data Export), and STOP the backend.
--   2. File > New Query Tab, open this file, paste its contents.
--   3. Confirm the preflight result grid shows duty_request_exists = 1 and the
--      expected target_schema. If it shows 0, you are on the wrong schema:
--      re-run after selecting the correct one.
--   4. Press the "Execute All" lightning bolt (Ctrl+Shift+Enter) so the whole
--      script runs as one batch -- the @has_col / @ddl session variables below
--      drive the PREPARE/EXECUTE pairs and must not be split across reconnects.
--      Do NOT run statement-by-statement.
--   5. Workbench' "Safe Updates" setting does not matter here: the script turns
--      it off for its own session (see below), so it will not fail with 1175.
--
-- Safe to run multiple times (idempotent). Stop the backend while applying it.
--
-- By default this script performs a SCHEMA-ONLY change: it adds the columns and
-- indexes and touches no existing row's data. Existing rows keep
-- submission_timing = NULL, and the backend derives the correct value on read
-- (deriveSubmissionTiming() in src/repositories.js), so historical compliance
-- reporting is accurate either way.
--
-- The historical reclassification backfill at the bottom is OPT-IN, because it
-- would retroactively mark old records as 'retroactive' and feed them into
-- strike counting for staff who already served those duties. Enable it only if
-- you have decided historical records should be scored under the new policy:
--   SET @backfill_existing := 1;
-- =============================================================================

SET NAMES utf8mb4;

-- Workbench (and most clients) enable safe-update mode by default, which
-- rejects the non-key WHERE clauses used by the backfill below with error 1175.
-- Turn it off for this session so the script runs unmodified.
SET SESSION sql_safe_updates = 0;

-- Preflight: confirm schema and table before any change is made.
SELECT DATABASE() AS target_schema,
       (SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request') AS duty_request_exists,
       (SELECT COUNT(*) FROM duty_request) AS rows_in_duty_request;

-- 1. is_direct_to_home ---------------------------------------------------------
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND COLUMN_NAME = 'is_direct_to_home'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE duty_request ADD COLUMN is_direct_to_home TINYINT(1) NOT NULL DEFAULT 0 AFTER telegram_update_id',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. is_retroactive ------------------------------------------------------------
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND COLUMN_NAME = 'is_retroactive'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE duty_request ADD COLUMN is_retroactive TINYINT(1) NOT NULL DEFAULT 0 AFTER is_direct_to_home',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. submission_timing ---------------------------------------------------------
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND COLUMN_NAME = 'submission_timing'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE duty_request ADD COLUMN submission_timing ENUM(''advance'',''on_time'',''retroactive'') NULL AFTER is_retroactive',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. late_submission_reason ----------------------------------------------------
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND COLUMN_NAME = 'late_submission_reason'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE duty_request ADD COLUMN late_submission_reason VARCHAR(500) NULL AFTER submission_timing',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. is_waived_by_gm -----------------------------------------------------------
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND COLUMN_NAME = 'is_waived_by_gm'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE duty_request ADD COLUMN is_waived_by_gm TINYINT(1) NOT NULL DEFAULT 0 AFTER late_submission_reason',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6. gm_waiver_note -----------------------------------------------------------
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND COLUMN_NAME = 'gm_waiver_note'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE duty_request ADD COLUMN gm_waiver_note VARCHAR(500) NULL AFTER is_waived_by_gm',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 7. gm_waiver_date -----------------------------------------------------------
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND COLUMN_NAME = 'gm_waiver_date'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE duty_request ADD COLUMN gm_waiver_date DATETIME(3) NULL AFTER gm_waiver_note',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Supporting indexes -----------------------------------------------------------
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND INDEX_NAME = 'idx_req_retroactive'
);
SET @ddl := IF(@has_idx = 0,
  'ALTER TABLE duty_request ADD KEY idx_req_retroactive (is_retroactive)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'duty_request'
    AND INDEX_NAME = 'idx_req_waived'
);
SET @ddl := IF(@has_idx = 0,
  'ALTER TABLE duty_request ADD KEY idx_req_waived (is_waived_by_gm)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Opt-in backfill of submission_timing for existing rows from duty_date vs
-- created_at. Mirrors frontend getSubmissionTiming(): future duty date =>
-- advance, duty date already past when logged => retroactive, else on_time.
--
-- Leave @backfill_existing at 0 for a schema-only run. Rows with a NULL
-- submission_timing are derived on read, so skipping this changes nothing
-- user-visible -- it only avoids writing values that were never recorded.
SET @backfill_existing := 0;

UPDATE duty_request
SET submission_timing = CASE
  WHEN DATE(duty_date) > DATE(created_at) THEN 'advance'
  WHEN DATE(duty_date) < DATE(created_at) THEN 'retroactive'
  ELSE 'on_time'
END
WHERE @backfill_existing = 1
  AND submission_timing IS NULL
  AND duty_date IS NOT NULL
  AND created_at IS NOT NULL;

-- Derive the matching boolean flag so both representations agree.
UPDATE duty_request
SET is_retroactive = 1
WHERE @backfill_existing = 1
  AND submission_timing = 'retroactive'
  AND is_retroactive = 0;

-- Verification report.
-- NOTE: on a schema-only run (@backfill_existing = 0) the timing/retroactive
-- columns below stay 0 for historical rows. That is expected, not a failure --
-- those values are derived on read by the backend. Re-run with
-- @backfill_existing := 1 to see persisted historical counts.
SELECT
  COUNT(*)                                                        AS total_requests,
  SUM(submission_timing IS NULL)                                  AS timing_derived_on_read,
  SUM(is_retroactive = 1)                                         AS retroactive,
  SUM(submission_timing = 'advance')                             AS advance,
  SUM(submission_timing = 'on_time')                              AS on_time,
  SUM(is_direct_to_home = 1)                                      AS direct_to_home,
  SUM(is_waived_by_gm = 1)                                        AS gm_waived
FROM duty_request;

-- Postflight: must return exactly 7 rows. If fewer, the script did not run to
-- completion -- scroll up the Output pane for the failing statement.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'duty_request'
  AND COLUMN_NAME IN (
    'is_direct_to_home', 'is_retroactive', 'submission_timing',
    'late_submission_reason', 'is_waived_by_gm', 'gm_waiver_note',
    'gm_waiver_date'
  )
ORDER BY ORDINAL_POSITION;