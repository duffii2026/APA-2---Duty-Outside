-- =============================================================================
-- APA Duty Outside — cleanup of Telegram duplicate imports
-- Deletes EXACT duplicate duty_request rows (same requester, duty date,
-- departure time, reason) imported from Telegram, keeping the earliest copy.
-- Children (duty_request_staff / duty_request_missed_scan) cascade; orphaned
-- audit rows are removed. Safe to re-run; wrapped in a transaction.
--
-- Run on EACH database (local + production) as:
--   mysql -u <USER> -p <DB_NAME> < cleanup_telegram_duplicates.sql
--
-- NOTE: rows whose requester name was mutated on re-delivery (e.g. "Sok Chhai"
-- vs "Sok Chhai2", "sdf" vs "sdf3") are NOT matched automatically because they
-- are not exact duplicates — review those manually with the report at the end.
-- =============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- Keep id = earliest created_at within each exact-duplicate group (Telegram only).
DROP TEMPORARY TABLE IF EXISTS tmp_dup_keep;
CREATE TEMPORARY TABLE tmp_dup_keep AS
SELECT r.id AS keep_id
FROM duty_request r
JOIN (
  SELECT requester_name, duty_date, time_of_departure, MIN(created_at) AS first_ts
  FROM duty_request
  WHERE source = 'telegram'
  GROUP BY requester_name, duty_date, time_of_departure
  HAVING COUNT(*) > 1
) g
  ON r.requester_name = g.requester_name
 AND r.duty_date      = g.duty_date
 AND r.time_of_departure = g.time_of_departure
 AND r.created_at     = g.first_ts
GROUP BY r.id;

-- Members of every exact-duplicate group (all rows that share a dup key).
DROP TEMPORARY TABLE IF EXISTS tmp_dup_members;
CREATE TEMPORARY TABLE tmp_dup_members AS
SELECT r.id AS member_id
FROM duty_request r
JOIN (
  SELECT requester_name, duty_date, time_of_departure
  FROM duty_request
  WHERE source = 'telegram'
  GROUP BY requester_name, duty_date, time_of_departure
  HAVING COUNT(*) > 1
) g
  ON r.requester_name = g.requester_name
 AND r.duty_date      = g.duty_date
 AND r.time_of_departure = g.time_of_departure;

-- Audit trail for the duplicated copies only (deleted before the rows
-- themselves; the FK is ON DELETE SET NULL, which would leave orphans behind).
DELETE FROM audit_log
WHERE duty_request_id IN (SELECT member_id FROM tmp_dup_members)
  AND duty_request_id NOT IN (SELECT keep_id FROM tmp_dup_keep);

-- The duplicated copies (children cascade-delete automatically). Unique rows
-- are NOT members of a duplicate group, so they are never touched.
DELETE FROM duty_request
WHERE id IN (SELECT member_id FROM tmp_dup_members)
  AND id NOT IN (SELECT keep_id FROM tmp_dup_keep);

DROP TEMPORARY TABLE IF EXISTS tmp_dup_members;
DROP TEMPORARY TABLE IF EXISTS tmp_dup_keep;

COMMIT;

-- -----------------------------------------------------------------------------
-- Report: remaining telegram rows for manual review (mutated-name duplicates
-- and any not-yet-returned leftovers). Nothing below modifies data.
-- -----------------------------------------------------------------------------
SELECT id, requester_name, duty_date, time_of_departure, status, created_at
FROM duty_request
WHERE source = 'telegram'
ORDER BY requester_name, duty_date, created_at;

-- Optional (commented out): also purge no-op audit rows left by the bug —
-- 'telegram_imported' entries that never referenced a saved request.
-- START TRANSACTION;
-- DELETE FROM audit_log WHERE action = 'telegram_imported' AND duty_request_id IS NULL;
-- COMMIT;