import { DutyOutsideRequest } from '../types';

// Lightweight backend API client. All data persistence (requests, telegram
// config) is owned by the Node backend; the browser only talks to /api.

// In dev the Vite proxy forwards '/api' to the local backend, so VITE_API_BASE
// stays the relative path and the request never leaves the origin. In a build
// the bundle is served statically, so VITE_API_BASE is the absolute server API
// for that app. The value comes from .env.development or .env.production.
const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) || '/api';

interface ApiErrorBody {
  error?: string;
}

// Shared request activity store. The fetch wrapper updates it, so every API
// call can use one consistent full-screen loading indicator.
let activeRequestCount = 0;
const loadingListeners = new Set<() => void>();

const notifyLoadingListeners = () => loadingListeners.forEach((listener) => listener());

export const subscribeToApiLoading = (listener: () => void) => {
  loadingListeners.add(listener);
  return () => loadingListeners.delete(listener);
};

export const isApiLoading = () => activeRequestCount > 0;

/** Thrown when the backend rejects the session (expired / missing). */
export class ApiAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
  }
}

export interface LoginUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  staffId?: number | null;
  mustChangePassword?: boolean;
}

/** Roles that may use the full executive register. Staff get the portal. */
export const PRIVILEGED_ROLES = ['admin', 'manager', 'hr'];

export const isPrivilegedRole = (role: string | null | undefined) =>
  !!role && PRIVILEGED_ROLES.includes(role);

export interface ManagedUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  staffId: number | null;
  staffName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt?: string;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  expiresAt?: string;
  user?: LoginUser;
  error?: string;
}

export interface SessionCheckResult {
  authenticated: boolean;
  user: LoginUser;
}

export interface TelegramConfigPayload {
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

export interface TelegramBotGroup {
  id: string;
  title: string;
  username: string;
  type: string;
  lastSeenAt?: string;
}

export interface TelegramPollResult {
  checked: number;
  imported: number;
  returnedCount: number;
  primed?: boolean;
  error?: string;
  events: Array<{
    type: 'duty' | 'return' | 'return_unassigned' | 'help' | 'duplicate';
    request?: DutyOutsideRequest;
    requestId?: string;
    returnTime?: string;
    sender?: string;
    senderName?: string;
  }>;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

  // Merge rather than replace: spreading options straight over `headers` would
  // drop Content-Type whenever a call adds its own header, and express.json()
  // would then never parse the body.
  const { headers: extraHeaders, ...restOptions } = options || {};
  const headers = { ...baseHeaders, ...(extraHeaders as Record<string, string> | undefined) };

  activeRequestCount += 1;
  notifyLoadingListeners();

  try {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...restOptions,
      headers,
    });
  } catch {
    throw new Error('Fetch failed — could not reach the server. Please check your internet connection and try again.');
  }
  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body && body.error) message = body.error;
    } catch {
      // keep default message
    }
    if (res.status === 401) throw new ApiAuthError(message, res.status);
    throw new Error(message);
  }
  return res.json() as Promise<T>;
  } finally {
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    notifyLoadingListeners();
  }
}

export const api = {
  // -- Health ------------------------------------------------
  health: () => request<{ ok: boolean; db: string }>('/health'),

  // -- Public staff submission (no session required) ---------
  // Used by the "Staff Request (No Login Required)" tab. Goes to its own
  // route because the register endpoints are privileged-only; the backend
  // applies a fixed approver, field allowlists, quotas and an IP rate limit.
  getPublicChallenge: () =>
    request<{ token: string; expiresAt: string }>('/public/challenge'),

  submitPublicRequest: (body: Record<string, unknown>) =>
    request<{ request: DutyOutsideRequest }>('/public/requests', {
      method: 'POST',
      // Custom header: a cross-origin browser fetch cannot send this without a
      // CORS preflight, and no CORS is configured on this API.
      headers: { 'X-Portal-Submit': '1' },
      body: JSON.stringify(body),
    }),

  // -- Requests ----------------------------------------------
  // Staff dashboard history. The backend scopes this to the session identity.
  getMyRequests: () => request<{ requests: DutyOutsideRequest[] }>('/my/requests'),

  getRequests: (filters?: { month?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.month) params.set('month', filters.month);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString();
    return request<{ requests: DutyOutsideRequest[] }>(`/requests${qs ? `?${qs}` : ''}`);
  },

  createRequest: (body: Partial<DutyOutsideRequest> & { requesterName: string }) =>
    request<{ request: DutyOutsideRequest }>('/requests', { method: 'POST', body: JSON.stringify(body) }),

  updateRequest: (id: string, patch: Partial<DutyOutsideRequest>) =>
    request<{ request: DutyOutsideRequest }>(`/requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  confirmReturn: (id: string, returnTime: string, notes?: string) =>
    request<{ request: DutyOutsideRequest }>(`/requests/${encodeURIComponent(id)}/return`, {
      method: 'POST',
      body: JSON.stringify({ returnTime, notes }),
    }),

  deleteRequest: (id: string) =>
    request<{ ok: boolean }>(`/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  deleteAllRequests: () =>
    request<{ ok: boolean; message: string }>('/requests', { method: 'DELETE' }),

  // -- Telegram ----------------------------------------------
  getTelegramConfig: () => request<{ config: TelegramConfigPayload }>('/telegram/config'),

  saveTelegramConfig: (config: TelegramConfigPayload) =>
    request<{ config: TelegramConfigPayload }>('/telegram/config', { method: 'PUT', body: JSON.stringify(config) }),

  testBotToken: (token: string) =>
    request<{ success: boolean; bot?: any; error?: string }>('/telegram/test', { method: 'POST', body: JSON.stringify({ token }) }),

  botGroups: (token: string) =>
    request<{ success: boolean; groups?: TelegramBotGroup[]; error?: string }>('/telegram/botGroups', { method: 'POST', body: JSON.stringify({ token }) }),

  sendTelegramMessage: (payload: { token: string; chatId: string; text: string; parseMode?: 'Markdown' | 'HTML' }) =>
    request<{ success: boolean; messageId?: number; error?: string }>('/telegram/send', { method: 'POST', body: JSON.stringify(payload) }),

  getTelegramUpdates: (offset?: number) =>
    request<{ success: boolean; updates?: any[]; error?: string }>(`/telegram/updates${offset ? `?offset=${offset}` : ''}`),

  pollTelegram: (resetOffset?: boolean) =>
    request<TelegramPollResult>('/telegram/poll', { method: 'POST', body: JSON.stringify({ resetOffset: !!resetOffset }) }),

  notifyTelegramDuty: (req: Partial<DutyOutsideRequest>) =>
    request<{ groupSent: boolean; shawnSent: boolean; errors: string[] }>('/telegram/notifyDuty', { method: 'POST', body: JSON.stringify({ request: req }) }),

  notifyTelegramReturn: (req: Partial<DutyOutsideRequest>, returnTime: string, notes?: string) =>
    request<{ groupSent: boolean; shawnSent: boolean; errors: string[] }>('/telegram/notifyReturn', {
      method: 'POST',
      body: JSON.stringify({ request: req, returnTime, notes }),
    }),

  // -- Auth --------------------------------------------------
  login: (username: string, password: string) =>
    request<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Validates the httpOnly session cookie and returns the logged-in user.
  sessionCheck: () => request<SessionCheckResult>('/session/check'),

  // -- Account provisioning (privileged only) --------------------
  listUsers: () => request<{ users: ManagedUser[] }>('/auth/users'),
  revealUserPassword: (id: number) => request<{ password: string }>(`/auth/users/${id}/password`),

  createUser: (body: { username: string; displayName: string; password: string; role?: string; staffId?: number | null }) =>
    request<{ ok: boolean; id: number; username: string; role: string }>('/auth/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateUser: (id: number, patch: { username?: string; displayName?: string; password?: string; isActive?: boolean; role?: string }) =>
    request<{ ok: boolean }>(`/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteUser: (id: number) => request<{ ok: boolean }>(`/auth/users/${id}`, { method: 'DELETE' }),
};
