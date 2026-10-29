import React, { useCallback, useEffect, useState } from 'react';
import {
  UserCog, Users, Plus, X, RefreshCw, KeyRound, ShieldCheck,
  UserCheck, AlertCircle, CheckCircle2, Eye, EyeOff, Ban, Pencil, ChevronLeft, ChevronRight,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import { ApiAuthError } from '../services/api';
import type { ManagedUser } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

interface StaffAccountsModalProps {
  onClose: () => void;
  currentUserId?: number;
  onSessionExpired?: () => void;
  /** Shown after a create/reset so the password can be handed over verbatim. */
  onToast?: (message: string) => void;
}

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  manager: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  hr: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  staff: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

/**
 * Account administration for the register. Staff logins are created here rather
 * than seeded by hand, so the GM is the only party who can mint portal access.
 * The API rejects every call from a non-privileged session regardless of what
 * this screen shows.
 */
export const StaffAccountsModal: React.FC<StaffAccountsModalProps> = ({ onClose, onToast, onSessionExpired, currentUserId }) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Create form
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('staff');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  // Password reset, per user id
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [visibleResetPasswordFor, setVisibleResetPasswordFor] = useState<number | null>(null);
  const [visibleSavedPasswordIds, setVisibleSavedPasswordIds] = useState<Set<number>>(() => new Set());
  const [recentlyResetPasswords, setRecentlyResetPasswords] = useState<Record<number, string>>({});
  const [revealedPasswords, setRevealedPasswords] = useState<Record<number, string>>({});
  const [visibleRevealedPasswordIds, setVisibleRevealedPasswordIds] = useState<Set<number>>(() => new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState('staff');
  const [editError, setEditError] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.listUsers();
      setUsers(res.users || []);
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(users.length / 5))));
  }, [users.length]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    setCreating(true);
    try {
      await api.createUser({ username, displayName, password, role });
      onToast?.(`Account "${username}" created — hand the password over now.`);
      setUsername('');
      setDisplayName('');
      setPassword('');
      setRole('staff');
      setShowForm(false);
      setPage(1);
      await load();
    } catch (err: any) {
      setFormError(err?.message || 'Could not create the account.');
    } finally {
      setCreating(false);
    }
  };

  const handleReset = async (user: ManagedUser) => {
    setResetError('');
    if (resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }
    setBusyId(user.id);
    const newPassword = resetPassword;
    try {
      await api.updateUser(user.id, { password: newPassword });
      setRecentlyResetPasswords((current) => ({ ...current, [user.id]: newPassword }));
      setVisibleSavedPasswordIds((current) => new Set(current).add(user.id));
      onToast?.(`Password reset for "${user.username}". View the new password on their row before closing this list.`);
      setResetPassword('');
      setResettingId(null);
      await load();
    } catch (err: any) {
      if (err instanceof ApiAuthError) {
        onSessionExpired?.();
        setResetError('Your session expired. Sign in again, then retry; this password was not changed.');
        return;
      }
      setResetError(err?.message || 'Could not reset the password.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (user: ManagedUser) => {
    setBusyId(user.id);
    try {
      await api.updateUser(user.id, { isActive: !user.isActive });
      onToast?.(
        user.isActive
          ? `"${user.username}" deactivated and signed out everywhere.`
          : `"${user.username}" reactivated.`
      );
      await load();
    } catch (err: any) {
      setLoadError(err?.message || 'Could not update the account.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await api.deleteUser(deleteTarget.id);
      setUsers((current) => current.filter((user) => user.id !== deleteTarget.id));
      onToast?.(`Account "${deleteTarget.username}" deleted.`);
      setDeleteTarget(null);
    } catch (err: any) {
      setLoadError(err?.message || 'Could not delete the account.');
    } finally {
      setBusyId(null);
    }
  };

  const beginEdit = (user: ManagedUser) => {
    setEditingId(user.id);
    setEditUsername(user.username);
    setEditDisplayName(user.displayName);
    setEditRole(user.role);
    setEditError('');
  };

  const handleEdit = async (user: ManagedUser) => {
    setEditError('');
    const cleanUsername = editUsername.trim().toLowerCase();
    const cleanDisplayName = editDisplayName.trim();
    if (!/^[a-z0-9._@-]{3,64}$/.test(cleanUsername)) {
      setEditError('Username must be 3-64 characters (letters, numbers, . _ @ -).');
      return;
    }
    if (!cleanDisplayName || cleanDisplayName.length > 120) {
      setEditError('Display name must be 1-120 characters.');
      return;
    }
    setBusyId(user.id);
    try {
      await api.updateUser(user.id, {
        username: cleanUsername,
        displayName: cleanDisplayName,
        role: editRole,
      });
      onToast?.(`Account "${cleanUsername}" updated.`);
      setEditingId(null);
      await load();
    } catch (err: any) {
      setEditError(err?.message || 'Could not update the account.');
    } finally {
      setBusyId(null);
    }
  };

  const inputCls =
    'w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-colors placeholder:text-slate-600';
  const labelCls = 'block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1';

  const sorted = [...users].sort((a, b) => {
    const order = ['admin', 'manager', 'hr', 'staff'];
    const diff = order.indexOf(a.role) - order.indexOf(b.role);
    return diff !== 0 ? diff : a.displayName.localeCompare(b.displayName);
  });
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageUsers = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <UserCog className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Staff Accounts</h2>
              <p className="text-[11px] text-slate-400">
                Portal logins and their access level
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={load}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {loadError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}

          {/* Create form */}
          {showForm ? (
            <form onSubmit={handleCreate} className="p-4 rounded-xl bg-slate-950/60 border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  New Portal Login
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormError('');
                  }}
                  className="text-slate-400 hover:text-white text-[11px]"
                >
                  Cancel
                </button>
              </div>

              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px]">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Full Name</label>
                  <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Sok Mouy" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Username</label>
                  <input required value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="e.g. sok.mouy" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Temporary Password</label>
                  <div className="relative">
                    <input required type={showPasswords ? 'text' : 'password'} value={password}
                      onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters"
                      className={`${inputCls} pr-9`} />
                    <button type="button" onClick={() => setShowPasswords(!showPasswords)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300">
                      {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Access Level</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                    <option value="staff" className="bg-slate-950">Staff — submit only</option>
                    <option value="hr" className="bg-slate-950">HR — full register</option>
                    <option value="manager" className="bg-slate-950">Manager — full register</option>
                    <option value="admin" className="bg-slate-950">Admin — full register</option>
                  </select>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 leading-relaxed">
                Staff accounts can only file their own duty outside request and confirm their own
                return. They cannot view the register, edit others' records, or reach the Telegram
                configuration. There is no self-signup — every account is created here.
              </p>

              <button type="submit" disabled={creating}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition-all">
                {creating ? 'Creating...' : 'Create Account'}
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              New Portal Login
            </button>
          )}

          {/* Account list */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/60 border-b border-slate-800">
              <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                Accounts
              </span>
              <span className="text-[11px] text-slate-500">{users.length} total · new passwords show after reset</span>
            </div>

            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">Loading accounts...</div>
            ) : sorted.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No accounts yet. Create the first portal login above.
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {pageUsers.map((u) => (
                  <li key={u.id} className="p-3.5 hover:bg-slate-950/40 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${ROLE_STYLES[u.role] || ROLE_STYLES.staff}`}>
                            {u.role}
                          </span>
                          <span className="text-xs font-semibold text-white truncate">
                            {u.displayName}
                          </span>
                          {u.mustChangePassword && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              CHANGE PASSWORD ON LOGIN
                            </span>
                          )}
                          {!u.isActive && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                              DEACTIVATED
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          @{u.username}
                          {u.staffName ? ` · linked: ${u.staffName}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {resettingId === u.id ? (
                          <div className="flex items-center gap-1.5">
                            <div className="relative">
                              <input
                                autoFocus
                                type={visibleResetPasswordFor === u.id ? 'text' : 'password'}
                                value={resetPassword}
                                onChange={(e) => setResetPassword(e.target.value)}
                                placeholder="New password"
                                className="w-32 px-2 pr-8 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-[11px] focus:outline-hidden focus:border-amber-500"
                              />
                              <button
                                type="button"
                                onClick={() => setVisibleResetPasswordFor((visibleId) => visibleId === u.id ? null : u.id)}
                                className="absolute inset-y-0 right-0 px-2 text-slate-500 hover:text-slate-200"
                                title={visibleResetPasswordFor === u.id ? 'Hide new password' : 'Show new password'}
                              >
                                {visibleResetPasswordFor === u.id ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </div>
                            <button
                              onClick={() => handleReset(u)}
                              disabled={busyId === u.id}
                              className="px-2 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-[10px]"
                            >
                              Set
                            </button>
                            <button
                              onClick={() => {
                                setResettingId(null);
                                setResetPassword('');
                                setResetError('');
                                setVisibleResetPasswordFor(null);
                              }}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : recentlyResetPasswords[u.id] !== undefined ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-emerald-300">New password</span>
                            <div className="relative">
                              <input
                                readOnly
                                type={visibleSavedPasswordIds.has(u.id) ? 'text' : 'password'}
                                value={recentlyResetPasswords[u.id]}
                                aria-label="New password, shown once after reset"
                                className="w-32 px-2 pr-8 py-1.5 bg-slate-950 border border-emerald-700/60 rounded-lg text-white text-[11px]"
                              />
                              <button
                                type="button"
                                onClick={() => setVisibleSavedPasswordIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(u.id)) next.delete(u.id);
                                  else next.add(u.id);
                                  return next;
                                })}
                                className="absolute inset-y-0 right-0 px-2 text-slate-500 hover:text-slate-200"
                                title={visibleSavedPasswordIds.has(u.id) ? 'Hide new password' : 'Show new password'}
                              >
                                {visibleSavedPasswordIds.has(u.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </div>
                            <button
                              onClick={() => {
                                setRecentlyResetPasswords((current) => {
                                  const next = { ...current };
                                  delete next[u.id];
                                  return next;
                                });
                                setVisibleSavedPasswordIds((current) => {
                                  const next = new Set(current);
                                  next.delete(u.id);
                                  return next;
                                });
                              }}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                              title="Dismiss one-time password view"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setResettingId(u.id);
                                setResetPassword('');
                                setResetError('');
                                setVisibleResetPasswordFor(null);
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-300 rounded-lg hover:bg-slate-800 transition-colors"
                              title="Reset password again"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setResettingId(u.id);
                                setResetPassword('');
                                setResetError('');
                                setVisibleResetPasswordFor(null);
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-300 rounded-lg hover:bg-slate-800 transition-colors"
                              title="Reset password"
                              aria-label={`Reset password for ${u.username}`}
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            {revealedPasswords[u.id] !== undefined && visibleRevealedPasswordIds.has(u.id) && (
                              <input readOnly type="text" value={revealedPasswords[u.id]} aria-label={`Password for ${u.username}`} className="w-32 px-2 py-1.5 bg-slate-950 border border-emerald-700/60 rounded-lg text-white text-[11px]" />
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                if (visibleRevealedPasswordIds.has(u.id)) {
                                  setVisibleRevealedPasswordIds((current) => { const next = new Set(current); next.delete(u.id); return next; });
                                  return;
                                }
                                try {
                                  const result = revealedPasswords[u.id] !== undefined ? { password: revealedPasswords[u.id] } : await api.revealUserPassword(u.id);
                                  setRevealedPasswords((current) => ({ ...current, [u.id]: result.password }));
                                  setVisibleRevealedPasswordIds((current) => new Set(current).add(u.id));
                                  setLoadError('');
                                } catch (err: any) {
                                  setLoadError(err?.message || 'Could not reveal password.');
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-emerald-300 rounded-lg hover:bg-slate-800 transition-colors"
                              title={visibleRevealedPasswordIds.has(u.id) ? 'Hide password' : 'Reveal password'}
                              aria-label={`${visibleRevealedPasswordIds.has(u.id) ? 'Hide' : 'Reveal'} password for ${u.username}`}
                            >
                              {visibleRevealedPasswordIds.has(u.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        )}

                        <button
                          onClick={() => beginEdit(u)}
                          className="p-1.5 text-slate-400 hover:text-sky-300 rounded-lg hover:bg-slate-800 transition-colors"
                          title="Edit user"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={busyId === u.id}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                            u.isActive
                              ? 'text-slate-400 hover:text-rose-300 hover:bg-rose-950/40'
                              : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40'
                          }`}
                          title={u.isActive ? 'Deactivate account' : 'Reactivate account'}
                        >
                          {u.isActive ? <Ban className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteTarget(u)}
                          disabled={u.id === currentUserId || busyId === u.id}
                          className="p-1.5 text-slate-400 hover:text-rose-300 rounded-lg hover:bg-rose-950/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={u.id === currentUserId ? 'Cannot delete the signed-in account' : 'Delete user'}
                          aria-label={`Delete user ${u.username}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {resetError && resettingId === u.id && (
                      <p className="mt-1.5 text-[10px] text-rose-300">{resetError}</p>
                    )}
                    {editingId === u.id && (
                      <div className="mt-3 p-3 rounded-lg border border-slate-700 bg-slate-950/60 space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            placeholder="Display name"
                            aria-label="Display name"
                            className="px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-[11px] focus:outline-hidden focus:border-sky-500"
                          />
                          <input
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            placeholder="Username"
                            aria-label="Username"
                            className="px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-[11px] focus:outline-hidden focus:border-sky-500"
                          />
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            aria-label="Access level"
                            className="px-2.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-[11px] focus:outline-hidden focus:border-sky-500"
                          >
                            <option value="staff">Staff</option>
                            <option value="hr">HR</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        {editError && <p className="text-[10px] text-rose-300">{editError}</p>}
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => { setEditingId(null); setEditError(''); }}
                            className="px-2.5 py-1.5 text-slate-300 hover:text-white text-[10px] rounded-lg hover:bg-slate-800"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleEdit(u)}
                            disabled={busyId === u.id}
                            className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-[10px] rounded-lg"
                          >
                            {busyId === u.id ? 'Saving…' : 'Save user'}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!loading && sorted.length > 0 && (
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/40 border-t border-slate-800">
                <span className="text-[10px] text-slate-500">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] text-slate-400">Page {page} of {pageCount}</span>
                  <button
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={page >= pageCount}
                    className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Policy footer */}
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-200/80 leading-relaxed">
              <strong className="text-amber-300">3-Strike accountability:</strong> the staff portal
              is the record of truth for a duty movement. Hand out credentials individually and ask
              staff to file <em>before</em> they leave, because a late or missing request is what
              generates a strike. Resetting a password or deactivating an account signs that person
              out of every device immediately.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Changes take effect immediately
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete this user?"
        message={deleteTarget ? <>Permanently delete <strong>@{deleteTarget.username}</strong>? This removes their portal account and signs them out.</> : undefined}
        confirmLabel="Delete user"
        isBusy={deleteTarget !== null && busyId === deleteTarget.id}
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
