import React, { useCallback, useEffect, useState } from 'react';
import { Lock, ShieldCheck, Eye, EyeOff, User, KeyRound, AlertCircle, Send } from 'lucide-react';
import { api, ApiAuthError } from '../services/api';
import type { LoginUser } from '../services/api';
import { StaffRequestForm } from './StaffRequestForm';
import type { StaffRequestPayload } from './StaffRequestForm';
import { DutyOutsideRequest, FIXED_OFFICIAL_APPROVER } from '../types';
import { APP_BRAND, APP_NAME } from '../config/app';

interface LoginScreenProps {
  onLoginSuccess: (user: LoginUser) => void;
}

type Tab = 'staff_request' | 'executive_login';

/**
 * Public landing screen with two tabs:
 *   - "Staff Request (No Login Required)": anyone can file their own duty
 *     outside from here and get a gate pass ID immediately.
 *   - "Executive / Staff Login": sign in with an account. Staff land on their
 *     portal, executives land on the register.
 */
export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState<Tab>('staff_request');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Single-use token for the public tab: the backend refuses a submission that
  // arrives without one, or that replays an old one. Fetched when the tab is
  // opened and refreshed whenever it lapses.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeFailed, setChallengeFailed] = useState(false);

  const refreshChallenge = useCallback(async () => {
    try {
      const res = await api.getPublicChallenge();
      setChallengeToken(res.token);
      setChallengeFailed(false);
    } catch {
      setChallengeToken(null);
      setChallengeFailed(true);
    }
  }, []);

  useEffect(() => {
    refreshChallenge();
  }, [refreshChallenge]);

  const handlePublicSubmit = async (p: StaffRequestPayload): Promise<DutyOutsideRequest> => {
    try {
      const res = await api.submitPublicRequest({
        requesterName: p.requesterName,
        department: p.department,
        reasonCategory: p.reasonCategory,
        reasonDetail: p.reasonDetail,
        destination: p.destination,
        position: p.position,
        date: p.date,
        timeOfDeparture: p.timeOfDeparture,
        timeOfReturn: p.timeOfReturn,
        isReturnPending: p.isReturnPending,
        isDirectToHome: p.isDirectToHome,
        lateSubmissionReason: p.lateSubmissionReason,
        missedFingerprintScans: p.missedFingerprintScans,
        challengeToken: p.challengeToken,
        formElapsedMs: p.formElapsedMs,
        company: p.company,
      });
      // One token per submission: grab the next one immediately.
      refreshChallenge();
      return res.request;
    } catch (err) {
      if (err instanceof ApiAuthError || (err as Error)?.message?.includes('expired')) {
        refreshChallenge();
      }
      throw err;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    setIsLoading(true);

    try {
      const res = await api.login(cleanUser, cleanPass);
      if (res.success && res.user) {
        // The session token is stored server-side in an httpOnly cookie — the
        // browser never persists any auth key itself. The role travels with the
        // user so App can route staff to the portal and everyone else to the
        // executive register.
        onLoginSuccess(res.user);
        return;
      }
      setError(res.error || 'Invalid username or password.');
    } catch (err) {
      if (err instanceof ApiAuthError) {
        setError(err.message || 'Invalid username or password.');
      } else {
        setError('⚠ Backend unreachable — please ensure the backend server is running and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-3 sm:px-6 lg:px-8 py-8 sm:py-12 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl relative z-10">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-500 shadow-xl shadow-amber-600/20 text-white font-black text-2xl tracking-wider mb-3 border border-amber-400/30">
            APA
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {APP_NAME}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            {APP_BRAND} · Staff Duty Tracking
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl mb-4 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              setActiveTab('staff_request');
              setError('');
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'staff_request'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Send className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Staff Request</span>
            <span className="sm:hidden">Request</span>
            <span className="hidden md:inline font-normal opacity-80">(No Login Required)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('executive_login');
              setError('');
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'executive_login'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Lock className="w-4 h-4 shrink-0" />
            <span>Login</span>
          </button>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl p-5 sm:p-7">
          {activeTab === 'staff_request' ? (
            /* ---------------- Public staff request (no login) ---------------- */
            <>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-base font-semibold text-white">Duty Outside Request</h2>
                  <p className="text-xs text-slate-400">
                    10-item standard submission · no account needed
                  </p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
                  <Send className="w-4 h-4 text-amber-400" />
                </div>
              </div>

              <StaffRequestForm
                challengeToken={challengeToken}
                onSubmit={handlePublicSubmit}
                footerNote={
                  <p className="text-[10px] text-slate-500 text-center pt-1 leading-relaxed">
                    Approver: <strong className="text-slate-400">{FIXED_OFFICIAL_APPROVER}</strong> ·
                    Security gate clearance enabled.
                  </p>
                }
              />

              {challengeFailed && (
                <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    The form could not verify this connection, so submission is paused. Reload the
                    page to try again.
                  </span>
                </div>
              )}
            </>
          ) : (
            /* ---------------- Account login ---------------- */
            <>
              <div className="flex items-center justify-between pb-5 mb-5 border-b border-slate-800">
                <div>
                  <h2 className="text-base font-semibold text-white">Sign In</h2>
                  <p className="text-xs text-slate-400">Access is granted by role</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-amber-400" />
                </div>
              </div>

              {error && (
                <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs sm:text-sm animate-shake">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Your username"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-colors placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Passcode
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter passcode"
                      className="w-full pl-10 pr-11 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-colors placeholder:text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-lg shadow-amber-600/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Sign In</span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Guidance */}
        <div className="mt-6 text-center">
          {activeTab === 'staff_request' ? (
            <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
              File before you leave so your biometric scans can be excused. No 2h limit — duration is
              based on operational necessity. You will get a Gate Pass ID on screen. Prefer Telegram?
              Use <strong className="text-slate-400">Copy Template</strong> and paste it into the
              group.
            </p>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              Staff accounts sign in here to use their own portal. Executives sign in to review and
              approve the register. Your role is set by{' '}
              <strong className="text-slate-400">General Manager</strong>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
