const { scryptSync, timingSafeEqual, randomBytes, createCipheriv, createDecipheriv } = require("crypto");

function passwordEncryptionKey() {
  const value = String(process.env.PASSWORD_ENCRYPTION_KEY || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("PASSWORD_ENCRYPTION_KEY must be a 32-byte hex key");
  }
  return Buffer.from(value, "hex");
}

function encryptPassword(password) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", passwordEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(password), "utf8"), cipher.final()]);
  return `gcm$${iv.toString("hex")}$${cipher.getAuthTag().toString("hex")}$${ciphertext.toString("hex")}`;
}

function decryptPassword(value) {
  const parts = String(value || "").split("$");
  if (parts.length !== 4 || parts[0] !== "gcm") throw new Error("Invalid encrypted password format");
  const decipher = createDecipheriv("aes-256-gcm", passwordEncryptionKey(), Buffer.from(parts[1], "hex"));
  decipher.setAuthTag(Buffer.from(parts[2], "hex"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "hex")), decipher.final()]).toString("utf8");
}

// =============================================================================
// Time helpers (ported from frontend utils/scanDetection.ts)
// =============================================================================

function parseTimeToMinutesOfDay(timeStr) {
  if (!timeStr) return null;
  const clean = timeStr.trim().toLowerCase();

  if (clean.includes("direct to home") || clean.includes("end of work") || clean.includes("end of shift")) {
    return 17 * 60;
  }

  const isPM = clean.includes("pm");
  const isAM = clean.includes("am");
  const numericOnly = clean.replace(/[ap]m/, "").trim();
  const parts = numericOnly.split(":");

  if (parts.length === 0 || isNaN(parseInt(parts[0], 10))) return null;

  let hours = parseInt(parts[0], 10);
  const minutes = parts.length > 1 ? (parseInt(parts[1], 10) || 0) : 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function toMinutesPadded(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function normalizeTimeStr(timeStr) {
  const mins = parseTimeToMinutesOfDay(timeStr);
  if (mins === null) return null;
  return toMinutesPadded(mins);
}

// =============================================================================
// Scan auto-detection (ported from frontend utils/scanDetection.ts)
// =============================================================================

function autoDetectMissedScans(departureTime, returnTime, isPendingReturn = false, isDirectToHome = false) {
  const depMinutes = parseTimeToMinutesOfDay(departureTime);

  if (depMinutes === null) {
    return { scans: [], isFullDay: false, isDirectToHome: false, explanation: "" };
  }

  let retMinutes = returnTime ? parseTimeToMinutesOfDay(returnTime) : null;
  const directHome = isDirectToHome || (returnTime ? String(returnTime).toLowerCase().includes("home") : false);
  if (directHome && retMinutes === null) retMinutes = 17 * 60;

  if (isPendingReturn && retMinutes === null) {
    if (depMinutes <= 12 * 60) retMinutes = 14 * 60;
  }

  const effectiveEnd = retMinutes !== null ? retMinutes : depMinutes + 120;

  const detectedScans = [];

  if (depMinutes <= 8 * 60 + 30) {
    detectedScans.push("Morning In (Check-In)");
  }
  if (depMinutes <= 12 * 60 + 30 && effectiveEnd >= 12 * 60) {
    detectedScans.push("Lunch Out (Check-Out)");
  }
  if (depMinutes < 13 * 60 + 30 && effectiveEnd >= 13 * 60) {
    detectedScans.push("Lunch In (Check-In)");
  }
  if (directHome || (retMinutes !== null && retMinutes >= 17 * 60)) {
    detectedScans.push("Evening Out (Check-Out)");
  }

  const isFullDay =
    depMinutes <= 8 * 60 + 30 &&
    (effectiveEnd >= 17 * 60 || directHome) &&
    detectedScans.length >= 4;

  let explanation = "";
  if (isFullDay) {
    explanation = "Full day off-site duty detected (All 4 scans excused for Odoo)";
  } else if (detectedScans.length > 0) {
    explanation = `Auto-detected ${detectedScans.length} scan window${detectedScans.length > 1 ? "s" : ""} based on your hours`;
  }

  return { scans: detectedScans, isFullDay, isDirectToHome: directHome, explanation };
}

// =============================================================================
// Duty category (ported from frontend utils/dutyReasons.ts detectDutyCategory)
// =============================================================================

function detectDutyCategory(reasonText) {
  const lower = (reasonText || "").toLowerCase();

  if (lower.includes("meet gdt") || lower.includes("meeting with gdt") || lower.includes("meet tax") || lower.includes("meeting gdt")) {
    return "meet_gdt";
  }
  if (lower.includes("bank") || lower.includes("cheque") || lower.includes("deposit")) return "bank";
  if (lower.includes("gdt") || lower.includes("taxation") || lower.includes("tax department")) return "gdt";
  if (lower.includes("cfo") || lower.includes("chief financial")) return "cfo_tasks";
  return "other";
}

// =============================================================================
// Password hashing (Node built-in scrypt, no external deps)
// Format: scrypt$<salt hex>$<hash hex>
// =============================================================================

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;
  const parts = String(storedHash).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1];
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// =============================================================================
// Misc
// =============================================================================

function generateRequestId(existingIds) {
  const year = new Date().getFullYear();
  let candidate;
  do {
    candidate = `DOR-${year}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  } while (existingIds.has(candidate));
  return candidate;
}

module.exports = {
  parseTimeToMinutesOfDay,
  normalizeTimeStr,
  autoDetectMissedScans,
  detectDutyCategory,
  hashPassword,
  verifyPassword,
  encryptPassword,
  decryptPassword,
  generateRequestId,
};
