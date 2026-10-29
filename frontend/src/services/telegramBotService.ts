// Telegram Bot Live Integration Service — Backend Proxy
// The Node backend owns Telegram config storage, polling, parsing and alerts.
// This module keeps the same public API as before so the UI components work
// unchanged, but persists through the backend (/api/telegram/*).

import { api, TelegramConfigPayload, TelegramBotGroup } from './api';

export interface TelegramConfig {
  botToken: string;
  botUsername: string;
  botDisplayName: string;
  groupChatId: string;
  groupTitle?: string;
  shawnChatId: string;
  isConnected: boolean;
  autoSync: boolean;
  lastCheckedAt?: string;
}

const DEFAULT_CONFIG: TelegramConfig = {
  botToken: '',
  botUsername: '',
  botDisplayName: '',
  groupChatId: '',
  groupTitle: '',
  shawnChatId: '',
  isConnected: false,
  autoSync: true,
  lastCheckedAt: undefined
};

// In-memory cache only — the authoritative copy lives in the backend
// (telegram_config table), loaded via refreshTelegramConfigFromServer().
let memoryConfig: TelegramConfig | null = null;

const cacheConfig = (config: TelegramConfig) => {
  memoryConfig = { ...config };
};

/**
 * Synchronous in-memory read so the UI can render immediately. The
 * authoritative copy lives in the backend (telegram_config table).
 */
export const getTelegramConfig = (): TelegramConfig => {
  if (memoryConfig) return { ...memoryConfig };
  return { ...DEFAULT_CONFIG };
};

/** Push a config snapshot to the backend (authoritative store). */
export const syncTelegramConfigToServer = async (config: TelegramConfig): Promise<TelegramConfigPayload> => {
  const { config: saved } = await api.saveTelegramConfig({
    botToken: config.botToken,
    botUsername: config.botUsername,
    botDisplayName: config.botDisplayName,
    groupChatId: config.groupChatId,
    groupTitle: config.groupTitle || '',
    shawnChatId: config.shawnChatId,
    isConnected: config.isConnected,
    autoSync: config.autoSync,
    lastCheckedAt: config.lastCheckedAt
  });
  return saved;
};

/** Refresh the local cache from the backend (use when the modal opens). */
export const refreshTelegramConfigFromServer = async (): Promise<TelegramConfig> => {
  try {
    const { config } = await api.getTelegramConfig();
    const merged: TelegramConfig = {
      ...getTelegramConfig(),
      ...config,
      isConnected: !!config.isConnected,
      autoSync: config.autoSync !== false
    };
    cacheConfig(merged);
    return merged;
  } catch (e) {
    console.warn('Could not refresh Telegram config from backend, using cache', e);
    return getTelegramConfig();
  }
};

export const saveTelegramConfig = (config: TelegramConfig): void => {
  cacheConfig(config);
  // Fire-and-forget push to the backend so the poller picks it up.
  syncTelegramConfigToServer(config).catch((e) =>
    console.error('Error syncing Telegram config to backend', e)
  );
};

/**
 * Test Bot Token — proxied to the backend (validates against Telegram API).
 */
export const testBotToken = async (token: string): Promise<{ success: boolean; bot?: any; error?: string }> => {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { success: false, error: 'Bot token cannot be empty' };
  }
  return api.testBotToken(cleanToken);
};

/**
 * List groups the bot is a member of — proxied to the backend.
 */
export const botGroups = async (
  token: string
): Promise<{ success: boolean; groups?: TelegramBotGroup[]; error?: string }> => {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { success: false, error: 'Token required' };
  }
  return api.botGroups(cleanToken);
};

/**
 * Send a message to any Telegram Chat ID — proxied to the backend.
 */
export const sendTelegramMessage = async (
  token: string,
  chatId: string,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'HTML',
  replyMarkup?: any
): Promise<{ success: boolean; messageId?: number; error?: string }> => {
  const cleanToken = token.trim();
  const cleanChatId = chatId.trim();
  if (!cleanToken || !cleanChatId) {
    return { success: false, error: 'Bot token and Chat ID are required' };
  }
  return api.sendTelegramMessage({ token: cleanToken, chatId: cleanChatId, text, parseMode });
};

/**
 * Dispatch Return to Office alerts — the backend reads its own config and posts
 * to the Staff Group + Mr. Shawn's 1-on-1 chat.
 */
export const dispatchTelegramReturnAlert = async (
  request: {
    id: string;
    requesterName: string;
    employeesOnDuty: string[];
    position?: string;
    reasonOrPurpose: string;
    destination?: string;
    date?: string;
    timeOfDeparture?: string;
  },
  returnTime: string,
  notes?: string
): Promise<{ groupSent: boolean; shawnSent: boolean; errors: string[] }> => {
  return api.notifyTelegramReturn(request, returnTime, notes);
};

/**
 * Dispatch New Duty Request alert — the backend reads its own config and posts
 * to the Staff Group + Mr. Shawn's 1-on-1 chat.
 */
export const dispatchTelegramDutyRequestAlert = async (
  request: {
    id: string;
    requesterName: string;
    employeesOnDuty: string[];
    position?: string;
    reasonOrPurpose: string;
    destination?: string;
    otherTeamsInvolved?: string;
    date: string;
    timeOfDeparture: string;
    timeOfReturn?: string | null;
    isReturnPending: boolean;
    missedFingerprintScans?: string[];
    approvedBy: string;
  }
): Promise<{ groupSent: boolean; shawnSent: boolean; errors: string[] }> => {
  return api.notifyTelegramDuty(request);
};

/**
 * Fetch recent updates from Telegram — proxied to the backend.
 */
export const getTelegramUpdates = async (
  token: string,
  offset?: number
): Promise<{ success: boolean; updates?: any[]; error?: string }> => {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { success: false, error: 'Token required' };
  }
  return api.getTelegramUpdates(offset);
};

/**
 * Poll the Telegram group for new messages. The backend performs parsing,
 * persistence and alert dispatch; the returned events are replayed into the
 * same callbacks the UI previously used so components work unchanged.
 */
export const syncTelegramGroupUpdates = async (
  onNewRequestFound?: (reqData: any) => void,
  onReturnUpdated?: (reqId: string | undefined, returnTime: string, senderName?: string) => void,
  resetOffset: boolean = false,
  onDuplicate?: (requestId: string, senderName?: string) => void
): Promise<{ checked: number; imported: number; returnedCount: number; error?: string }> => {
  const config = getTelegramConfig();
  if (!config.isConnected || !config.botToken) {
    return { checked: 0, imported: 0, returnedCount: 0, error: 'Telegram bot is not connected' };
  }

  try {
    const result = await api.pollTelegram(!!resetOffset);
    for (const event of result.events || []) {
      if (event.type === 'duty' && event.request && onNewRequestFound) {
        onNewRequestFound(event.request);
      } else if (event.type === 'return' && event.requestId && onReturnUpdated && event.returnTime) {
        onReturnUpdated(event.requestId, event.returnTime, event.senderName);
      } else if (event.type === 'duplicate' && event.requestId && onDuplicate) {
        onDuplicate(event.requestId, event.sender);
      }
    }
    return {
      checked: result.checked,
      imported: result.imported,
      returnedCount: result.returnedCount || 0,
      error: result.error
    };
  } catch (err: any) {
    return { checked: 0, imported: 0, returnedCount: 0, error: err.message || 'Error syncing Telegram updates' };
  }
};