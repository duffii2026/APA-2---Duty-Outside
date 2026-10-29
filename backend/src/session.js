const crypto = require("crypto");
const pool = require("./db");

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 12) * 60 * 60 * 1000;

function toDb(date) {
  return date.toISOString().slice(0, 23).replace("T", " ");
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createSession(userId) {
  const token = createToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  await pool.query(
    `INSERT INTO app_session (token_hash, app_user_id, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
    [tokenHash(token), userId, toDb(now), toDb(expires), toDb(now)]
  );
  return { token, expiresAt: expires.toISOString() };
}

/**
 * Resolve a bearer token to a live session. Returns null when the token is
 * missing, unknown, or expired. Refreshes the sliding expiry on each hit.
 */
async function getSessionByToken(token) {
  if (!token) return null;
  const hash = tokenHash(token);
  const [rows] = await pool.query(
    `SELECT s.token_hash, s.expires_at, s.app_user_id, u.username, u.display_name, u.role, u.staff_id,
            u.must_change_password
     FROM app_session s
     JOIN app_user u ON u.id = s.app_user_id
     WHERE s.token_hash = ? AND u.is_active = 1
     LIMIT 1`,
    [hash]
  );
  if (!rows.length) return null;

  const session = rows[0];
  const nowMs = Date.now();
  if (nowMs > new Date(session.expires_at).getTime()) {
    await pool.query("DELETE FROM app_session WHERE token_hash = ?", [hash]);
    return null;
  }

  const newExpires = new Date(nowMs + SESSION_TTL_MS);
  await pool.query(
    "UPDATE app_session SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?",
    [toDb(newExpires), toDb(new Date()), hash]
  );

  return {
    tokenHash: hash,
    userId: session.app_user_id,
    username: session.username,
    displayName: session.display_name,
    role: session.role,
    staffId: session.staff_id,
    mustChangePassword: !!session.must_change_password,
    expiresAt: newExpires.toISOString(),
  };
}

async function deleteSession(token) {
  if (!token) return;
  await pool.query("DELETE FROM app_session WHERE token_hash = ?", [tokenHash(token)]);
}

module.exports = { createSession, getSessionByToken, deleteSession, SESSION_TTL_MS };
