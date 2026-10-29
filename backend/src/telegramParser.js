const { autoDetectMissedScans, normalizeTimeStr } = require("./utils");

// =============================================================================
// Ported from frontend/src/services/telegramBotInstructions.ts
// =============================================================================

function getInstructionMessage() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const year = now.getFullYear();
  return `📋 <b>APA DUTY OUTSIDE — SUBMISSION GUIDE & TEMPLATE</b>

To request permission for duty outside the office, please copy, fill out, and send this exact format into this group:

<code>Duty Outside Request
1. Requester: [Your Full Name]
2. Staff on Duty: [Your Name, or Name of all staff going]
3. Position: [Your Job Title / Position]
4. Reason: [Select one approved reason below]
5. Other Teams: [e.g. Accounting, Operations, or None]
6. Date: ${today}
7. Departure: [e.g. 10:30 AM or 14:00]
8. Return: [e.g. 12:30 PM, Pending, or Direct to Home]
9. Missed Scans: [Select from scan list below, or None]
10. Approved By: Mr. Shawn (General Manager)</code>

────────────────
🏢 <b>APPROVED REASON CHOICES (Item 4):</b>
• <b>Go to bank</b> (Cheque deposits, cash transactions, bank statements)
• <b>Go to GDT</b> (Tax filings, document submissions at tax branches)
• <b>Go to meet GDT</b> (Official meetings, audit queries, discussions)
• <b>Doing CFO tasks</b> (Urgent financial assignments, executive errands)
• <b>Other: [specify]</b> (Client visits, site inspections, purchasing)

────────────────
⏰ <b>BIOMETRIC SCANS GUIDE (Item 9 - For Odoo Attendance):</b>
<i>(Indicate which scheduled scans you will miss so HR can excuse them in Odoo)</i>
• <b>Morning In</b> → If out between 08:00 – 08:30 AM
• <b>Lunch Out</b> → If out between 12:00 – 12:30 PM
• <b>Lunch In</b> → If returning after 13:00 – 13:30 PM
• <b>Evening Out</b> → If leaving after 16:30 or going <b>Direct to Home</b>
• <b>Full Day</b> → All 4 scans (if away the entire day 08:00 – 17:00)
• <b>None</b> → If trip is in-between scan hours (e.g. 09:30 – 11:30)

────────────────
🚗 <b>HOW TO REPORT YOUR RETURN / COMPLETION:</b>
Once you get back to the office or finish your duty, reply to your message with:
  • <code>Returned DOR-${year}-XXXX 17:30</code> <i>(with specific time)</i>
  • <code>Returned DOR-${year}-XXXX now</code> <i>(auto-uses Cambodia time)</i>
  • <code>Duty completed at 17:15. Direct to home.</code> <i>(if end of day)</i>

<i>⚡ The system will automatically log your return, reconcile your hours, and alert Mr. Shawn.</i>`;
}

function isHelpOrInstructionInquiry(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();

  if (
    lower === "/help" || lower === "/start" || lower === "/template" ||
    lower === "/format" || lower === "/instruction" || lower === "/instructions" ||
    lower === "/duty"
  ) {
    return true;
  }

  const helpPatterns = [
    "how to fill", "how to request", "how to use", "how to do",
    "instruction", "give me instruction", "give instruction", "send instruction",
    "template", "form format", "duty format", "duty template",
    "help me fill", "what to fill", "format please", "template please",
    "help please", "pls give me the instruction", "please give me the instruction",
    "របៀបបំពេញ", "ទម្រង់សុំចេញក្រៅ",
  ];

  return helpPatterns.some((pattern) => lower.includes(pattern));
}

// =============================================================================
// Ported from frontend/src/services/telegramBotService.ts
// =============================================================================

// Strip a human "already submitted / duplicate" marker the staff often append
// to a re-submitted message, e.g. "1. Requester: Sok Chhai3 (duplicate)".
// Without this the literal "(duplicate)" would become part of the stored name
// and the exact-match duplicate check below would never trigger.
function stripDupTag(value) {
  const s = String(value || "").trim();
  const cleaned = s.replace(/\s*\(?\s*(duplicate|dup)\s*\)?\s*$/i, "").trim();
  return cleaned || s;
}

function parseTelegramDutyText(rawText, senderName) {
  if (!rawText) return { isValid: false, error: "Empty message" };
  const normalized = rawText.trim();
  const lowerNormalized = normalized.toLowerCase();
  const hasDutyKeywords =
    lowerNormalized.includes("duty outside") ||
    lowerNormalized.includes("request duty outside");

  if (!hasDutyKeywords) {
    return { isValid: false, error: "Not a duty outside request message" };
  }

  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);

  const CANONICAL_LABELS = {
    1: "Requester",
    2: "Staff on Duty",
    3: "Position",
    4: "Reason",
    5: "Other Teams",
    6: "Date",
    7: "Departure",
    8: "Return",
    9: "Missed Scans",
    10: "Approved By",
  };
  const normalizeLabel = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

  const wrongLabels = [];
  for (const line of lines) {
    const cleanLine = line.replace(/^[📋📝📌\*\s]+/, "").trim();
    const numMatch = cleanLine.match(/^(\d{1,2})\s*[\.\)]\s*/);
    if (!numMatch) continue;
    const num = parseInt(numMatch[1], 10);
    if (!CANONICAL_LABELS[num]) continue;
    const rest = cleanLine.replace(/^(\d{1,2})\s*[\.\)]\s*/i, "").replace(/\*/g, "");
    const colonIdx = rest.search(/[:：]/);
    if (colonIdx === -1) continue;
    const labelText = rest.slice(0, colonIdx).trim();
    if (!labelText) continue;
    if (normalizeLabel(labelText) !== normalizeLabel(CANONICAL_LABELS[num])) {
      wrongLabels.push(`Line ${num} (label should be '${CANONICAL_LABELS[num]}' but got '${labelText}')`);
    }
  }

  if (wrongLabels.length > 0) {
    return {
      isValid: false,
      error: `Incorrect format — ${wrongLabels.join("; ")}. No record was saved. Please resend using the exact 1-10 template.`,
      data: null,
    };
  }

  let reqName = senderName || "Staff Member";
  let dutyStaff = [];
  let pos = "Staff";
  let reason = "Official Duty";
  let teams = "None";
  let reqDate = new Date().toISOString().split("T")[0];
  let dep = "09:00";
  let ret = null;
  let isPending = true;
  let isDirectToHome = false;
  let scans = [];
  let app = "Mr. Shawn (General Manager)";
  const matchedNum = new Set();
  const lineRaw = {};

  for (const line of lines) {
    const cleanLine = line.replace(/^[📋📝📌\*\s]+/, "").trim();
    const lower = cleanLine.toLowerCase();
    const numMatch = cleanLine.match(/^(\d{1,2})\s*[\.\)]\s*/);
    const num = numMatch ? numMatch[1] : null;

    if (lower.startsWith("1.") || lower.includes("requester:") || lower.includes("requester :")) {
      reqName = stripDupTag(cleanLine.replace(/^(1\.|\*1\.\*)\s*/i, "").replace(/requester\s*:\s*/i, "").replace(/\*/g, "").trim());
      if (num === "1") { matchedNum.add(1); lineRaw[1] = reqName; }
    } else if (lower.startsWith("2.") || lower.includes("staff on duty:") || lower.includes("employee(s) on duty:")) {
      const rawStaff = cleanLine.replace(/^(2\.|\*2\.\*)\s*/i, "").replace(/(staff on duty|employee\(s\) on duty)\s*:\s*/i, "").replace(/\*/g, "").trim();
      dutyStaff = rawStaff.split(",").map((s) => stripDupTag(s)).filter(Boolean);
      if (num === "2") { matchedNum.add(2); lineRaw[2] = rawStaff; }
    } else if (lower.startsWith("3.") || lower.includes("position:")) {
      pos = stripDupTag(cleanLine.replace(/^(3\.|\*3\.\*)\s*/i, "").replace(/position\s*:\s*/i, "").replace(/\*/g, "").trim());
      if (num === "3") { matchedNum.add(3); lineRaw[3] = pos; }
    } else if (lower.startsWith("4.") || lower.includes("reason:") || lower.includes("reason or purpose:")) {
      reason = stripDupTag(cleanLine.replace(/^(4\.|\*4\.\*)\s*/i, "").replace(/(reason or purpose|reason)\s*:\s*/i, "").replace(/\*/g, "").trim());
      if (num === "4") { matchedNum.add(4); lineRaw[4] = reason; }
    } else if (lower.startsWith("5.") || lower.includes("other teams:") || lower.includes("other team(s) involved:")) {
      teams = cleanLine.replace(/^(5\.|\*5\.\*)\s*/i, "").replace(/(other team\(s\) involved|other teams)\s*:\s*/i, "").replace(/\*/g, "").trim();
      if (num === "5") { matchedNum.add(5); lineRaw[5] = teams; }
    } else if (lower.startsWith("6.") || lower.includes("date:")) {
      reqDate = cleanLine.replace(/^(6\.|\*6\.\*)\s*/i, "").replace(/date\s*:\s*/i, "").replace(/\*/g, "").trim();
      if (num === "6") { matchedNum.add(6); lineRaw[6] = reqDate; }
    } else if (lower.startsWith("7.") || lower.includes("departure:") || lower.includes("time of departure:")) {
      dep = cleanLine.replace(/^(7\.|\*7\.\*)\s*/i, "").replace(/(time of departure|departure)\s*:\s*/i, "").replace(/\*/g, "").trim();
      if (num === "7") { matchedNum.add(7); lineRaw[7] = dep; }
    } else if (lower.startsWith("8.") || lower.includes("return:") || lower.includes("time of return:")) {
      const rawRet = cleanLine.replace(/^(8\.|\*8\.\*)\s*/i, "").replace(/(time of return|return)\s*:\s*/i, "").replace(/\*/g, "").trim();
      // Line 8 is an EXPECTED return time / note only — it never marks the
      // request returned. Only the explicit "Returned <Ref> now/<time>" reply
      // confirms the return. So a real clock time is kept as the expected
      // return, and anything else ("Pending", "Will update", "N/A"...)
      // just leaves the request pending (status stays "active").
      //
      // "Direct to Home" is checked FIRST: normalizeTimeStr() maps it to 17:00,
    // so without this guard it would be indistinguishable from a genuine
    // 17:00 return and the record would lose its direct-to-home status.
    const retLower = rawRet.toLowerCase()
      .replace(/[–—-]/g, " ")   // normalize dashes/hyphens to spaces
      .replace(/\s+/g, " ")     // collapse whitespace
      .trim();
    if (retLower.includes("direct to home") || retLower.includes("direct home") ||
        retLower.includes("go straight home") || retLower.includes("go home")) {
      isDirectToHome = true;
      // The 17:00 end of the workday is the effective close and
      // is officially excused. Record it as the return time so downstream
      // consumers never see "not pending but no time"; is_direct_to_home is
      // what distinguishes this from a genuine 17:00 return to office.
      ret = normalizeTimeStr("17:00");
      isPending = false;
      } else if (normalizeTimeStr(rawRet)) {
        ret = rawRet;
        isPending = false;
      } else {
        ret = null;
        isPending = true;
      }
      if (num === "8") { matchedNum.add(8); lineRaw[8] = rawRet; }
    } else if (lower.startsWith("9.") || lower.includes("missed scans:") || lower.includes("missed fingerprint scan(s):")) {
      const rawScans = cleanLine.replace(/^(9\.|\*9\.\*)\s*/i, "").replace(/(missed fingerprint scan\(s\)|missed scans)\s*:\s*/i, "").replace(/\*/g, "").trim();
      if (rawScans.toLowerCase() !== "none" && rawScans.trim() !== "-") {
        scans = rawScans.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (num === "9") { matchedNum.add(9); lineRaw[9] = rawScans || "None"; }
    } else if (lower.startsWith("10.") || lower.includes("approved by:")) {
      app = cleanLine.replace(/^(10\.|\*10\.\*)\s*/i, "").replace(/approved by\s*:\s*/i, "").replace(/\*/g, "").trim();
      if (num === "10") { matchedNum.add(10); lineRaw[10] = app; }
    }
  }

  // Validate required numbered fields are present in the message.
  // Requester(1), Staff(2), Position(3), Reason(4), Date(6) and Departure(7) are mandatory.
  const required = [1, 2, 3, 4, 6, 7];
  const names = { 1: "Requester", 2: "Staff on Duty", 3: "Position", 4: "Reason", 6: "Date", 7: "Departure" };

  const missing = required.filter((n) => !matchedNum.has(n));
  if (missing.length > 0) {
    const missingNames = missing.map((n) => `Line ${n} (${names[n]})`).join(", ");
    return {
      isValid: false,
      error: `Incorrect format — missing required line(s): ${missingNames}. No record was saved. Please resend using the exact 1-10 template.`,
      data: null,
    };
  }

  const emptyLines = required.filter((n) => !(lineRaw[n] || "").trim());
  if (emptyLines.length > 0) {
    const emptyNames = emptyLines.map((n) => `Line ${n} (${names[n]})`).join(", ");
    return {
      isValid: false,
      error: `Incorrect format — empty value on line(s): ${emptyNames}. Please fill in the missing value and resend.`,
      data: null,
    };
  }

  if (dutyStaff.length === 0) dutyStaff = [reqName];

  if (scans.length === 0 || scans.some((s) => s.toLowerCase().includes("auto") || s.toLowerCase().includes("all") || s.toLowerCase().includes("full day"))) {
    const autoDetected = autoDetectMissedScans(dep, ret, isPending, isDirectToHome);
    if (autoDetected.scans.length > 0) scans = autoDetected.scans;
  }

  // APA-MEMO_09-2026_05: classify how this request was logged relative to the
  // duty date. A duty dated before today cannot have been pre-logged.
  const todayStr = new Date().toISOString().slice(0, 10);
  const dutyDay = String(reqDate || "").slice(0, 10);
  const submissionTiming =
    dutyDay && dutyDay > todayStr ? "advance" : dutyDay && dutyDay < todayStr ? "retroactive" : "on_time";

  return {
    isValid: true,
    data: {
      requesterName: reqName,
      employeesOnDuty: dutyStaff,
      position: pos,
      reasonOrPurpose: reason,
      otherTeamsInvolved: teams,
      date: reqDate,
      timeOfDeparture: dep,
      timeOfReturn: ret,
      isReturnPending: isPending,
      isDirectToHome,
      // Direct to Home ends the workday at the excused 17:00 close, so the
      // duty is complete at submission rather than awaiting a return reply.
      status: isDirectToHome ? "returned" : "active",
      submissionTiming,
      isRetroactive: submissionTiming === "retroactive",
      missedFingerprintScans: scans,
      approvedBy: app || "Mr. Shawn (General Manager)",
    },
  };
}

function parseTelegramReturnText(rawText, senderName, replyToText) {
  if (!rawText) return { isReturn: false };
  const text = rawText.trim();
  const lower = text.toLowerCase();

  if (
    lower.includes("duty outside request") ||
    lower.includes("duty outside") ||
    lower.includes("requester:") ||
    (lower.includes("1.") && lower.includes("2."))
  ) {
    return { isReturn: false };
  }

  const isReturnKeyword =
    lower.startsWith("return") ||
    lower.includes("return at") ||
    lower.includes("returned") ||
    lower.includes("return to office") ||
    lower.includes("back in office") ||
    lower.includes("back to office") ||
    lower.startsWith("back at") ||
    lower.startsWith("/return") ||
    lower.includes("return:");

  const isReplyToDutyMsg = replyToText && (
    replyToText.includes("DUTY OUTSIDE REGISTERED") ||
    replyToText.includes("DOR-") ||
    replyToText.includes("Pending (Same-Day Policy)")
  );

  if (!isReturnKeyword && !isReplyToDutyMsg) {
    return { isReturn: false };
  }

  let reqId;
  const idMatch = text.match(/DOR-\d{4}-\d{3,5}/i);
  if (idMatch) {
    reqId = idMatch[0].toUpperCase();
  } else if (replyToText) {
    const replyIdMatch = replyToText.match(/DOR-\d{4}-\d{3,5}/i);
    if (replyIdMatch) reqId = replyIdMatch[0].toUpperCase();
  }

  let returnTime = new Date().toTimeString().slice(0, 5);

  // Handle "now" keyword → use Cambodia time (UTC+7)
  if (/\bnow\b/i.test(text)) {
    const now = new Date();
    const cambodiaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" }));
    returnTime = `${String(cambodiaTime.getHours()).padStart(2, "0")}:${String(cambodiaTime.getMinutes()).padStart(2, "0")}`;
  } else {
    const timeWithMinutesMatch = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    const hourOnlyAmPmMatch = text.match(/(\d{1,2})\s*(am|pm)/i);

    if (timeWithMinutesMatch) {
      let hours = parseInt(timeWithMinutesMatch[1], 10);
      const mins = timeWithMinutesMatch[2];
      const ampm = timeWithMinutesMatch[3] ? timeWithMinutesMatch[3].toLowerCase() : undefined;
      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;
      returnTime = `${String(hours).padStart(2, "0")}:${mins}`;
    } else if (hourOnlyAmPmMatch) {
      let hours = parseInt(hourOnlyAmPmMatch[1], 10);
      const ampm = hourOnlyAmPmMatch[2].toLowerCase();
      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;
      returnTime = `${String(hours).padStart(2, "0")}:00`;
    }
  }

  return {
    isReturn: true,
    reqId,
    returnTime,
    notes: `Updated by staff via Telegram (${senderName || "Staff"})`,
  };
}

module.exports = {
  getInstructionMessage,
  isHelpOrInstructionInquiry,
  parseTelegramDutyText,
  parseTelegramReturnText,
};