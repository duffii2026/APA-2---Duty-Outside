const express = require("express");
const crypto = require("crypto");
const pool = require("./db");
const {
  listRequests,
  listRequestsForUser,
  getRequestById,
  createRequest,
  updateReturn,
  updateRequest,
  deleteRequest,
  deleteAllRequests,
  getTelegramConfig,
  saveTelegramConfig,
  listExistingRequestIds,
  findActiveRequestByRequester,
} = require("./repositories");
const { generateRequestId, verifyPassword, hashPassword, encryptPassword, decryptPassword } = require("./utils");
const {
  testBotToken,
  sendTelegramMessage,
  getTelegramUpdates,
  discoverBotGroups,
  dispatchReturnAlert,
  dispatchDutyRequestAlert,
  pollOnce,
} = require("./telegramService");
const { createSession, getSessionByToken, deleteSession, SESSION_TTL_MS } = require("./session");

const router = express.Router();

const SESSION_COOKIE = "apa_session";

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function serializeCookie(name, value, maxAgeMs) {
  let cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (maxAgeMs !== undefined) cookie += `; Max-Age=${Math.floor(maxAgeMs / 1000)}`;
  return cookie;
}

const asyncHandler = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error("[api error]", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  });
};

/**
 * Blocks every request without a valid bearer session.
 * Attaches req.user (session payload) and req.authToken when authorized.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const token = bearer || parseCookies(req)[SESSION_COOKIE] || "";
  getSessionByToken(token)
    .then((session) => {
      if (!session) {
        return res.status(401).json({ error: "Unauthorized — valid session required" });
      }
      req.user = session;
      req.authToken = token;
      const allowedDuringPasswordChange =
        (req.method === "GET" && req.path === "/session/check") ||
        (req.method === "POST" && ["/auth/change-password", "/auth/logout"].includes(req.path));
      if (session.mustChangePassword && !allowedDuringPasswordChange) {
        return res.status(403).json({
          error: "Change your password before using the portal.",
          code: "PASSWORD_CHANGE_REQUIRED",
        });
      }
      next();
    })
    .catch(next);
}

// Roles that may use the executive register and all admin tooling. Staff
// accounts get a submit-only portal and are deliberately excluded.
const PRIVILEGED_ROLES = ["admin", "manager", "hr"];

// The approver is fixed by policy — never taken from client input.
const FIXED_OFFICIAL_APPROVER = "Mr. Shawn (General Manager)";

/**
 * Blocks a request unless the session's role is one of `roles`.
 * Must be mounted after requireAuth, since it reads req.user.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user && req.user.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: "Forbidden — your account does not have access to this resource" });
    }
    next();
  };
}

/**
 * Blocks a write unless the record belongs to the signed-in staff member.
 * Privileged roles bypass this. Falls back to name matching for sessions whose
 * app_user row has no staff_id link yet.
 */
async function requireOwnRequest(req, res, next) {
  try {
    if (PRIVILEGED_ROLES.includes(req.user.role)) return next();

    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "Request id is required" });

    const [rows] = await pool.query(
      "SELECT requester_name, requester_staff_id FROM duty_request WHERE id = ? LIMIT 1",
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Request not found" });

    const selfName = String((req.user.displayName || req.user.username || "")).trim().toLowerCase();
    const ownerName = String(rows[0].requester_name || "").trim().toLowerCase();
    const staffId = req.user.staffId != null ? Number(req.user.staffId) : null;

    const ownsByName = ownerName === selfName;
    const ownsById = staffId != null && rows[0].requester_staff_id != null &&
      Number(rows[0].requester_staff_id) === staffId;

    if (!ownsByName && !ownsById) {
      return res.status(403).json({ error: "Forbidden — you can only modify your own duty records" });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

// =============================================================================
// PUBLIC (no session required)
// =============================================================================

router.get("/health", asyncHandler(async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch {
    res.status(503).json({ ok: false, db: "unavailable" });
  }
}));

const USERNAME_ALIASES = {
  "mr shawn": "shawn",
  "mr. shawn": "shawn",
  "mr shawn (general manager)": "shawn",
};

router.post("/auth/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, error: "Username and password are required" });

  let normalized = String(username).toLowerCase().trim();
  if (USERNAME_ALIASES[normalized]) normalized = USERNAME_ALIASES[normalized];

  const [rows] = await pool.query(
    "SELECT id, username, display_name, role, password_hash, is_active, must_change_password FROM app_user WHERE LOWER(username) = ? LIMIT 1",
    [normalized]
  );

  if (rows.length && rows[0].is_active && verifyPassword(password, rows[0].password_hash)) {
    const r = rows[0];
    const session = await createSession(r.id);
    res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, session.token, SESSION_TTL_MS));
    return res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: r.id,
        username: r.username,
        displayName: r.display_name,
        role: r.role,
        mustChangePassword: !!r.must_change_password,
      },
    });
  }

  res.status(401).json({ success: false, error: "Invalid username or password" });
}));

// -----------------------------------------------------------------------------
// Public staff submission ("Staff Request - No Login Required" tab).
//
// Parity with the V2 fast-staff screen: anyone can file their own duty outside
// from the login page without an account. That also means the endpoint itself
// is reachable by any script, so the defence is layered:
//
//   1. Same-origin check      - browser posts from another site are refused.
//   2. Custom header required - a cross-origin fetch cannot send it without a
//                               CORS preflight, and no CORS is configured.
//   3. Single-use challenge   - the page fetches an HMAC token bound to the
//                               caller's IP with a 10 minute life; it is
//                               consumed on use, so replays fail.
//   4. Honeypot + fill time   - a hidden field plus a minimum time on form.
//   5. Per-IP and per-person quotas - stops both flooding and one IP stuffing
//                               many requests into one person's record.
//   6. Fixed approver + field allowlists + the one-active-duty rule.
//
// Anything that still gets through is written to the register with
// source='public' so the GM can see exactly which records came from this tab
// and review them.
// -----------------------------------------------------------------------------

const PUBLIC_DEPARTMENTS = new Set([
  "General Staff",
  "Accounting & Finance",
  "Operations & Logistics",
  "Administration & HR",
  "Marketing & Sales",
  "Procurement",
  "IT & Technical",
  "Client Services",
]);

const PUBLIC_REASONS = new Set([
  "Banking & Financial Affairs",
  "Medical & Hospital Visit",
  "Client & Partner Meeting",
  "Government & Ministry Affairs",
  "Emergency Family Matter",
  "Official Duty & Errand",
]);

// Per-process HMAC key. Rotating on restart invalidates outstanding
// challenges, which is the safe direction to fail.
const PUBLIC_CHALLENGE_SECRET = crypto.randomBytes(32);
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MIN_FORM_FILL_MS = 2500;

// Which address the per-IP limits count against.
//
// With a reverse proxy in front, every staff member shares the proxy's socket
// address, which would quietly turn the per-IP limits into a site-wide limit and
// lock everyone out. Set TRUST_PROXY=1 in that setup to count the real client.
//
// Left unset, a client-supplied X-Forwarded-For is deliberately ignored: it is
// trivial to forge, and honouring it would let a caller reset their own throttle
// on every request. The per-name quota, challenge and honeypot still apply then.
const TRUST_PROXY = String(process.env.TRUST_PROXY || "").trim();
const clientIp = (req) => {
  if (TRUST_PROXY) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (fwd) return fwd;
    const real = String(req.headers["x-real-ip"] || "").trim();
    if (real) return real;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
};

/** Sliding-window request counter keyed by an arbitrary string. */
function rateHits(store, key, windowMs, max) {
  const now = Date.now();
  const hits = (store.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    store.set(key, hits);
    return true;
  }
  hits.push(now);
  store.set(key, hits);
  return false;
}

const ipWindow = new Map(); // rolling 1h submission attempts
const ipDay = new Map(); // rolling 24h submission attempts
const nameDay = new Map(); // rolling 24h submissions per requester name
const challengeIssued = new Map(); // rolling 1h challenge issuances per IP
const usedChallenges = new Map(); // consumed challenge ids -> expiry

// Quotas are deliberately split. The per-person cap is what protects an
// individual's strike record. The per-IP caps only have to stop bulk flooding,
// so they are set generously: several staff sharing one office NAT address all
// draw from the same IP budget, and a genuine duty outside is filed a few times
// a day, not dozens of times.
const PUBLIC_MAX_PER_HOUR = 30;
const PUBLIC_MAX_PER_DAY = 60;
const PUBLIC_MAX_PER_NAME_PER_DAY = 5;
const PUBLIC_MAX_CHALLENGES_PER_HOUR = 120;

function pruneUsedChallenges() {
  const now = Date.now();
  if (usedChallenges.size < 5000) return;
  for (const [id, exp] of usedChallenges) {
    if (exp < now) usedChallenges.delete(id);
  }
}

/** Hostname without port, lower-cased. "SERVER:3001" and "SERVER" both -> "server". */
function hostnameOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `http://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True when the request plausibly came from our own page.
 *
 * Only the hostname is compared, not the port: in this deployment the page is
 * served from one address and the API from another (VITE_API_BASE points at the
 * backend's own port), so a port-sensitive check would refuse our own users.
 * Set PUBLIC_ALLOWED_ORIGINS to comma separated origins when the frontend is
 * hosted on a different domain entirely.
 *
 * A missing or opaque Origin is allowed through — non-browser clients never send
 * one, and "null" arrives from sandboxed contexts. Those callers still face the
 * signature header, the challenge and the quotas.
 */
function sameOrigin(req) {
  const allowedOrigins = String(process.env.PUBLIC_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const requestHost = hostnameOnly(req.headers["x-forwarded-host"] || req.headers.host || "");

  const check = (rawUrl) => {
    const url = String(rawUrl || "").trim();
    if (!url) return true; // nothing to compare
    if (allowedOrigins.includes(url.toLowerCase())) return true;
    const host = hostnameOnly(url);
    return !!host && !!requestHost && host === requestHost;
  };

  const origin = String(req.headers.origin || "").trim();
  if (origin && origin !== "null") return check(origin);

  const referer = String(req.headers.referer || "").trim();
  if (referer) return check(referer);

  return true;
}

const signChallenge = (id, ip, exp) =>
  crypto
    .createHmac("sha256", PUBLIC_CHALLENGE_SECRET)
    .update(`${id}.${ip}.${exp}`)
    .digest("base64url");

router.get("/public/challenge", asyncHandler(async (req, res) => {
  if (rateHits(challengeIssued, clientIp(req), 60 * 60 * 1000, PUBLIC_MAX_CHALLENGES_PER_HOUR)) {
    return res.status(429).json({ error: "Too many requests. Please refresh the page." });
  }
  const id = crypto.randomBytes(9).toString("base64url");
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const ip = clientIp(req);
  res.json({ token: `${id}.${exp}.${signChallenge(id, ip, exp)}`, expiresAt: new Date(exp).toISOString() });
}));

/**
 * Verifies a challenge token: well formed, not expired, issued to this IP, and
 * never used before. Returns false on anything suspicious.
 *
 * `consume` burns the token. Verification without consuming happens early to
 * turn away junk cheaply; the burn is deliberately deferred until the request
 * is otherwise valid, so a person who corrects a typo does not lose their form.
 * The two calls sit either side of validation with no await between the final
 * check and the burn, so the pair stays atomic.
 */
function verifyChallenge(token, ip, consume) {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [id, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const expected = signChallenge(id, ip, exp);
  const a = Buffer.from(sig || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  pruneUsedChallenges();
  if (usedChallenges.has(id)) return false; // replay
  if (consume) usedChallenges.set(id, exp + CHALLENGE_TTL_MS);
  return true;
}

const clip = (value, max) => String(value == null ? "" : value).trim().slice(0, max);
const isHHMM = (value) => /^\d{2}:\d{2}$/.test(String(value || ""));
const isISODate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const REJECT = (res, message) => res.status(400).json({ error: message });

router.post("/public/requests", asyncHandler(async (req, res) => {
  const ip = clientIp(req);

  // 1 + 2: where it came from.
  if (!sameOrigin(req)) {
    // Logged, never returned: an operator needs to see why a legitimate member
    // of staff was turned away. Usually the page is reached on a different
    // hostname than VITE_API_BASE was built with, which PUBLIC_ALLOWED_ORIGINS
    // is meant to cover.
    console.warn(
      `[public submit] rejected origin mismatch — origin=${req.headers.origin || "(none)"} referer=${req.headers.referer || "(none)"} host=${req.headers.host || "(none)"} forwardedHost=${req.headers["x-forwarded-host"] || "(none)"}`
    );
    return res.status(403).json({ error: "Submission blocked: unexpected origin. Please reload the page and try again." });
  }
  if (req.headers["x-portal-submit"] !== "1") {
    return res.status(403).json({ error: "Submission blocked: missing portal signature." });
  }

  // Quotas first, so a flood is cheap to reject.
  if (rateHits(ipWindow, ip, 60 * 60 * 1000, PUBLIC_MAX_PER_HOUR)) {
    return res.status(429).json({ error: "Too many submissions from this connection. Please try again later." });
  }
  if (rateHits(ipDay, ip, 24 * 60 * 60 * 1000, PUBLIC_MAX_PER_DAY)) {
    return res.status(429).json({ error: "Daily submission limit reached for this connection. Please contact the General Manager." });
  }

  const body = req.body || {};

  // 3: single-use challenge. Verified here, burned only once we are about to
  // write, so a validation error does not cost the person their form.
  if (!verifyChallenge(body.challengeToken, ip, false)) {
    return res.status(400).json({ error: "This form has expired. Please reload the page and try again." });
  }

  // 4: honeypot + minimum time on form.
  if (clip(body.company, 80)) {
    return REJECT(res, "Submission rejected.");
  }
  const fillMs = Number(body.formElapsedMs);
  if (!Number.isFinite(fillMs) || fillMs < MIN_FORM_FILL_MS || fillMs > 6 * 60 * 60 * 1000) {
    return REJECT(res, "Submission rejected.");
  }

  const requesterName = clip(body.requesterName, 80);
  const department = clip(body.department, 80);
  const reasonCategory = clip(body.reasonCategory, 80);
  const reasonDetail = clip(body.reasonDetail, 200);
  const destination = clip(body.destination, 160);
  const date = clip(body.date, 10);
  const departureTime = clip(body.timeOfDeparture, 5);
  const returnTime = body.timeOfReturn == null ? null : clip(body.timeOfReturn, 5);
  const position = clip(body.position, 80);
  const lateSubmissionReason = clip(body.lateSubmissionReason, 300);

  const isDirectToHome = body.isDirectToHome === true;
  const isReturnPending = isDirectToHome ? false : body.isReturnPending !== false;

  if (requesterName.length < 2) {
    return REJECT(res, "Please enter your full name so the register can identify you.");
  }
  if (position.length < 2) {
    return REJECT(res, "Please enter your position.");
  }
  if (department && !PUBLIC_DEPARTMENTS.has(department)) {
    return REJECT(res, "Please choose a department from the list.");
  }
  if (!PUBLIC_REASONS.has(reasonCategory)) {
    return REJECT(res, "Please choose a purpose from the list.");
  }
  if (!isISODate(date)) return REJECT(res, "A valid date is required.");
  if (!isHHMM(departureTime)) return REJECT(res, "A valid departure time is required.");
  if (!isDirectToHome && !isReturnPending && !isHHMM(returnTime)) {
    return REJECT(res, "Please give a return time, or tick that the return is pending.");
  }

  // 5: per-person quota, so one connection cannot stuff a colleague's record.
  const nameKey = requesterName.toLowerCase();
  if (rateHits(nameDay, nameKey, 24 * 60 * 60 * 1000, PUBLIC_MAX_PER_NAME_PER_DAY)) {
    return res.status(429).json({
      error: `${requesterName} has already filed several requests today. If this was not you, please tell the General Manager.`,
      code: "PERSON_QUOTA_REACHED",
    });
  }

  // Same rule as an authenticated submission.
  const activeRow = await findActiveRequestByRequester(requesterName);
  if (activeRow) {
    return res.status(409).json({
      error: `${requesterName} already has an active duty outside request (${activeRow.id}) that has not been marked as returned yet. Please mark it returned first.`,
      code: "DUPLICATE_DUTY_REQUEST",
      message: `${requesterName} already has an active duty outside request (${activeRow.id}) that has not been marked as returned yet. Please mark it returned first.`,
      activeId: activeRow.id,
    });
  }

  const existingIds = await listExistingRequestIds();
  const id = generateRequestId(existingIds);
  const today = new Date().toISOString().split("T")[0];
  const isRetroactive = date < today;

  // Burn the token now that everything else has passed. No await since the
  // verification above, so no other request can slip in between.
  if (!verifyChallenge(body.challengeToken, ip, true)) {
    return res.status(400).json({ error: "This form has expired. Please reload the page and try again." });
  }

  const created = await createRequest(
    {
      id,
      requesterName,
      employeesOnDuty: [requesterName],
      position,
      department,
      reasonOrPurpose: reasonDetail ? `${reasonCategory}: ${reasonDetail}` : reasonCategory,
      destination,
      date,
      timeOfDeparture: departureTime,
      timeOfReturn: isDirectToHome ? "17:00" : isReturnPending ? null : returnTime,
      isReturnPending,
      isDirectToHome,
      submissionTiming: isRetroactive ? "retroactive" : "on_time",
      lateSubmissionReason: isRetroactive ? lateSubmissionReason : "",
      missedFingerprintScans: Array.isArray(body.missedFingerprintScans)
        ? body.missedFingerprintScans.slice(0, 12).map((s) => clip(s, 60))
        : [],
      // Fixed by policy — a public form cannot nominate its own approver.
      approvedBy: FIXED_OFFICIAL_APPROVER,
      returnNotes: isDirectToHome
        ? "Afternoon duty concludes shift (Direct to Home)"
        : "Submitted via Staff Request tab (no login)",
      status: "active",
    },
    { source: "public", actor: `${requesterName} (public tab)` }
  );

  if (!created) return res.status(500).json({ error: "Could not register the request. Please try again." });

  res.status(201).json({ request: created });
}));

// =============================================================================
// PROTECTED (valid bearer session required)
// =============================================================================

router.use(requireAuth);

// Session status for the web UI: the browser never stores identity — it just
// sends the httpOnly cookie and asks "who am I?" on app start.
router.get("/session/check", asyncHandler(async (req, res) => {
  // Only the identity fields are echoed back. req.user also carries tokenHash,
  // which must never leave the server.
  res.json({
    authenticated: true,
    user: {
      id: req.user.userId,
      username: req.user.username,
      displayName: req.user.displayName,
      role: req.user.role,
      staffId: req.user.staffId != null ? Number(req.user.staffId) : null,
      mustChangePassword: !!req.user.mustChangePassword,
    },
  });
}));

router.post("/auth/logout", asyncHandler(async (req, res) => {
  await deleteSession(req.authToken);
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, "", 0));
  res.json({ ok: true });
}));

// Change the logged-in user's own password. The current password must match;
// other sessions are dropped so a leaked cookie can't survive the change.
router.post("/auth/change-password", asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }

  const [rows] = await pool.query(
    "SELECT id, password_hash FROM app_user WHERE id = ? LIMIT 1",
    [req.user.userId]
  );
  if (!rows.length) return res.status(404).json({ error: "User not found" });
  if (!verifyPassword(currentPassword, rows[0].password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const newHash = hashPassword(newPassword);
  await pool.query("UPDATE app_user SET password_hash = ?, password_encrypted = ?, must_change_password = 0 WHERE id = ?", [newHash, encryptPassword(newPassword), rows[0].id]);
  await pool.query(
    "DELETE FROM app_session WHERE app_user_id = ? AND token_hash <> ?",
    [rows[0].id, req.user.tokenHash]
  );

  res.json({ ok: true });
}));

// =============================================================================
// Account provisioning (privileged only)
// Lets management create the staff logins used by the Staff Portal, instead of
// hand-writing rows into app_user. Staff never reach these routes.
// =============================================================================

router.get("/auth/users", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.role, u.staff_id, u.is_active, u.must_change_password, u.created_at,
            s.full_name AS staff_name
       FROM app_user u
       LEFT JOIN staff s ON s.id = u.staff_id
      ORDER BY u.role = 'admin' DESC, u.role, u.display_name`
  );
  res.json({
    users: rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      role: r.role,
      staffId: r.staff_id,
      staffName: r.staff_name,
      isActive: !!r.is_active,
      mustChangePassword: !!r.must_change_password,
      createdAt: r.created_at,
    })),
  });
}));

router.get("/auth/users/:id/password", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid user id" });
  const [rows] = await pool.query("SELECT password_encrypted FROM app_user WHERE id = ? LIMIT 1", [id]);
  if (!rows.length) return res.status(404).json({ error: "User not found" });
  if (!rows[0].password_encrypted) return res.status(404).json({ error: "No recoverable password is stored. Reset this user's password to enable reveal." });
  res.setHeader("Cache-Control", "no-store");
  res.json({ password: decryptPassword(rows[0].password_encrypted) });
}));

router.post("/auth/users", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const { username, displayName, password, role, staffId } = req.body || {};

  const cleanUsername = String(username || "").trim().toLowerCase();
  const cleanDisplay = String(displayName || "").trim();
  const cleanPassword = String(password || "");

  if (!/^[a-z0-9._@-]{3,64}$/.test(cleanUsername)) {
    return res.status(400).json({ error: "Username must be 3-64 chars (a-z, 0-9, . _ - @)" });
  }
  if (!cleanDisplay) return res.status(400).json({ error: "Display name is required" });
  if (cleanPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const requestedRole = String(role || "staff");
  if (!PRIVILEGED_ROLES.includes(requestedRole) && requestedRole !== "staff") {
    return res.status(400).json({ error: `Role must be one of: staff, ${PRIVILEGED_ROLES.join(", ")}` });
  }

  let linkedStaffId = null;
  if (staffId != null && staffId !== "") {
    const [srows] = await pool.query("SELECT id FROM staff WHERE id = ? LIMIT 1", [staffId]);
    if (!srows.length) return res.status(400).json({ error: "Linked staff record not found" });
    linkedStaffId = srows[0].id;
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO app_user (username, display_name, password_hash, password_encrypted, role, staff_id) VALUES (?, ?, ?, ?, ?, ?)",
      [cleanUsername, cleanDisplay, hashPassword(cleanPassword), encryptPassword(cleanPassword), requestedRole, linkedStaffId]
    );
    res.status(201).json({ ok: true, id: result.insertId, username: cleanUsername, role: requestedRole });
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: `Username "${cleanUsername}" is already taken` });
    }
    throw err;
  }
}));

router.patch("/auth/users/:id", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid user id" });

  const { username, displayName, password, isActive, role } = req.body || {};
  const [rows] = await pool.query("SELECT id, username, role FROM app_user WHERE id = ? LIMIT 1", [id]);
  if (!rows.length) return res.status(404).json({ error: "User not found" });

  const sets = [];
  const params = [];
  if (username !== undefined) {
    const cleanUsername = String(username || "").trim().toLowerCase();
    if (!/^[a-z0-9._@-]{3,64}$/.test(cleanUsername)) {
      return res.status(400).json({ error: "Username must be 3-64 chars (a-z, 0-9, . _ - @)" });
    }
    const [duplicates] = await pool.query(
      "SELECT id FROM app_user WHERE LOWER(username) = ? AND id <> ? LIMIT 1",
      [cleanUsername, id]
    );
    if (duplicates.length) return res.status(409).json({ error: "That username is already taken" });
    sets.push("username = ?");
    params.push(cleanUsername);
  }
  if (displayName !== undefined) {
    const cleanDisplay = String(displayName || "").trim();
    if (!cleanDisplay || cleanDisplay.length > 120) {
      return res.status(400).json({ error: "Display name must be 1-120 characters" });
    }
    sets.push("display_name = ?");
    params.push(cleanDisplay);
  }
  if (password != null && String(password) !== "") {
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    sets.push("password_hash = ?");
    params.push(hashPassword(String(password)));
    sets.push("password_encrypted = ?");
    params.push(encryptPassword(String(password)));
    sets.push("must_change_password = 1");
  }
  if (isActive !== undefined) {
    sets.push("is_active = ?");
    params.push(isActive ? 1 : 0);
  }
  if (role) {
    const nextRole = String(role);
    if (!PRIVILEGED_ROLES.includes(nextRole) && nextRole !== "staff") {
      return res.status(400).json({ error: `Role must be one of: staff, ${PRIVILEGED_ROLES.join(", ")}` });
    }
    // Guard against locking every administrator out of the portal.
    if (rows[0].role === "admin" && nextRole !== "admin") {
      const [admins] = await pool.query(
        "SELECT COUNT(*) AS n FROM app_user WHERE role = 'admin' AND is_active = 1"
      );
      if (Number(admins[0].n) <= 1) {
        return res.status(400).json({ error: "Cannot demote the last active administrator" });
      }
    }
    sets.push("role = ?");
    params.push(nextRole);
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });

  params.push(id);
  await pool.query(`UPDATE app_user SET ${sets.join(", ")} WHERE id = ?`, params);

  // Disable/reset must not leave live sessions behind.
  if (isActive === false || password) {
    await pool.query("DELETE FROM app_session WHERE app_user_id = ?", [id]);
  }

  res.json({ ok: true });
}));

router.delete("/auth/users/:id", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid user id" });
  if (id === Number(req.user.userId)) {
    return res.status(400).json({ error: "You cannot delete the account you are signed in with" });
  }
  const [rows] = await pool.query("SELECT id, username, role FROM app_user WHERE id = ? LIMIT 1", [id]);
  if (!rows.length) return res.status(404).json({ error: "User not found" });
  if (rows[0].role === "admin") {
    const [admins] = await pool.query("SELECT COUNT(*) AS n FROM app_user WHERE role = 'admin'");
    if (Number(admins[0].n) <= 1) return res.status(400).json({ error: "Cannot delete the last administrator" });
  }
  await pool.query("DELETE FROM app_user WHERE id = ?", [id]);
  res.json({ ok: true });
}));

// =============================================================================
// Requests
// =============================================================================

router.get("/requests", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const requests = await listRequests({ month: req.query.month, status: req.query.status });
  res.json({ requests });
}));

router.get("/my/requests", asyncHandler(async (req, res) => {
  const requests = await listRequestsForUser(
    req.user.staffId,
    req.user.displayName || req.user.username
  );
  res.json({ requests });
}));

router.get("/requests/:id", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const request = await getRequestById(req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found" });
  res.json({ request });
}));

router.post("/requests", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const isStaffSubmitter = !PRIVILEGED_ROLES.includes(req.user.role);

  // A staff account can only file a duty outside for itself. Without this, any
  // authenticated staff member could submit (and thereby attribute to) a record
  // in someone else's name, which would then feed their compliance record.
  const requesterName = isStaffSubmitter ? req.user.displayName : (body.requesterName || "Staff");

  // Staff cannot nominate an approver or open an already-returned record.
  const approvedBy = isStaffSubmitter ? FIXED_OFFICIAL_APPROVER : (body.approvedBy || FIXED_OFFICIAL_APPROVER);
  const requestedStatus = isStaffSubmitter ? "active" : (body.status || "active");

  const existingIds = await listExistingRequestIds();
  const id = body.id && /^DOR-\d{4}-\d{1,5}$/i.test(body.id) ? String(body.id).toUpperCase() : generateRequestId(existingIds);

  // Idempotent: if the record already exists (e.g. imported via Telegram and
  // re-sent by the web UI), return it without creating a duplicate.
  const existing = await getRequestById(id);
  if (existing) {
    return res.json({ request: existing, existed: true });
  }

  // Prevent duplicate: a requester can only have one active (not-yet-returned)
  // duty outside request at a time, regardless of source. Keyed off the
  // server-resolved requester so a spoofed body cannot dodge this check.
  const activeRow = await findActiveRequestByRequester(requesterName);
  if (activeRow) {
    return res.status(409).json({
      error: `${requesterName} already has an active duty outside request (${activeRow.id}) that has not been marked as returned yet. Please mark it returned first.`,
      code: "DUPLICATE_DUTY_REQUEST",
      message: `${requesterName} already has an active duty outside request (${activeRow.id}) that has not been marked as returned yet. Please mark it returned first.`,
      activeId: activeRow.id,
      activeRequest: activeRow,
    });
  }

  const draft = {
    id,
    requesterName,
    employeesOnDuty: Array.isArray(body.employeesOnDuty) && body.employeesOnDuty.length ? body.employeesOnDuty : [requesterName],
    position: body.position || "Staff",
    department: body.department || "",
    reasonOrPurpose: body.reasonOrPurpose || "Official Duty",
    destination: body.destination || "",
    otherTeamsInvolved: body.otherTeamsInvolved || "",
    date: body.date || new Date().toISOString().split("T")[0],
    timeOfDeparture: body.timeOfDeparture || "09:00",
    timeOfReturn: body.timeOfReturn || null,
    isReturnPending: body.isReturnPending !== false,
    missedFingerprintScans: Array.isArray(body.missedFingerprintScans) ? body.missedFingerprintScans : [],
    approvedBy,
    returnNotes: body.returnNotes || "",
    status: requestedStatus,
    // APA-MEMO_09-2026_05 compliance fields. Pass-through only; createRequest
    // derives submission_timing when the client does not supply it.
    isDirectToHome: body.isDirectToHome === true,
    isRetroactive: body.isRetroactive === true,
    submissionTiming: body.submissionTiming,
    lateSubmissionReason: body.lateSubmissionReason || "",
  };

  const request = await createRequest(draft, {
    source: "web",
    actor: req.user ? req.user.displayName || req.user.username : draft.requesterName,
  });

  // Preserve original timestamps when migrating cached records.
  let finalRequest = request;
  if (body.createdAt) {
    const iso = new Date(body.createdAt).toISOString().slice(0, 23).replace("T", " ");
    const upd = body.updatedAt ? new Date(body.updatedAt).toISOString().slice(0, 23).replace("T", " ") : null;
    await pool.query(
      "UPDATE duty_request SET created_at = ?, updated_at = COALESCE(?, updated_at) WHERE id = ?",
      [iso, upd, request.id]
    );
    finalRequest = await getRequestById(request.id);
  }

  // Migration imports are silent — real web submissions still alert the group.
  if (!body.silent) {
    dispatchDutyRequestAlert(finalRequest).catch((err) =>
      console.error("[telegram dispatch]", err?.message || err)
    );
  }

  res.status(201).json({ request: finalRequest });
}));

// PATCH carries the GM strike waiver, so it stays privileged-only. A staff
// member confirms a return via the /return endpoint below instead.
router.patch("/requests/:id", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const request = await updateRequest(req.params.id, req.body || {});
  if (!request) return res.status(404).json({ error: "Request not found" });
  res.json({ request });
}));

router.delete("/requests", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  await deleteAllRequests();
  res.json({ ok: true, message: "All DOSR records deleted" });
}));

router.delete("/requests/:id", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const request = await getRequestById(req.params.id);
  const removed = await deleteRequest(req.params.id);
  if (!removed) return res.status(404).json({ error: "Request not found" });

  // Notify the staff Telegram group that the record was removed (web admin action).
  if (request) {
    const config = await getTelegramConfig();
    if (config.isConnected && config.botToken && config.groupChatId) {
      const staffNames = request.employeesOnDuty && request.employeesOnDuty.length
        ? request.employeesOnDuty.join(", ")
        : request.requesterName;
      sendTelegramMessage(
        config.botToken,
        config.groupChatId,
        `🗑️ <b>RECORD REMOVED BY ADMIN</b>\n\n<b>Ref:</b> <code>${request.id}</code>\n<b>Staff:</b> ${staffNames} (${request.position || "Staff"})\n<b>Purpose:</b> ${request.reasonOrPurpose || "-"}\n<b>Departure:</b> ${request.timeOfDeparture || "-"} | <b>Date:</b> ${request.date || "-"}\n\nThis duty request was removed from the register by management.`,
        "HTML"
      ).catch((err) => console.error("[telegram delete notice]", err?.message || err));
    }
  }

  res.json({ ok: true });
}));

router.post("/requests/:id/return", requireOwnRequest, asyncHandler(async (req, res) => {
  const { returnTime, notes } = req.body || {};
  if (!returnTime) return res.status(400).json({ error: "returnTime is required" });

  const request = await updateReturn(req.params.id, returnTime, notes, "web", req.user ? req.user.displayName || req.user.username : "web portal");
  if (!request) return res.status(404).json({ error: "Request not found" });

  dispatchReturnAlert(request, request.timeOfReturn, notes).catch((err) =>
    console.error("[telegram dispatch]", err?.message || err)
  );

  res.json({ request });
}));

// =============================================================================
// Telegram
//
// These expose and mutate the bot token / group bindings, so they are
// privileged-only. Staff submission reaches Telegram through the automatic
// dispatch inside POST /requests, never through these routes.
// =============================================================================

router.get("/telegram/config", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  res.json({ config: await getTelegramConfig() });
}));

router.put("/telegram/config", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const config = await saveTelegramConfig(req.body || {});
  res.json({ config });
}));

router.post("/telegram/test", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ success: false, error: "Token required" });
  res.json(await testBotToken(token));
}));

router.post("/telegram/botGroups", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ success: false, error: "Token required" });
  res.json(await discoverBotGroups(token));
}));

router.post("/telegram/send", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const { token, chatId, text, parseMode } = req.body || {};
  if (!token || !chatId || !text) return res.status(400).json({ success: false, error: "token, chatId and text are required" });
  res.json(await sendTelegramMessage(token, chatId, text, parseMode || "HTML"));
}));

router.post("/telegram/poll", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const { resetOffset } = req.body || {};
  res.json(await pollOnce({ resetOffset: !!resetOffset }));
}));

router.get("/telegram/updates", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const config = await getTelegramConfig();
  if (!config.botToken) return res.json({ success: false, error: "Bot token not configured" });
  const offset = req.query.offset ? Number(req.query.offset) : undefined;
  res.json(await getTelegramUpdates(config.botToken, offset));
}));

// Manual dispatch used by the web UI "Send Alert" button in RequestDetailModal.
// (Web submissions + Telegram poll already dispatch automatically.)
router.post("/telegram/notifyDuty", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const { request } = req.body || {};
  if (!request) return res.status(400).json({ error: "request is required" });
  res.json(await dispatchDutyRequestAlert(request));
}));

router.post("/telegram/notifyReturn", requireRole(...PRIVILEGED_ROLES), asyncHandler(async (req, res) => {
  const { request, returnTime, notes } = req.body || {};
  if (!request || !returnTime) return res.status(400).json({ error: "request and returnTime are required" });
  res.json(await dispatchReturnAlert(request, returnTime, notes));
}));

module.exports = router;
