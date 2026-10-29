const pool = require("./db");
const { normalizeTimeStr, detectDutyCategory } = require("./utils");

// =============================================================================
// Helpers (connection-scoped so they work inside transactions)
// =============================================================================

const STANDARD_SCAN_PREFIXES = [
  { id: "morning_in", prefix: "morning in" },
  { id: "lunch_out", prefix: "lunch out" },
  { id: "lunch_in", prefix: "lunch in" },
  { id: "evening_out", prefix: "evening out" },
];

function cleanName(name) {
  return String(name || "").trim();
}

async function ensureDepartmentTx(conn, name) {
  const n = cleanName(name);
  if (!n) return null;
  const [rows] = await conn.query("SELECT id FROM department WHERE name = ?", [n]);
  if (rows.length) return rows[0].id;
  const [res] = await conn.query("INSERT INTO department (name) VALUES (?)", [n]);
  return res.insertId;
}

async function ensureStaffTx(conn, fullName, position, department) {
  const name = cleanName(fullName);
  if (!name) return null;
  const [rows] = await conn.query("SELECT id, position_snapshot, department_id FROM staff WHERE LOWER(full_name) = LOWER(?)", [name]);
  if (rows.length) {
    const existing = rows[0];
    const deptId = department
      ? (await ensureDepartmentTx(conn, department))
      : existing.department_id;
    if ((position && position !== existing.position_snapshot) || (deptId !== null && Number(deptId) !== Number(existing.department_id))) {
      await conn.query(
        "UPDATE staff SET position_snapshot = COALESCE(?, position_snapshot), department_id = COALESCE(?, department_id) WHERE id = ?",
        [position || null, deptId, existing.id]
      );
    }
    return existing.id;
  }
  const deptId = department ? await ensureDepartmentTx(conn, department) : null;
  const [res] = await conn.query(
    "INSERT INTO staff (full_name, position_snapshot, department_id) VALUES (?, ?, ?)",
    [name, position || null, deptId]
  );
  return res.insertId;
}

// -----------------------------------------------------------------------------
// Conversion helpers (DB row -> TS-shaped DTO)
// -----------------------------------------------------------------------------

function toISO(dtStr) {
  if (!dtStr) return null;
  let t = String(dtStr).replace(" ", "T");
  if (!t.endsWith("Z")) t += "Z";
  return t;
}

function toTime(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

// Accepts an ISO string ("2026-09-02T10:15:00.000Z"), a MySQL datetime string,
// or a Date, and returns the "YYYY-MM-DD HH:MM:SS.mmm" form mysql2 expects for
// DATETIME(3) columns. Returns null for anything unparseable so callers can
// store NULL rather than an invalid zero date.
function toSqlDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 23).replace("T", " ");
  }
  const raw = String(value).trim();
  // Already a MySQL datetime.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
    return raw.length > 19 ? raw.slice(0, 23) : raw.slice(0, 19);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 23).replace("T", " ");
}

const REQUEST_COLUMNS = `
  id, requester_name, position, department, reason_text, destination,
  other_teams, duty_date, time_of_departure, time_of_return,
  is_return_pending, status, approved_by, return_notes, source,
  telegram_update_id, created_at, updated_at,
  is_direct_to_home, is_retroactive, submission_timing,
  late_submission_reason, is_waived_by_gm, gm_waiver_note, gm_waiver_date
`;

// APA-MEMO_09-2026_05 compliance derivation. The stored column wins; otherwise
// derive from duty_date vs created_at so legacy rows still classify correctly.
function deriveSubmissionTiming(row) {
  if (row.submission_timing) return row.submission_timing;
  const duty = String(row.duty_date || "").slice(0, 10);
  const created = String(row.created_at || "").slice(0, 10);
  if (duty && created) {
    if (duty > created) return "advance";
    if (duty < created) return "retroactive";
  }
  return "on_time";
}

function rowToDto(row, staff, scans) {
  const timing = deriveSubmissionTiming(row);
  return {
    id: row.id,
    requesterName: row.requester_name,
    employeesOnDuty: staff,
    position: row.position,
    department: row.department || "",
    reasonOrPurpose: row.reason_text,
    destination: row.destination || "",
    otherTeamsInvolved: row.other_teams || "",
    date: row.duty_date,
    timeOfDeparture: toTime(row.time_of_departure),
    timeOfReturn: toTime(row.time_of_return),
    isReturnPending: !!row.is_return_pending,
    missedFingerprintScans: scans,
    approvedBy: row.approved_by,
    status: row.status,
    returnNotes: row.return_notes || "",
    source: row.source,
    telegramUpdateId: row.telegram_update_id || null,
    createdAt: toISO(row.created_at),
    updatedAt: toISO(row.updated_at),
    isDirectToHome: !!row.is_direct_to_home,
    isRetroactive: !!row.is_retroactive || timing === "retroactive",
    submissionTiming: timing,
    lateSubmissionReason: row.late_submission_reason || "",
    isWaivedByGM: !!row.is_waived_by_gm,
    gmWaiverNote: row.gm_waiver_note || "",
    gmWaiverDate: toISO(row.gm_waiver_date),
  };
}

async function hydrate(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const staffMap = {};
  const scanMap = {};

  const [staffRows] = await pool.query(
    "SELECT duty_request_id, staff_name FROM duty_request_staff WHERE duty_request_id IN (?) ORDER BY duty_request_id, pos",
    [ids]
  );
  const [scanRows] = await pool.query(
    "SELECT duty_request_id, scan_label FROM duty_request_missed_scan WHERE duty_request_id IN (?) ORDER BY duty_request_id, pos",
    [ids]
  );

  for (const r of staffRows) (staffMap[r.duty_request_id] = staffMap[r.duty_request_id] || []).push(r.staff_name);
  for (const r of scanRows) (scanMap[r.duty_request_id] = scanMap[r.duty_request_id] || []).push(r.scan_label);

  return rows.map((row) => rowToDto(row, staffMap[row.id] || [], scanMap[row.id] || []));
}

// =============================================================================
// Request repository
// =============================================================================

async function listRequests(filters = {}) {
  const where = [];
  const params = [];
  if (filters.month) {
    where.push("DATE_FORMAT(duty_date, '%Y-%m') = ?");
    params.push(filters.month);
  }
  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT ${REQUEST_COLUMNS} FROM duty_request ${whereSql}
     ORDER BY duty_date ASC, time_of_departure ASC, created_at ASC LIMIT 2000`,
    params
  );
  return hydrate(rows);
}

// Staff portal history is scoped to the signed-in user's identity. Keep this
// separate from listRequests so the public executive register remains the only
// caller of the unscoped query.
async function listRequestsForUser(staffId, requesterName) {
  const name = cleanName(requesterName);
  const numericStaffId = staffId != null && Number.isFinite(Number(staffId)) ? Number(staffId) : null;
  if (!name && numericStaffId == null) return [];
  const [rows] = await pool.query(
    `SELECT ${REQUEST_COLUMNS} FROM duty_request
     WHERE ${numericStaffId == null ? "LOWER(requester_name) = LOWER(?)" : "requester_staff_id = ? OR LOWER(requester_name) = LOWER(?)"}
     ORDER BY duty_date DESC, time_of_departure DESC, created_at DESC LIMIT 100`,
    numericStaffId == null ? [name] : [numericStaffId, name]
  );
  return hydrate(rows);
}

async function getRequestById(id) {
  const [rows] = await pool.query(`SELECT ${REQUEST_COLUMNS} FROM duty_request WHERE id = ?`, [id]);
  if (!rows.length) return null;
  const hydrated = await hydrate(rows);
  return hydrated[0];
}

async function findDuplicateByTelegram(requesterName, departureTime, dutyDate) {
  const dep = normalizeTimeStr(departureTime);
  const [rows] = await pool.query(
    "SELECT id FROM duty_request WHERE requester_name = ? AND time_of_departure = ? AND duty_date = ? LIMIT 1",
    [cleanName(requesterName), dep, dutyDate]
  );
  return rows.length ? rows[0].id : null;
}

async function findActiveRequestByRequester(requesterName, date) {
  const name = cleanName(requesterName);
  if (!name) return null;
  const [rows] = await pool.query(
    `SELECT ${REQUEST_COLUMNS} FROM duty_request
     WHERE status = 'active' AND LOWER(requester_name) = LOWER(?)
     ORDER BY created_at DESC LIMIT 1`,
    [name]
  );
  if (!rows.length) return null;
  const hydrated = await hydrate(rows);
  return hydrated[0];
}

// Whether duty_request.source has been widened to include 'public' by
// migrate_public_staff_source.sql. Cached after the first lookup.
let publicSourceSupported = null;

async function supportsPublicSource(conn) {
  if (publicSourceSupported !== null) return publicSourceSupported;
  try {
    const [rows] = await conn.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'duty_request'
          AND COLUMN_NAME = 'source'`
    );
    publicSourceSupported = !!(
      rows[0] && String(rows[0].COLUMN_TYPE || "").includes("'public'")
    );
  } catch {
    publicSourceSupported = false;
  }
  if (!publicSourceSupported) {
    // Without the migration MySQL rejects 'public' outright ("Data truncated for
    // column 'source'"), which would fail the whole submission. Degrade to 'web'
    // so staff can still file, and say so loudly rather than failing silently.
    console.warn(
      "[source] duty_request.source does not accept 'public' yet — run backend/migrate_public_staff_source.sql. Public tab requests will be recorded as 'web' until then."
    );
  }
  return publicSourceSupported;
}

async function createRequest(req, { source = "web", actor = null, telegramUpdateId = null } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

// APA-MEMO_09-2026_05: Direct to Home is a sanctioned auto-close. The
// 17:00 end of the workday is the effective close, so the duty
// is complete at creation — not awaiting a return confirmation.
const isDirectToHome = req.isDirectToHome === true;
const isReturnPending = isDirectToHome ? false : !!req.isReturnPending;
const dep = normalizeTimeStr(req.timeOfDeparture) || "09:00";
const ret = isDirectToHome ? "17:00" : isReturnPending ? null : normalizeTimeStr(req.timeOfReturn);
    const now = new Date();
    const isoNow = now.toISOString().slice(0, 23).replace("T", " "); // YYYY-MM-DD HH:MM:SS.mmm
    const requesterId = await ensureStaffTx(conn, req.requesterName, req.position, req.department);
    const approverId = req.approvedBy ? await ensureStaffTx(conn, req.approvedBy, null, null) : null;
    const deptId = req.department ? await ensureDepartmentTx(conn, req.department) : null;
    const category = detectDutyCategory(req.reasonOrPurpose);
    // A newly created request is active by default — one is normally closed
    // only by an explicit return confirmation (updateReturn). Line-8 return
    // text in a Telegram request is an expected return note, never an
    // auto-confirmation. Direct to Home is the single sanctioned exception and
    // completes the duty at creation, matching V2.
    const status = isDirectToHome ? "returned" : req.status || "active";
    // "public" marks a record filed through the no-login staff tab, so the
// register can distinguish it from a portal/Telegram submission for review.
// Falls back to "web" while the enum migration is still pending.
const finalSource =
  source === "telegram"
    ? "telegram"
    : source === "public"
      ? (await supportsPublicSource(conn) ? "public" : "web")
      : "web";

    // APA-MEMO_09-2026_05 compliance fields. An explicit submissionTiming from
    // the caller wins; otherwise derive it from the duty date vs the log date.
    const dutyDay = String(req.date || "").slice(0, 10);
    const logDay = isoNow.slice(0, 10);
    let timing = req.submissionTiming;
    if (timing !== "advance" && timing !== "retroactive" && timing !== "on_time") {
      if (dutyDay && logDay) {
        if (dutyDay > logDay) timing = "advance";
        else if (dutyDay < logDay) timing = "retroactive";
        else timing = "on_time";
      } else {
        timing = "on_time";
      }
    }
    const isRetroactive = req.isRetroactive === true || timing === "retroactive" ? 1 : 0;
    const directToHomeFlag = isDirectToHome ? 1 : 0;
    const lateReason = cleanName(req.lateSubmissionReason || "") || null;
    const waiverNote = cleanName(req.gmWaiverNote || "") || null;
    const waiverDate = req.gmWaiverDate ? toSqlDateTime(req.gmWaiverDate) : null;

    await conn.query(
      `INSERT INTO duty_request
        (id, requester_name, requester_staff_id, position, department, department_id,
         reason_text, reason_category, destination, other_teams, duty_date,
         time_of_departure, time_of_return, is_return_pending, status,
         approved_by, approved_by_staff_id, return_notes, source, telegram_update_id,
         is_direct_to_home, is_retroactive, submission_timing, late_submission_reason,
         is_waived_by_gm, gm_waiver_note, gm_waiver_date,
         created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.id, cleanName(req.requesterName), requesterId, cleanName(req.position || "Staff"),
        req.department || null, deptId, cleanName(req.reasonOrPurpose || ""), category,
        req.destination || null, req.otherTeamsInvolved || null, req.date, dep, ret,
        isReturnPending ? 1 : 0, status, cleanName(req.approvedBy || "Mr. Shawn (General Manager)"),
        approverId, req.returnNotes || null, finalSource,
        telegramUpdateId ? Number(telegramUpdateId) : null,
        directToHomeFlag, isRetroactive, timing, lateReason,
        req.isWaivedByGM ? 1 : 0, waiverNote, waiverDate,
        isoNow, isoNow,
      ]
    );

    const staffList = Array.isArray(req.employeesOnDuty) && req.employeesOnDuty.length
      ? req.employeesOnDuty
      : [req.requesterName];

    for (let i = 0; i < staffList.length; i++) {
      const sid = await ensureStaffTx(conn, staffList[i], req.position, req.department);
      await conn.query(
        "INSERT IGNORE INTO duty_request_staff (duty_request_id, pos, staff_id, staff_name) VALUES (?,?,?,?)",
        [req.id, i, sid, cleanName(staffList[i])]
      );
    }

    const scans = Array.isArray(req.missedFingerprintScans) ? req.missedFingerprintScans : [];
    for (let i = 0; i < scans.length; i++) {
      const label = cleanName(scans[i]);
      if (!label) continue;
      const match = STANDARD_SCAN_PREFIXES.find((s) => label.toLowerCase().startsWith(s.prefix));
      await conn.query(
        "INSERT IGNORE INTO duty_request_missed_scan (duty_request_id, pos, fingerprint_scan_id, scan_label) VALUES (?,?,?,?)",
        [req.id, i, match ? match.id : null, label]
      );
    }

    await conn.query(
      "INSERT INTO audit_log (duty_request_id, action, actor, source, details) VALUES (?,?,?,?,?)",
      [
        req.id,
        finalSource === "telegram" ? "telegram_imported" : finalSource === "public" ? "public_form_submitted" : "created",
        actor || req.requesterName,
        finalSource,
        JSON.stringify({ category, departure: dep }),
      ]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    // Two pollers (or one poller racing a manual sync) may try to import the
    // same Telegram update at the same time. The unique index on
    // telegram_update_id makes that second INSERT fail — treat it as an
    // already-imported update and return the existing record instead of throwing.
    if (err && err.code === "ER_DUP_ENTRY" && telegramUpdateId) {
      const existingId = await getRequestIdByTelegramUpdateId(telegramUpdateId);
      if (existingId) return getRequestById(existingId);
    }
    throw err;
  } finally {
    conn.release();
  }
  return getRequestById(req.id);
}

async function getRequestIdByTelegramUpdateId(updateId) {
  if (!updateId) return null;
  const [rows] = await pool.query(
    "SELECT id FROM duty_request WHERE telegram_update_id = ? LIMIT 1",
    [Number(updateId)]
  );
  return rows.length ? rows[0].id : null;
}

async function updateReturn(id, returnTime, notes, source = "web", actor = null, telegramUpdateId = null, chatId = null) {
  const ret = normalizeTimeStr(returnTime);
  if (!ret) throw new Error("Valid return time is required");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Guard against audit_log FK failures when the request does not exist
    // (e.g. a record that only lives in the browser cache).
    const [exists] = await conn.query("SELECT id FROM duty_request WHERE id = ?", [id]);
    if (!exists.length) {
      await conn.rollback();
      return null;
    }

    const now = new Date().toISOString().slice(0, 23).replace("T", " ");
    await conn.query(
      `UPDATE duty_request
       SET time_of_return = ?, is_return_pending = 0, status = 'returned',
           return_notes = COALESCE(?, return_notes), updated_at = ?
       WHERE id = ?`,
      [ret, notes || null, now, id]
    );
    await conn.query(
      "INSERT INTO audit_log (duty_request_id, action, actor, source, details) VALUES (?,?,?,?,?)",
      [id, "return_confirmed", actor || "system", source === "telegram" ? "telegram" : "web", JSON.stringify({ returnTime: ret, notes: notes || null })]
    );

    // Remember the source Telegram update + chat so a re-delivered (same)
    // message can never confirm the same return twice — even if the process
    // dies mid-poll — and each chat is independently marked as replied.
    if (telegramUpdateId) {
      await conn.query(
        "INSERT IGNORE INTO telegram_processed_update (update_id, chat_id, kind, created_at) VALUES (?, ?, ?, ?)",
        [Number(telegramUpdateId), chatId != null ? String(chatId) : "", "return", now]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getRequestById(id);
}

const UPDATE_FIELDS = {
  timeOfDeparture: "time_of_departure",
  timeOfReturn: "time_of_return",
  isReturnPending: "is_return_pending",
  status: "status",
  reasonOrPurpose: "reason_text",
  destination: "destination",
  otherTeamsInvolved: "other_teams",
  returnNotes: "return_notes",
  // APA-MEMO_09-2026_05 compliance fields.
  isDirectToHome: "is_direct_to_home",
  isWaivedByGM: "is_waived_by_gm",
  gmWaiverNote: "gm_waiver_note",
  gmWaiverDate: "gm_waiver_date",
  submissionTiming: "submission_timing",
  isRetroactive: "is_retroactive",
  lateSubmissionReason: "late_submission_reason",
};

// TINYINT(1) columns that must never be written as the string "true"/"false".
const BOOLEAN_UPDATE_FIELDS = new Set([
  "isReturnPending",
  "isDirectToHome",
  "isWaivedByGM",
  "isRetroactive",
]);

const VALID_SUBMISSION_TIMINGS = new Set(["advance", "on_time", "retroactive"]);

async function updateRequest(id, patch = {}) {
  const sets = [];
  const params = [];
  const now = new Date().toISOString().slice(0, 23).replace("T", " ");
  // A GM waiver and a retroactive flag must stay mutually consistent no matter
  // which one the caller sends — the frontend only ever sends the waiver.
  const setsOnce = new Set();

  for (const [key, col] of Object.entries(UPDATE_FIELDS)) {
    if (patch[key] === undefined) continue;

    if (key === "timeOfDeparture" || key === "timeOfReturn") {
      sets.push(`${col} = ?`);
      params.push(patch[key] ? normalizeTimeStr(patch[key]) : null);
    } else if (key === "isReturnPending") {
      sets.push(`${col} = ?`);
      params.push(patch[key] ? 1 : 0);
      if (patch[key] === true) sets.push("time_of_return = NULL");
    } else if (key === "status") {
      if (patch[key] === "returned") sets.push("time_of_return = COALESCE(time_of_return, ?)");
      params.push(patch[key]);
    } else if (BOOLEAN_UPDATE_FIELDS.has(key)) {
      // Accept truthy/falsy loosely (JSON bodies may send 0/1/"true") but always
      // bind a real 0/1 so TINYINT(1) never receives a string.
      sets.push(`${col} = ?`);
      const v = patch[key];
      const truthy = v === true || v === 1 || v === "1" ||
        (typeof v === "string" && ["true", "yes", "y"].includes(v.toLowerCase()));
      params.push(truthy ? 1 : 0);
    } else if (key === "gmWaiverDate") {
      sets.push(`${col} = ?`);
      params.push(toSqlDateTime(patch[key]));
    } else if (key === "submissionTiming") {
      const v = patch[key];
      if (v === null || v === "") {
        sets.push(`${col} = NULL`);
      } else if (VALID_SUBMISSION_TIMINGS.has(v)) {
        sets.push(`${col} = ?`);
        params.push(v);
        if (v === "retroactive") {
          if (!setsOnce.has("isRetroactive") && patch.isRetroactive === undefined) {
            sets.push("is_retroactive = 1");
            setsOnce.add("isRetroactive");
          }
        }
      }
      // An invalid enum value is ignored rather than throwing — a malformed
      // client patch must not be able to 500 the whole request.
    } else {
      sets.push(`${col} = ?`);
      params.push(String(patch[key] ?? ""));
    }
  }

  if (!sets.length) return getRequestById(id);
  sets.push("updated_at = ?");
  params.push(now, id);

  await pool.query(`UPDATE duty_request SET ${sets.join(", ")} WHERE id = ?`, params);
  return getRequestById(id);
}

async function deleteRequest(id) {
  const [res] = await pool.query("DELETE FROM duty_request WHERE id = ?", [id]);
  return res.affectedRows > 0;
}

async function deleteAllRequests() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM audit_log WHERE duty_request_id IS NOT NULL");
    await conn.query("DELETE FROM duty_request_missed_scan");
    await conn.query("DELETE FROM duty_request_staff");
    await conn.query("DELETE FROM duty_request");
    await conn.query("ALTER TABLE duty_request AUTO_INCREMENT = 1");
    await conn.query("ALTER TABLE audit_log AUTO_INCREMENT = 1");
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Find the most likely active request a return message refers to.
// Prefers an explicit id, then a name match among active (return-pending) requests.
async function findTargetForTelegramReturn(reqId, senderName) {
  if (reqId) {
    const row = await getRequestById(reqId);
    if (row && row.status === "active") return row;
    if (row) return null; // exists but already returned -> do not re-apply
    return null;
  }
  const [rows] = await pool.query(
    `SELECT ${REQUEST_COLUMNS} FROM duty_request
     WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`
  );
  const hydrated = await hydrate(rows);
  const name = cleanName(senderName).toLowerCase();

  const direct = hydrated.find((r) => r.requesterName.toLowerCase() === name);
  if (direct) return direct;

  const inDuty = hydrated.find((r) =>
    (r.employeesOnDuty || []).some((e) => cleanName(e).toLowerCase() === name)
  );
  if (inDuty) return inDuty;

  const recent = hydrated.find((r) => !r.timeOfReturn && r.date <= new Date().toISOString().split("T")[0]);
  return recent || null;
}

// =============================================================================
// Telegram config repository
// =============================================================================

async function getTelegramConfig() {
  const [rows] = await pool.query("SELECT * FROM telegram_config WHERE id = 1");
  if (!rows.length) {
    return { botToken: "", botUsername: "", botDisplayName: "", groupChatId: "", groupTitle: "", shawnChatId: "", isConnected: false, autoSync: true, lastCheckedAt: null };
  }
  const r = rows[0];
  return {
    botToken: r.bot_token || "",
    botUsername: r.bot_username || "",
    botDisplayName: r.bot_display_name || "",
    groupChatId: r.group_chat_id || "",
    groupTitle: r.group_title || "",
    shawnChatId: r.shawn_chat_id || "",
    isConnected: !!r.is_connected,
    autoSync: !!r.auto_sync,
    lastCheckedAt: toISO(r.last_checked_at),
  };
}

async function saveTelegramConfig(config) {
  await pool.query(
    `INSERT INTO telegram_config
      (id, bot_token, bot_username, bot_display_name, group_chat_id, group_title, shawn_chat_id, is_connected, auto_sync, last_checked_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      bot_token = VALUES(bot_token), bot_username = VALUES(bot_username),
      bot_display_name = VALUES(bot_display_name), group_chat_id = VALUES(group_chat_id),
      group_title = VALUES(group_title), shawn_chat_id = VALUES(shawn_chat_id),
      is_connected = VALUES(is_connected), auto_sync = VALUES(auto_sync),
      last_checked_at = VALUES(last_checked_at)`,
    [
      config.botToken || null,
      config.botUsername || "",
      config.botDisplayName || "",
      config.groupChatId || "",
      config.groupTitle || "",
      config.shawnChatId || "",
      config.isConnected ? 1 : 0,
      config.autoSync !== false ? 1 : 0,
      new Date().toISOString().slice(0, 23).replace("T", " "),
    ]
  );
  return getTelegramConfig();
}

async function touchLastChecked() {
  await pool.query(
    "UPDATE telegram_config SET last_checked_at = ? WHERE id = 1",
    [new Date().toISOString().slice(0, 23).replace("T", " ")]
  );
}

async function getLastUpdateId() {
  const [rows] = await pool.query("SELECT last_update_id FROM telegram_sync_state WHERE id = 1");
  return rows.length ? Number(rows[0].last_update_id) : 0;
}

async function setLastUpdateId(id) {
  await pool.query(
    "INSERT INTO telegram_sync_state (id, last_update_id) VALUES (1, ?) ON DUPLICATE KEY UPDATE last_update_id = VALUES(last_update_id)",
    [Number(id) || 0]
  );
}

// =============================================================================
// Telegram update dedup + single-consumer lock
// =============================================================================

/**
 * True when a Telegram update has already been consumed for a given chat,
 * either because a duty request row was created from it (global, any chat —
 * duty_request.telegram_update_id) or because the poller already replied to
 * it in THIS chat (returns, malformed, help, duplicates).
 */
async function isUpdateHandled(updateId, chatId = null) {
  if (!updateId) return false;
  const id = Number(updateId);
  if (!Number.isFinite(id)) return false;
  const chat = chatId != null ? String(chatId) : "";
  const [rows] = await pool.query(
    "SELECT 1 FROM telegram_processed_update WHERE update_id = ? AND chat_id = ? LIMIT 1",
    [id, chat]
  );
  if (rows.length) return true;
  const [drows] = await pool.query(
    "SELECT 1 FROM duty_request WHERE telegram_update_id = ? LIMIT 1",
    [id]
  );
  return drows.length > 0;
}

async function markUpdateHandled(updateId, kind = "other", chatId = null) {
  if (!updateId) return false;
  const id = Number(updateId);
  if (!Number.isFinite(id)) return false;
  const chat = chatId != null ? String(chatId) : "";
  const [res] = await pool.query(
    "INSERT IGNORE INTO telegram_processed_update (update_id, chat_id, kind, created_at) VALUES (?, ?, ?, ?)",
    [id, chat, String(kind || "other").slice(0, 20), new Date().toISOString().slice(0, 23).replace("T", " ")]
  );
  return res.affectedRows > 0;
}

// Atomically reserve an update before parsing it or sending a Telegram reply.
// A read-then-insert check is racy when two backend processes overlap.
async function claimUpdateHandling(updateId, kind = "processing", chatId = null) {
  return markUpdateHandled(updateId, kind, chatId);
}

// Allow a future poll to retry only work that failed before completion.
async function releaseUpdateHandling(updateId, chatId = null) {
  if (!updateId) return false;
  const id = Number(updateId);
  if (!Number.isFinite(id)) return false;
  const chat = chatId != null ? String(chatId) : "";
  const [res] = await pool.query(
    "DELETE FROM telegram_processed_update WHERE update_id = ? AND chat_id = ? AND kind = 'processing'",
    [id, chat]
  );
  return res.affectedRows > 0;
}

/**
 * Cross-process mutex so two backend instances sharing the same database can
 * never fetch + process the same Telegram updates at the same time. timeoutSec
 * = 0 means "try once, skip if already held" (returns false).
 *
 * GET_LOCK is scoped to a single connection, so acquire and release MUST use
 * the same pooled connection — otherwise the lock is left held by the pool.
 */
let pollLockConn = null;

async function acquirePollLock(timeoutSec = 0) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query("SELECT GET_LOCK('apa_telegram_poll', ?) AS got", [Number(timeoutSec) || 0]);
    if (!rows.length || !rows[0].got) {
      conn.release();
      return false;
    }
    pollLockConn = conn;
    return true;
  } catch (err) {
    conn.release();
    throw err;
  }
}

async function releasePollLock() {
  if (pollLockConn) {
    const conn = pollLockConn;
    pollLockConn = null;
    try {
      await conn.query("SELECT RELEASE_LOCK('apa_telegram_poll')");
    } finally {
      conn.release();
    }
  }
}

async function listExistingRequestIds() {
  const [rows] = await pool.query("SELECT id FROM duty_request");
  return new Set(rows.map((r) => r.id));
}

async function recordKnownChats(chats, botId) {
  if (!chats || !chats.length) return;
  const bot = String(botId || "");
  const rows = chats.map((c) => [
    bot,
    Number(c.id),
    (c.title || "").slice(0, 255),
    (c.username || "").slice(0, 255),
    (c.type || "supergroup").slice(0, 16),
    new Date().toISOString().slice(0, 23).replace("T", " "),
  ]);
  const values = rows.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
  await pool.query(
    `INSERT INTO telegram_known_chat (bot_id, chat_id, title, username, chat_type, last_seen_at)
     VALUES ${values}
     ON DUPLICATE KEY UPDATE
       title = VALUES(title), username = VALUES(username), chat_type = VALUES(chat_type),
       last_seen_at = VALUES(last_seen_at)`,
    rows.flat()
  );
}

async function listKnownGroups(botId) {
  const [rows] = await pool.query(
    `SELECT chat_id, title, username, chat_type, last_seen_at
     FROM telegram_known_chat
     WHERE chat_type IN ('group', 'supergroup') AND bot_id = ?
     ORDER BY last_seen_at DESC`,
    [String(botId || "")]
  );
  return rows.map((r) => ({
    id: String(r.chat_id),
    title: r.title || `Group ${r.chat_id}`,
    username: r.username || "",
    type: r.chat_type,
    lastSeenAt: toISO(r.last_seen_at),
  }));
}

module.exports = {
  listRequests,
  listRequestsForUser,
  getRequestById,
  createRequest,
  updateReturn,
  updateRequest,
  deleteRequest,
  deleteAllRequests,
  findDuplicateByTelegram,
  findActiveRequestByRequester,
  findTargetForTelegramReturn,
  getTelegramConfig,
  saveTelegramConfig,
  touchLastChecked,
  getLastUpdateId,
  setLastUpdateId,
  isUpdateHandled,
  markUpdateHandled,
  claimUpdateHandling,
  releaseUpdateHandling,
  getRequestIdByTelegramUpdateId,
  acquirePollLock,
  releasePollLock,
  listExistingRequestIds,
  recordKnownChats,
  listKnownGroups,
};
