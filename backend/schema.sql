-- =============================================================================
-- APA Duty Outside Request System — Database Schema (MySQL / MariaDB)
-- Import this file into your MySQL/MariaDB server:
--   mysql -u <USER> -p <DB_NAME> < schema.sql
-- All tables use InnoDB + utf8mb4 to fully support Khmer / memo text.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET time_zone = '+00:00';

-- =============================================================================
-- 1. LOOKUP TABLES (seeded reference data)
-- =============================================================================

DROP TABLE IF EXISTS department;
CREATE TABLE department (
  id        INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  name      VARCHAR(100)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_department_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO department (id, name) VALUES
  (1, 'Executive Management'),
  (2, 'Finance & Accounts'),
  (3, 'HR & Admin'),
  (4, 'Business Development'),
  (5, 'Finance & Procurement'),
  (6, 'Legal & Compliance'),
  (7, 'IT Support'),
  (8, 'Treasury Support')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS staff;
CREATE TABLE staff (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name         VARCHAR(120)    NOT NULL,
  position_snapshot VARCHAR(120)    NULL,
  department_id     INT UNSIGNED    NULL,
  telegram_user_id  VARCHAR(64)     NULL,
  is_active         TINYINT(1)      NOT NULL DEFAULT 1,
  created_at        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_full_name (full_name),
  KEY idx_staff_dept (department_id),
  CONSTRAINT fk_staff_department FOREIGN KEY (department_id) REFERENCES department(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO staff (id, full_name, position_snapshot, department_id) VALUES
  (1, 'Mr. Shawn', 'General Manager', 1)
ON DUPLICATE KEY UPDATE position_snapshot = VALUES(position_snapshot);

-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS app_user;
CREATE TABLE app_user (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)     NOT NULL,
  display_name  VARCHAR(120)    NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  password_encrypted TEXT      NULL,
  role          ENUM('admin','manager','hr','staff') NOT NULL DEFAULT 'staff',
  staff_id      BIGINT UNSIGNED NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_user_username (username),
  KEY idx_app_user_staff (staff_id),
  CONSTRAINT fk_app_user_staff FOREIGN KEY (staff_id) REFERENCES staff(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default passcode for all seeded managers: apex2026 (scrypt hashed)
-- Format: scrypt$<salt hex>$<hash hex>  (verified with Node built-in crypto)
INSERT INTO app_user (username, display_name, password_hash, role, staff_id) VALUES
  ('shawn',       'Mr. Shawn (General Manager)', 'scrypt$2d8af3b57c5cce9fa7c1456b84ca80a8$d4defb86f78098ee53dc796aab21a0e6357355633d1b53b5a17bd32e5a5929e4dbb0448403d67a6f69e3c57c3ecbaed0912fe86cd232ec79a5c6191ae540d625', 'admin', 1),
  ('admin',       'Mr. Shawn (General Manager)', 'scrypt$7fa1d4f957c6562de591b20fa263f432$4a28dc405579382f382715b73a1aa0aa0abacc4da5bbe20aca416b213429698dd9f5afdf4cfc21ca6426d123d45181c0f0dcfef75d3d17b673e02ad9a4928d13', 'admin', 1),
  ('gm@apex.com', 'Mr. Shawn (General Manager)', 'scrypt$2d8af3b57c5cce9fa7c1456b84ca80a8$d4defb86f78098ee53dc796aab21a0e6357355633d1b53b5a17bd32e5a5929e4dbb0448403d67a6f69e3c57c3ecbaed0912fe86cd232ec79a5c6191ae540d625', 'admin', 1)
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);

-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS app_session;
CREATE TABLE app_session (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash   CHAR(64)        NOT NULL,   -- SHA-256 of the bearer token (raw token never stored)
  app_user_id  BIGINT UNSIGNED NOT NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME(3)     NOT NULL,
  last_seen_at DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_token (token_hash),
  KEY idx_session_user (app_user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (app_user_id) REFERENCES app_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS duty_reason;
CREATE TABLE duty_reason (
  id          VARCHAR(20)  NOT NULL,          -- bank | gdt | meet_gdt | cfo_tasks | other
  label       VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO duty_reason (id, label, description, sort_order) VALUES
  ('bank',       'Go to bank',     'Cheque deposits, cash transactions, bank statements, withdrawals', 1),
  ('gdt',        'Go to GDT',      'General Department of Taxation submission, document drop-off, stamps', 2),
  ('meet_gdt',   'Go to meet GDT', 'Official meeting, tax audit discussion, clarification with GDT tax officers', 3),
  ('cfo_tasks',  'Doing CFO tasks','Executive financial errands, urgent approvals, document signings', 4),
  ('other',      'Other',          'Specify other custom duty purpose not listed above', 5)
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS fingerprint_scan;
CREATE TABLE fingerprint_scan (
  id                VARCHAR(20)  NOT NULL,   -- morning_in | lunch_out | lunch_in | evening_out
  label             VARCHAR(120) NOT NULL,
  time_window_start TIME         NULL,
  time_window_end   TIME         NULL,
  display_window    VARCHAR(40)  NULL,
  description       VARCHAR(255) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO fingerprint_scan (id, label, time_window_start, time_window_end, display_window, description) VALUES
  ('morning_in',  'Morning In (Check-In)', '08:00:00', '08:30:00', '08:00 – 08:30', 'Standard office morning entry scan'),
  ('lunch_out',   'Lunch Out (Check-Out)', '12:00:00', '12:30:00', '12:00 – 12:30', 'Midday departure scan'),
  ('lunch_in',    'Lunch In (Check-In)',   '13:00:00', '13:30:00', '13:00 – 13:30', 'Midday return scan'),
  ('evening_out', 'Evening Out (Check-Out)','17:00:00', '17:30:00', '17:00 – 17:30', 'End of work day departure scan')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- =============================================================================
-- 2. CORE TABLE — duty_request  (maps to TS interface DutyOutsideRequest)
-- =============================================================================

DROP TABLE IF EXISTS duty_request;
CREATE TABLE duty_request (
  id                   VARCHAR(20)                        NOT NULL,   -- e.g. DOR-2026-0042
  requester_name       VARCHAR(120)                       NOT NULL,   -- snapshot (Telegram names allowed)
  requester_staff_id   BIGINT UNSIGNED                    NULL,
  position             VARCHAR(120)                       NOT NULL,   -- snapshot
  department           VARCHAR(120)                       NULL,       -- snapshot
  department_id        INT UNSIGNED                       NULL,
  reason_text          VARCHAR(500)                       NOT NULL,
  reason_category      VARCHAR(20)                        NOT NULL DEFAULT 'other',
  destination          VARCHAR(255)                       NULL,
  other_teams          VARCHAR(255)                       NULL,
  duty_date            DATE                               NOT NULL,
  time_of_departure    TIME                               NOT NULL,
  time_of_return       TIME                               NULL,
  is_return_pending    TINYINT(1)                         NOT NULL DEFAULT 1,
  status               ENUM('active','returned','incomplete') NOT NULL DEFAULT 'active',
  approved_by          VARCHAR(120)                       NOT NULL,   -- snapshot
  approved_by_staff_id BIGINT UNSIGNED                    NULL,
  return_notes         VARCHAR(500)                       NULL,
  source               ENUM('web','telegram','public')    NOT NULL DEFAULT 'web',
  telegram_update_id   BIGINT                             NULL,   -- Telegram update_id that imported this row (dedup)
  is_direct_to_home    TINYINT(1)                         NOT NULL DEFAULT 0,  -- afternoon duty ends the workday; 17:00 checkout excused
  is_retroactive       TINYINT(1)                         NOT NULL DEFAULT 0,  -- logged after the duty already started
  submission_timing    ENUM('advance','on_time','retroactive') NULL,           -- derived from duty_date vs created_at
  late_submission_reason VARCHAR(500)                     NULL,   -- written justification for a retroactive entry
  is_waived_by_gm      TINYINT(1)                         NOT NULL DEFAULT 0,  -- GM executive strike waiver applied
  gm_waiver_note       VARCHAR(500)                       NULL,   -- recorded waiver justification
  gm_waiver_date       DATETIME(3)                        NULL,   -- when the waiver was applied
  created_at           DATETIME(3)                        NOT NULL,
  updated_at           DATETIME(3)                        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_req_telegram_update (telegram_update_id),
  KEY idx_req_date (duty_date),
  KEY idx_req_status (status),
  KEY idx_req_reason_cat (reason_category),
  KEY idx_req_retroactive (is_retroactive),
  KEY idx_req_waived (is_waived_by_gm),
  KEY idx_req_requester (requester_staff_id),
  KEY idx_req_dept (department_id),
  KEY idx_req_approver (approved_by_staff_id),
  CONSTRAINT fk_req_requester FOREIGN KEY (requester_staff_id) REFERENCES staff(id),
  CONSTRAINT fk_req_department FOREIGN KEY (department_id) REFERENCES department(id),
  CONSTRAINT fk_req_reason FOREIGN KEY (reason_category) REFERENCES duty_reason(id),
  CONSTRAINT fk_req_approver FOREIGN KEY (approved_by_staff_id) REFERENCES staff(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- employeesOnDuty: one row per staff member on the duty (array -> join table)
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS duty_request_staff;
CREATE TABLE duty_request_staff (
  duty_request_id VARCHAR(20)   NOT NULL,
  pos             INT           NOT NULL DEFAULT 0,   -- preserves array ordering
  staff_id        BIGINT UNSIGNED NULL,
  staff_name      VARCHAR(120)  NOT NULL,             -- snapshot (Telegram names allowed)
  PRIMARY KEY (duty_request_id, staff_name),
  KEY idx_drs_staff (staff_id),
  CONSTRAINT fk_drs_request FOREIGN KEY (duty_request_id) REFERENCES duty_request(id) ON DELETE CASCADE,
  CONSTRAINT fk_drs_staff FOREIGN KEY (staff_id) REFERENCES staff(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- missedFingerprintScans: one row per scan label (array -> join table)
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS duty_request_missed_scan;
CREATE TABLE duty_request_missed_scan (
  duty_request_id    VARCHAR(20)   NOT NULL,
  pos                INT           NOT NULL DEFAULT 0,
  fingerprint_scan_id VARCHAR(20)  NULL,
  scan_label         VARCHAR(160)  NOT NULL,          -- snapshot (custom labels allowed)
  PRIMARY KEY (duty_request_id, scan_label),
  KEY idx_drms_scan (fingerprint_scan_id),
  CONSTRAINT fk_drms_request FOREIGN KEY (duty_request_id) REFERENCES duty_request(id) ON DELETE CASCADE,
  CONSTRAINT fk_drms_fp_scan FOREIGN KEY (fingerprint_scan_id) REFERENCES fingerprint_scan(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 3. TELEGRAM (config snapshot + poller sync state — owned by the Node backend)
-- =============================================================================

DROP TABLE IF EXISTS telegram_config;
CREATE TABLE telegram_config (
  id             TINYINT UNSIGNED NOT NULL DEFAULT 1,   -- singleton row
  bot_token      VARCHAR(255)     NULL,
  bot_username   VARCHAR(120)     NULL,
  bot_display_name VARCHAR(120)   NULL,
  group_chat_id  VARCHAR(64)      NULL,
  group_title    VARCHAR(120)     NULL,
  shawn_chat_id  VARCHAR(64)      NULL,
  is_connected   TINYINT(1)       NOT NULL DEFAULT 0,
  auto_sync      TINYINT(1)       NOT NULL DEFAULT 1,
  last_checked_at DATETIME(3)     NULL,
  updated_at     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO telegram_config (id, bot_token, bot_username, bot_display_name, group_chat_id, group_title, shawn_chat_id, is_connected, auto_sync)
VALUES (1, NULL, '', '', '', '', '', 0, 1)
ON DUPLICATE KEY UPDATE id = id;

-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS telegram_sync_state;
CREATE TABLE telegram_sync_state (
  id             TINYINT UNSIGNED NOT NULL DEFAULT 1,   -- singleton row
  last_update_id BIGINT           NOT NULL DEFAULT 0,
  updated_at     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO telegram_sync_state (id, last_update_id) VALUES (1, 0)
ON DUPLICATE KEY UPDATE id = id;

-- -----------------------------------------------------------------------------
-- Every Telegram update already handled by the poller (returns, malformed,
-- help, etc.). Keyed per chat: each chat records that a reply was already sent
-- for an update, so a re-delivered update can never reply/write again in ONE
-- chat, and each chat is independently 100% safe from duplicates.
-- The duty_request.telegram_update_id unique key covers duty imports globally.
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS telegram_processed_update;
CREATE TABLE telegram_processed_update (
  update_id  BIGINT         NOT NULL,
  chat_id    VARCHAR(64)    NOT NULL DEFAULT '',   -- chat that already received the reply
  kind       VARCHAR(20)    NOT NULL DEFAULT 'other',  -- duty | return | malformed | help | duplicate
  created_at DATETIME(3)    NOT NULL,
  PRIMARY KEY (update_id, chat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Known chats the bot is a member of (discovered via getUpdates/poller). Used by
-- the UI to list joinable groups when verifying the bot token.
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS telegram_known_chat;
CREATE TABLE telegram_known_chat (
  bot_id        VARCHAR(32)      NOT NULL,
  chat_id       BIGINT           NOT NULL,
  title         VARCHAR(255)     NULL,
  username      VARCHAR(255)     NULL,
  chat_type     VARCHAR(16)      NOT NULL DEFAULT 'supergroup',
  last_seen_at  DATETIME(3)      NOT NULL,
  PRIMARY KEY (bot_id, chat_id),
  KEY idx_telegram_known_chat_type (chat_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 4. AUDIT LOG (who did what, from web or telegram channel)
-- =============================================================================

DROP TABLE IF EXISTS audit_log;
CREATE TABLE audit_log (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  duty_request_id VARCHAR(20)     NULL,
  action          VARCHAR(40)     NOT NULL,   -- created | return_confirmed | updated | telegram_imported
  actor           VARCHAR(120)    NULL,
  source          ENUM('web','telegram','public') NOT NULL DEFAULT 'web',
  details         JSON            NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_request (duty_request_id),
  CONSTRAINT fk_audit_request FOREIGN KEY (duty_request_id) REFERENCES duty_request(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 5. VIEW — fingerprint reconciliation (request x employee x missed scan)
-- =============================================================================

DROP VIEW IF EXISTS v_fingerprint_reconciliation;
CREATE VIEW v_fingerprint_reconciliation AS
SELECT
  r.id                    AS request_id,
  r.duty_date             AS duty_date,
  drs.staff_name          AS employee_name,
  s.scan_label            AS missed_scan,
  s.fingerprint_scan_id   AS scan_type_id,
  r.reason_text           AS duty_purpose,
  r.destination           AS destination,
  DATE_FORMAT(r.time_of_departure, '%H:%i') AS departure_time,
  DATE_FORMAT(r.time_of_return, '%H:%i')    AS return_time,
  r.approved_by           AS approved_by
FROM duty_request r
JOIN duty_request_staff drs        ON drs.duty_request_id = r.id
JOIN duty_request_missed_scan s   ON s.duty_request_id = r.id;

SET FOREIGN_KEY_CHECKS = 1;
