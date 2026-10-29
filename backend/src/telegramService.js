const {
  getTelegramConfig,
  saveTelegramConfig,
  touchLastChecked,
  getLastUpdateId,
  setLastUpdateId,
  createRequest,
  updateReturn,
  findDuplicateByTelegram,
  findActiveRequestByRequester,
  findTargetForTelegramReturn,
  isUpdateHandled,
  markUpdateHandled,
  claimUpdateHandling,
  releaseUpdateHandling,
  acquirePollLock,
  releasePollLock,
  listExistingRequestIds,
  recordKnownChats,
  listKnownGroups,
} = require("./repositories");
const { generateRequestId } = require("./utils");
const {
  getInstructionMessage,
  isHelpOrInstructionInquiry,
  parseTelegramDutyText,
  parseTelegramReturnText,
} = require("./telegramParser");

const POLL_INTERVAL = Number(process.env.TELEGRAM_POLL_INTERVAL || 6000);

// =============================================================================
// Telegram Bot API wrapper (global fetch, Node 18+)
// =============================================================================

// Force IPv4 for outbound Telegram connections. Many VPS/cloud providers
// advertise IPv6 addresses that have no working route to Telegram (ENETUNREACH
// / ETIMEDOUT). The undici Agent with connect.family:4 makes every request from
// this module skip IPv6 and connect via IPv4 only. We use undici's own fetch so
// the dispatcher and the fetch call come from the same undici build (mixing with
// the global fetch would throw UND_ERR_INVALID_ARG).
const { Agent, fetch: telegramFetch } = require("undici");
const telegramDispatcher = new Agent({ connect: { family: 4 } });

async function apiCall(token, method, body, params = {}) {
  const url = `https://api.telegram.org/bot${token}/${method}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`;
  const res = await telegramFetch(url, {
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    dispatcher: telegramDispatcher,
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).description || res.statusText; } catch { detail = res.statusText; }
    // Expose both `description` (checked by callers) and `error` for compatibility.
    return { ok: false, description: `${res.status} ${detail}`, error: `${res.status} ${detail}` };
  }
  return await res.json();
}

// Build a human-readable error string that includes the deepest cause code,
// e.g. "fetch failed (ETIMEDOUT)" for Node's undici network errors.
function describeError(err) {
  let message = (err && err.message) || String(err || "Unknown error");
  let cause = err && err.cause;
  let code = (err && err.code) || "";
  while (cause && !code) {
    code = cause.code || "";
    cause = cause.cause;
  }
  return code ? `${message} (${code})` : message;
}

async function testBotToken(token) {
  const cleanToken = token.trim();
  if (!cleanToken) return { success: false, error: "Bot token cannot be empty" };
  try {
    const data = await apiCall(cleanToken, "getMe");
    if (data && data.ok) {
      return {
        success: true,
        bot: {
          id: data.result.id,
          firstName: data.result.first_name,
          username: data.result.username,
          canJoinGroups: data.result.can_join_groups,
          canReadAllGroupMessages: data.result.can_read_all_group_messages,
        },
      };
    }
    return { success: false, error: (data && (data.description || data.error)) || "Invalid Telegram Bot Token" };
  } catch (err) {
    return { success: false, error: describeError(err) || "Network error connecting to Telegram API. Check your internet connection." };
  }
}

async function sendTelegramMessage(token, chatId, text, parseMode = "HTML", replyMarkup) {
  const cleanToken = (token || "").trim();
  const cleanChatId = String(chatId || "").trim();
  if (!cleanToken || !cleanChatId) return { success: false, error: "Bot token and Chat ID are required" };

  const body = { chat_id: cleanChatId, text, parse_mode: parseMode };
  if (replyMarkup) body.reply_markup = replyMarkup;

  try {
    const data = await apiCall(cleanToken, "sendMessage", body);
    if (data && data.ok) return { success: true, messageId: data.result.message_id };
    const tgErr = data && (data.description || data.error);
    return { success: false, error: tgErr || "Failed to send message to Telegram" };
  } catch (err) {
    return { success: false, error: describeError(err) || "Network error dispatching Telegram message" };
  }
}

async function getTelegramUpdates(token, offset) {
  const cleanToken = (token || "").trim();
  if (!cleanToken) return { success: false, error: "Token required" };
  try {
    const params = { limit: 25 };
    if (offset) params.offset = offset;
    const data = await apiCall(cleanToken, "getUpdates", undefined, params);
    if (data && data.ok) return { success: true, updates: data.result || [] };
    return { success: false, error: (data && (data.description || data.error)) || "Could not fetch updates" };
  } catch (err) {
    return { success: false, error: describeError(err) || "Error checking updates" };
  }
}

// Telegram bot numeric id is the token prefix before ':'.
function botIdFromToken(token) {
  const t = (token || "").trim();
  const i = t.indexOf(":");
  return i > 0 ? t.slice(0, i) : t;
}

// Extract the chat a bot belongs to from any Telegram update flavor.
function pickupChat(update) {
  if (update.message && update.message.chat) return update.message.chat;
  if (update.edited_message && update.edited_message.chat) return update.edited_message.chat;
  if (update.channel_post && update.channel_post.chat) return update.channel_post.chat;
  if (update.edited_channel_post && update.edited_channel_post.chat) return update.edited_channel_post.chat;
  if (update.my_chat_member && update.my_chat_member.chat) return update.my_chat_member.chat;
  if (update.new_chat_member && update.new_chat_member.chat) return update.new_chat_member.chat;
  if (update.chat_member && update.chat_member.chat) return update.chat_member.chat;
  return null;
}

function asKnownChat(chat) {
  if (!chat || !chat.id) return null;
  if (chat.type !== "group" && chat.type !== "supergroup") return null;
  return {
    id: chat.id,
    title: chat.title || chat.username || `Group ${chat.id}`,
    username: chat.username || "",
    type: chat.type,
  };
}

async function recordUpdatesChats(updates, botId) {
  const knownChats = [];
  for (const update of updates || []) {
    const known = asKnownChat(pickupChat(update));
    if (known) knownChats.push(known);
  }
  if (knownChats.length) await recordKnownChats(knownChats, botId);
}

/**
 * Discover groups the bot currently belongs to (from getUpdates — updates stay
 * pending, so the poller can still consume them) and merge with everything the
 * poller has previously seen for THIS bot. Returns { success, groups }.
 */
async function discoverBotGroups(token) {
  const cleanToken = (token || "").trim();
  if (!cleanToken) return { success: false, error: "Token required" };
  const botId = botIdFromToken(cleanToken);

  try {
    const res = await getTelegramUpdates(cleanToken, undefined);
    if (!res.success) return { success: false, error: res.error };
    await recordUpdatesChats(res.updates, botId);
  } catch (err) {
    console.error("[telegram discoverBotGroups]", err.message);
  }

  const groups = await listKnownGroups(botId);
  return { success: true, groups };
}

// =============================================================================
// Dispatch helpers (group + Mr. Shawn private chat)
// =============================================================================

const guardEmptyConfig = (config) => {
  if (!config.botToken) return { error: ["Bot token not configured"] };
  return null;
};

async function dispatchReturnAlert(request, returnTime, notes) {
  const config = await getTelegramConfig();
  const errors = [];
  const guard = guardEmptyConfig(config);
  if (guard) return { groupSent: false, shawnSent: false, errors: guard.error };

  const staffNames = request.employeesOnDuty && request.employeesOnDuty.length
    ? request.employeesOnDuty.join(", ")
    : request.requesterName;
  let groupSent = false;
  let shawnSent = false;

  if (config.groupChatId) {
    const groupText = [
      `🏢 <b>RETURN TO OFFICE CONFIRMED</b>`,
      ``,
      `<b>Ref:</b> <code>${request.id}</code>`,
      `<b>Staff on Duty:</b> ${staffNames}`,
      `<b>Purpose / Destination:</b> ${request.reasonOrPurpose}${request.destination ? ` (${request.destination})` : ""}`,
      `<b>Departure Time:</b> ${request.timeOfDeparture || "Recorded"}`,
      `<b>Returned At:</b> <b>${returnTime}</b>`,
      notes ? `<b>Remarks:</b> ${notes}` : "",
      `<b>Status:</b> ✅ Record Closed & Attendance Reconciled`,
      `⚡ <i>Action recorded live via APA Web Management System</i>`,
    ].filter(Boolean).join("\n");
    const res = await sendTelegramMessage(config.botToken, config.groupChatId, groupText, "HTML");
    if (res.success) groupSent = true;
    else if (res.error) errors.push(`Staff Group: ${res.error}`);
  }

  if (config.shawnChatId) {
    const shawnText = [
      `🏢 <b>STAFF RETURN NOTIFICATION FOR MR. SHAWN</b>`,
      ``,
      `<b>Ref:</b> <code>${request.id}</code>`,
      `<b>Staff:</b> ${staffNames} (${request.position || "Staff"})`,
      `<b>Purpose:</b> ${request.reasonOrPurpose}`,
      `<b>Returned to Office:</b> <b>${returnTime}</b>`,
      notes ? `<b>Remarks:</b> ${notes}` : "",
      `<b>Status:</b> ✅ Returned on Same-Day (Closed)`,
      `⚡ <i>Recorded live by management via Web Portal</i>`,
    ].filter(Boolean).join("\n");
    const res = await sendTelegramMessage(config.botToken, config.shawnChatId, shawnText, "HTML");
    if (res.success) shawnSent = true;
    else if (res.error) errors.push(`Mr. Shawn Chat: ${res.error}`);
  }

  return { groupSent, shawnSent, errors };
}

async function dispatchDutyRequestAlert(request) {
  const config = await getTelegramConfig();
  const errors = [];
  const guard = guardEmptyConfig(config);
  if (guard) return { groupSent: false, shawnSent: false, errors: guard.error };

  const staffNames = request.employeesOnDuty && request.employeesOnDuty.length
    ? request.employeesOnDuty.join(", ")
    : request.requesterName;
  let groupSent = false;
  let shawnSent = false;

  // "Pending (Same-Day Policy)" is the literal the Telegram reply parser anchors
  // on, so it must stay byte-identical for genuinely pending records.
  const returnStatus = request.isDirectToHome
    ? "🏠 Direct to Home (17:00 Checkout Excused)"
    : request.isReturnPending
      ? "🟡 Pending (Same-Day Policy)"
      : `✅ Expected at ${request.timeOfReturn}`;
  const returnStatusShawn = request.isDirectToHome
    ? "🏠 Direct to Home (17:00 Checkout Excused)"
    : request.isReturnPending
      ? "🟡 Pending (Same-Day Policy)"
      : `✅ Set to ${request.timeOfReturn}`;
  const timingLine = request.isRetroactive
    ? `<b>Timing:</b> ⚠️ Retroactive — ${request.lateSubmissionReason ? `Justification: ${request.lateSubmissionReason}` : "within the 48h emergency grace period"}`
    : "";

  if (config.groupChatId) {
    const groupText = [
      `📋 <b>NEW DUTY OUTSIDE SUBMISSION (WEB PORTAL)</b>`,
      ``,
      `<b>Ref:</b> <code>${request.id}</code>`,
      `<b>Requester:</b> ${request.requesterName} (${request.position || "Staff"})`,
      `<b>Staff on Duty:</b> ${staffNames}`,
      `<b>Purpose:</b> ${request.reasonOrPurpose}`,
      request.destination ? `<b>Destination:</b> ${request.destination}` : "",
      `<b>Date:</b> ${request.date} | <b>Departure:</b> ${request.timeOfDeparture}`,
      `<b>Return Status:</b> ${returnStatus}`,
      timingLine,
      ``,
      `💡 <b>How to update Return Time upon coming back:</b>`,
      `Reply in this group with this example: (<code>Returned ${request.id} 17:30</code>) or (<code>Returned ${request.id} now</code>) or update via Web Portal`,
    ].filter(Boolean).join("\n");
    const res = await sendTelegramMessage(config.botToken, config.groupChatId, groupText, "HTML");
    if (res.success) groupSent = true;
    else if (res.error) errors.push(`Staff Group: ${res.error}`);
  }

  if (config.shawnChatId) {
    const shawnText = [
      `🔔 <b>[NEW DUTY OUTSIDE ALERT - WEB PORTAL]</b>`,
      ``,
      `<b>Ref:</b> <code>${request.id}</code>`,
      `<b>Requester:</b> ${request.requesterName} (${request.position || "Staff"})`,
      `<b>Staff on Duty:</b> ${staffNames}`,
      `<b>Purpose:</b> ${request.reasonOrPurpose}`,
      request.destination ? `<b>Destination:</b> ${request.destination}` : "",
      `<b>Date:</b> ${request.date} | <b>Departure:</b> ${request.timeOfDeparture}`,
      `<b>Return Status:</b> ${returnStatusShawn}`,
      timingLine,
      `<b>Missed Scans:</b> ${(request.missedFingerprintScans || []).join(", ") || "None"}`,
      ``,
      `<b>Approved Authority:</b> ${request.approvedBy}`,
    ].filter(Boolean).join("\n");
    const res = await sendTelegramMessage(config.botToken, config.shawnChatId, shawnText, "HTML");
    if (res.success) shawnSent = true;
    else if (res.error) errors.push(`Mr. Shawn Chat: ${res.error}`);
  }

  return { groupSent, shawnSent, errors };
}

// =============================================================================
// Poller
// =============================================================================

/**
 * Fetch + process new Telegram updates.
 * Returns { checked, imported, returnedCount, primed, events }.
 * events: [{type:'duty', request}|{type:'return', requestId, returnTime, senderName}|{type:'help'}]
 */
let isPolling = false;

async function pollOnce({ resetOffset = false } = {}) {
  // Only one poll can run at a time. Without this, a manual "Sync Now" can
  // overlap the background poller; both read the same Telegram offset and
  // re-process the same message, creating duplicate records + duplicate alerts.
  if (isPolling) {
    return { checked: 0, imported: 0, returnedCount: 0, events: [], skipped: true };
  }
  isPolling = true;
  try {
    return await pollOnceInner({ resetOffset });
  } finally {
    isPolling = false;
  }
}

async function pollOnceInner({ resetOffset = false } = {}) {
  const config = await getTelegramConfig();
  if (!config.isConnected || !config.botToken) {
    return { checked: 0, imported: 0, returnedCount: 0, events: [], error: "Telegram bot is not connected" };
  }

  // Boolean gate #2 (auto_sync): besides only scheduling ticks while enabled,
  // ALSO refuse to process/reply here — so one boolean stops the loop for
  // EVERY chat, even when pollOnce is called directly (manual sync, tests).
  if (!config.autoSync) {
    return { checked: 0, imported: 0, returnedCount: 0, events: [], skipped: true, error: "Telegram auto-sync is disabled" };
  }

  // Cross-process mutex (named GET_LOCK on the shared DB): if another backend
  // instance is already polling, skip this tick so the same Telegram updates
  // are never fetched/processed by two consumers at once.
  const gotLock = await acquirePollLock();
  if (!gotLock) {
    return { checked: 0, imported: 0, returnedCount: 0, events: [], skipped: true, error: "Poll lock held by another process" };
  }
  try {
    return await pollOnceInnerLocked(config, resetOffset);
  } finally {
    await releasePollLock();
  }
}

async function pollOnceInnerLocked(config, resetOffset = false) {
  let lastUpdateId = resetOffset ? 0 : await getLastUpdateId();

  // Priming pass: if we never synced, advance the offset without replaying
  // historical messages so the bot does not re-announce old requests.
  if (!resetOffset && lastUpdateId === 0) {
    const prime = await getTelegramUpdates(config.botToken, undefined);
    if (!prime.success || !prime.updates) {
      return { checked: 0, imported: 0, returnedCount: 0, events: [], error: prime.error };
    }
    const maxId = prime.updates.reduce((m, u) => Math.max(m, u.update_id || 0), 0);
    if (maxId > 0) await setLastUpdateId(maxId);
    await touchLastChecked();
    return { checked: prime.updates.length, imported: 0, returnedCount: 0, primed: true, events: [] };
  }

  const offset = lastUpdateId > 0 ? lastUpdateId + 1 : undefined;
  const res = await getTelegramUpdates(config.botToken, offset);
  if (!res.success || !res.updates) {
    return { checked: 0, imported: 0, returnedCount: 0, events: [], error: res.error };
  }

  const existingIds = await listExistingRequestIds();
  let importedCount = 0;
  let returnedCount = 0;
  let highestUpdateId = lastUpdateId;
  const events = [];

  // Remember any group/supergroup chats this bot is part of (feeds the
  // "group picker" in Telegram settings). Best-effort only — a failure here
  // must not freeze the offset and block message processing.
  try {
    await recordUpdatesChats(res.updates, botIdFromToken(config.botToken));
  } catch (err) {
    console.error("[telegram] recordUpdatesChats failed (non-fatal):", err && err.message);
  }

  for (const update of res.updates) {
    if (update.update_id > highestUpdateId) highestUpdateId = update.update_id;

    // One bad update must never abort the whole tick: if an exception escapes,
    // setLastUpdateId() below never runs, the offset stays frozen and Telegram
    // keeps re-delivering the same updates forever (the "success once, then
    // DUPLICATE replies on every poll" loop). Isolate each update so the
    // offset always advances past everything Telegram returned this tick.
    try {
    const msg = update.message || update.channel_post;
    if (!msg || !msg.text) continue;

    // Per-chat "already replied & handled" scope: Chat A records its own
    // marker and stops; Chat B records its own marker and stops — so a
    // re-delivered update can never duplicate in EITHER chat.
    const chatId = msg.chat && msg.chat.id != null ? String(msg.chat.id) : "";

    // Idempotency gate: if this exact update was already consumed for THIS
    // chat (duty row created from it, return confirmed, malformed rejected,
    // help replied, or flagged duplicate), do nothing — even a re-delivered
    // update must not write again, re-reply, or re-alert.
    if (await isUpdateHandled(update.update_id, chatId)) continue;

    // The SELECT above is only a fast path. Claiming with INSERT IGNORE is the
    // atomic gate: two processes cannot both handle (and reply to) one update.
    if (!await claimUpdateHandling(update.update_id, "processing", chatId)) continue;

    const sender = msg.from && msg.from.first_name
      ? `${msg.from.first_name}${msg.from.last_name ? " " + msg.from.last_name : ""}`
      : "Staff";
    const replyToText = msg.reply_to_message ? msg.reply_to_message.text : undefined;

    // 1. Full DUTY OUTSIDE REQUEST
    const parseResult = parseTelegramDutyText(msg.text, sender);
    if (parseResult.isValid && parseResult.data) {
      const d = parseResult.data;

      // Block duplicate requests: a requester can only have one active
      // (not-yet-returned) duty outside request at a time.
      const activeRow = await findActiveRequestByRequester(d.requesterName);
      if (activeRow) {
        if (msg.chat && msg.chat.id) {
          sendTelegramMessage(
            config.botToken,
            String(msg.chat.id),
            `⛔ <b>DUPLICATE DUTY OUTSIDE REQUEST</b>\n\n<b>Reason:</b> ${d.requesterName} already has an active duty outside request that has not been marked as returned yet.\n\n<b>Active Ref:</b> <code>${activeRow.id}</code>\n<b>Staff:</b> ${(activeRow.employeesOnDuty || []).join(", ")}\n<b>Departure:</b> ${activeRow.timeOfDeparture}\n\n🟡 <b>Status:</b> Pending Return\n\n💡 <i>To return, reply in this group with:\n(<code>Returned ${activeRow.id} 17:30</code>) or (<code>Returned ${activeRow.id} now</code>)\nThen you can submit a new request.</i>`,
            "HTML"
          ).catch(() => {});
        }
        events.push({ type: "duty_duplicate", sender, requesterName: d.requesterName, activeId: activeRow.id });
        await markUpdateHandled(update.update_id, "duplicate", chatId);
        continue;
      }

      const newId = generateRequestId(existingIds);
      const req = {
        id: newId,
        requesterName: d.requesterName,
        employeesOnDuty: d.employeesOnDuty,
        position: d.position,
        reasonOrPurpose: d.reasonOrPurpose,
        otherTeamsInvolved: d.otherTeamsInvolved,
        date: d.date || new Date().toISOString().split("T")[0],
        timeOfDeparture: d.timeOfDeparture,
        timeOfReturn: d.timeOfReturn,
        isReturnPending: d.isReturnPending,
        isDirectToHome: d.isDirectToHome,
        submissionTiming: d.submissionTiming,
        isRetroactive: d.isRetroactive,
        missedFingerprintScans: d.missedFingerprintScans,
        approvedBy: d.approvedBy || "Mr. Shawn (General Manager)",
      };

      await createRequest(req, { source: "telegram", actor: sender, telegramUpdateId: update.update_id });
      existingIds.add(newId);
      importedCount++;
      events.push({ type: "duty", request: req, sender });

      // Keep the literal "Pending (Same-Day Policy)" for genuinely pending
      // records: telegramParser.parseTelegramReturnText anchors reply detection
      // on it, so the wording must not drift.
      const returnStatusLine = req.isDirectToHome
? "🏠 Direct to Home (17:00 Checkout Excused)"
        : req.isReturnPending
          ? "🟡 Pending (Same-Day Policy)"
          : `✅ Expected at ${req.timeOfReturn}`;

      // Only prompt for a return-time update when the duty is still open. A
      // Direct to Home request is already closed at the excused 17:00 checkout,
      // so telling the user to reply back would be misleading.
      const returnUpdateHint = req.isDirectToHome
        ? "\n\n🏠 <i>Completed — no return update needed.</i>"
        : `\n\n💡 <b>To update Return Time when back:</b>\nReply in this group with this example:\n(<code>Returned ${newId} 17:30</code>) or (<code>Returned ${newId} now</code>)`;

      // Reply to group chat confirming registration
      if (msg.chat && msg.chat.id) {
        sendTelegramMessage(
          config.botToken,
          String(msg.chat.id),
          `✅ <b>DUTY OUTSIDE REGISTERED & VERIFIED</b>\n\n<b>Ref:</b> <code>${newId}</code>\n<b>Staff:</b> ${req.employeesOnDuty.join(", ")}\n<b>Purpose:</b> ${req.reasonOrPurpose}\n<b>Departure:</b> ${req.timeOfDeparture}\n<b>Return Status:</b> ${returnStatusLine}${req.isRetroactive ? "\n<b>Timing:</b> ⚠️ Retroactive — within the 48h emergency grace period" : ""}${returnUpdateHint}`,
          "HTML"
        ).catch(() => {});
      }
      // Private alert to Mr. Shawn
      if (config.shawnChatId) {
        sendTelegramMessage(
          config.botToken,
          config.shawnChatId,
          `🔔 <b>[NEW DUTY OUTSIDE ALERT]</b>\n\n<b>Ref:</b> <code>${newId}</code>\n<b>Requester:</b> ${req.requesterName} (${req.position})\n<b>Staff on Duty:</b> ${req.employeesOnDuty.join(", ")}\n<b>Purpose:</b> ${req.reasonOrPurpose}\n<b>Departure:</b> ${req.timeOfDeparture} | <b>Date:</b> ${req.date}\n<b>Return Status:</b> ${returnStatusLine}\n<b>Missed Scans:</b> ${(req.missedFingerprintScans || []).join(", ") || "None"}${req.isRetroactive ? "\n<b>Timing:</b> ⚠️ Retroactive — within the 48h emergency grace period" : ""}\n\n⚡ <i>Automatically Synced from Telegram Group & Logged in System</i>\n<b>Approved Authority:</b> Mr. Shawn (General Manager)`,
          "HTML"
        ).catch(() => {});
      }
      continue;
    }

    // Reject malformed duty requests: never save to database, reply with failure + correct format
    const lowerMsg = msg.text.toLowerCase();
    if (!parseResult.isValid && (lowerMsg.includes("duty outside") || lowerMsg.includes("request duty"))) {
      if (msg.chat && msg.chat.id) {
        const errText = parseResult.error || "Incorrect format";
        sendTelegramMessage(
          config.botToken,
          String(msg.chat.id),
          `❌ <b>DUTY OUTSIDE REGISTRATION FAILED</b>\n\n<b>Reason:</b> ${errText}\n\n<i>No record was saved. Please resend using the exact template below:</i>\n\n<code>DUTY OUTSIDE REQUEST\n1. Requester: Your Name\n2. Staff on Duty: Staff names, comma separated\n3. Position: Job Title\n4. Reason: Go to bank / Go to GDT / Go to meet GDT / Doing CFO tasks / Other\n5. Other Teams: None\n6. Date: YYYY-MM-DD\n7. Departure: 10:00\n8. Return: Pending (Will update upon return)\n9. Missed Scans: None\n10. Approved By: Mr. Shawn (General Manager)</code>\n\n💡 Type <b>how to fill</b> to get the full guide.`,
          "HTML"
        ).catch(() => {});
      }
      events.push({ type: "duty_rejected", sender, error: parseResult.error });
      await markUpdateHandled(update.update_id, "malformed", chatId);
      continue;
    }

    // 2. RETURN update
    const returnCheck = parseTelegramReturnText(msg.text, sender, replyToText);
    if (returnCheck.isReturn) {
      const target = await findTargetForTelegramReturn(returnCheck.reqId, sender);
      const returnTime = returnCheck.returnTime || new Date().toTimeString().slice(0, 5);

      if (target) {
        const updated = await updateReturn(target.id, returnTime, returnCheck.notes, "telegram", sender, update.update_id, chatId);
        returnedCount++;
        events.push({ type: "return", requestId: target.id, returnTime, senderName: sender, request: updated });

        if (msg.chat && msg.chat.id) {
          sendTelegramMessage(
            config.botToken,
            String(msg.chat.id),
            `🏢 <b>RETURN TO OFFICE CONFIRMED</b>\n\n${target.id ? `<b>Ref:</b> <code>${target.id}</code>\n` : ""}<b>Staff:</b> ${sender}\n<b>Returned At:</b> ${returnTime}\n<b>Status:</b> ✅ Record Closed & Reconciled`,
            "HTML"
          ).catch(() => {});
        }
        if (config.shawnChatId) {
          sendTelegramMessage(
            config.botToken,
            config.shawnChatId,
            `🏢 <b>STAFF RETURN NOTIFICATION FOR MR. SHAWN</b>\n\n${target.id ? `<b>Ref:</b> <code>${target.id}</code>\n` : ""}<b>Staff:</b> ${sender}\n<b>Returned to Office:</b> ${returnTime}\n<b>Status:</b> ✅ Returned on Same-Day (Record Closed)`,
            "HTML"
          ).catch(() => {});
        }
      } else {
        events.push({ type: "return_unassigned", senderName: sender, returnTime });
        if (msg.chat && msg.chat.id) {
          const errRef = returnCheck.reqId ? ` for <code>${returnCheck.reqId}</code>` : '';
          sendTelegramMessage(
            config.botToken,
            String(msg.chat.id),
            `⚠️ <b>RETURN NOT PROCESSED</b>\n\nStaff: ${sender}${errRef}\nReason: No active duty record found. It may have already been returned or the Ref ID does not exist.\n\n💡 <i>Check the Ref ID above and try again, or contact Admin.</i>`,
            "HTML"
          ).catch(() => {});
        }
      }
      // Consumed in this chat (return confirmed, or nothing to return) — never
      // process this update again in this chat even if Telegram re-delivers it.
      await markUpdateHandled(update.update_id, "return", chatId);
      continue;
    }

    // 3. Help / instruction inquiry
    if (isHelpOrInstructionInquiry(msg.text)) {
      if (msg.chat && msg.chat.id) {
        sendTelegramMessage(config.botToken, String(msg.chat.id), getInstructionMessage(), "HTML").catch(() => {});
      }
      events.push({ type: "help", sender });
      await markUpdateHandled(update.update_id, "help", chatId);
      continue;
    }
    } catch (err) {
      // A failed, unfinished claim must be retried on a later Telegram poll.
      // Completed requests use a different marker kind (or telegram_update_id)
      // and are therefore never released here.
      try { await releaseUpdateHandling(update.update_id, chatId); } catch (releaseErr) {
        console.error("[telegram] could not release failed update claim:", update.update_id, releaseErr && releaseErr.message);
      }
      console.error("[telegram] update failed, continuing to next:", update.update_id, err && err.message);
      events.push({ type: "error", updateId: update.update_id, error: (err && err.message) || String(err) });
    }
  }

  if (highestUpdateId > lastUpdateId) await setLastUpdateId(highestUpdateId);
  await touchLastChecked();

  return { checked: res.updates.length, imported: importedCount, returnedCount, events };
}

// =============================================================================
// Background poller (self-scheduling with exponential backoff on network errors)
// =============================================================================

let pollTimer = null;
let consecutiveFailures = 0;
const POLL_BASE_BACKOFF_MS = 6000;
const POLL_MAX_BACKOFF_MS = 60000;

// attempt #1 -> 6s, #2 -> 12s, #3 -> 24s, #4 -> 48s, #5+ -> capped 60s
function backoffMs(attempts) {
  return Math.min(POLL_BASE_BACKOFF_MS * Math.pow(2, attempts - 1), POLL_MAX_BACKOFF_MS);
}

function scheduleNext(delayMs) {
  pollTimer = setTimeout(async () => {
    await pollTick();
  }, delayMs);
  if (pollTimer.unref) pollTimer.unref();
}

async function pollTick() {
  try {
    const config = await getTelegramConfig();
    if (config.isConnected && config.autoSync) {
      const result = await pollOnce();
      // Another backend instance owns the shared database poll lock. That is
      // expected during a rolling deploy or when PM2 runs more than one
      // instance: it prevents the same Telegram update being handled twice.
      // Skip normally instead of reporting a false network failure/backoff.
      if (result && result.skipped) {
        consecutiveFailures = 0;
        scheduleNext(POLL_INTERVAL);
        return;
      }
      if (result && result.error) {
        consecutiveFailures += 1;
        const seconds = Math.round(backoffMs(consecutiveFailures) / 1000);
        console.error(`[Telegram] getUpdates network error: ${result.error} — retrying in ${seconds}s (failed attempt #${consecutiveFailures})`);
        scheduleNext(backoffMs(consecutiveFailures));
        return;
      }
    }
    consecutiveFailures = 0;
    scheduleNext(POLL_INTERVAL);
  } catch (err) {
    consecutiveFailures += 1;
    const seconds = Math.round(backoffMs(consecutiveFailures) / 1000);
    console.error(`[Telegram] poller error: ${describeError(err)} — retrying in ${seconds}s (failed attempt #${consecutiveFailures})`);
    scheduleNext(backoffMs(consecutiveFailures));
  }
}

function startPoller() {
  if (pollTimer) return;
  console.log(`[telegram poller] started (every ${POLL_INTERVAL}ms)`);
  scheduleNext(POLL_INTERVAL);
}

function stopPoller() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

module.exports = {
  testBotToken,
  sendTelegramMessage,
  getTelegramUpdates,
  discoverBotGroups,
  dispatchReturnAlert,
  dispatchDutyRequestAlert,
  pollOnce,
  startPoller,
  stopPoller,
};
