import React, { useState } from 'react';
import {
  PlusCircle,
  Fingerprint,
  Download,
  Send,
  Users,
  Menu,
  X,
  FileText,
  BarChart3,
  CheckCircle2,
  LogOut,
  ShieldCheck,
  KeyRound,
  UserCog
} from 'lucide-react';
import { APP_BRAND } from '../config/app';

interface NavbarProps {
  onOpenSubmit: () => void;
  onOpenReconciliation: () => void;
  onOpenTelegram: () => void;
  onOpenChangePassword: () => void;
  onOpenMemo?: () => void;
  onOpenStaffAccounts?: () => void;
  activeCount: number;
  incompleteCount: number;
  onExportCSV: () => void;
  currentView?: 'dashboard' | 'register' | 'staff_analytics';
  onSelectView?: (view: 'dashboard' | 'register' | 'staff_analytics') => void;
  currentUser?: string | null;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSubmit,
  onOpenReconciliation,
  onOpenTelegram,
  onOpenChangePassword,
  onOpenMemo,
  onOpenStaffAccounts,
  activeCount,
  incompleteCount,
  onExportCSV,
  currentView = 'register',
  onSelectView,
  currentUser,
  onLogout
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md w-full max-w-full">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[3.75rem] sm:min-h-[4.5rem] py-2 sm:py-2.5 gap-2">
          
          {/* Brand & Directive Title - Guaranteed Never Squished */}
          <div 
            className="flex items-center space-x-2 sm:space-x-3 cursor-pointer shrink-0"
            onClick={() => {
              if (onSelectView) onSelectView('register');
              setMobileMenuOpen(false);
            }}
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center shadow-inner text-white font-black text-base sm:text-lg tracking-wider shrink-0">
              APA
            </div>
            <div className="shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-sm sm:text-base lg:text-lg font-bold tracking-tight text-white whitespace-nowrap">
                  {APP_BRAND}
                </span>
                <span className="hidden xl:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                  Official Directive
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden xl:block leading-snug whitespace-nowrap">
                Duty Outside Request System
              </p>
            </div>
          </div>

          {/* Desktop Navigation (md and above) */}
          <div className="hidden md:flex items-center space-x-1.5 lg:space-x-2.5 shrink-0">
            {onSelectView && (
              <button
                hidden
                style={{ display: 'none' }}
                onClick={() => onSelectView(currentView === 'staff_analytics' ? 'register' : 'staff_analytics')}
                className={`inline-flex items-center px-2.5 py-1.5 lg:py-2 text-xs font-medium rounded-lg transition-colors border shrink-0 ${
                  currentView === 'staff_analytics'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                    : 'text-indigo-200 hover:text-white bg-indigo-950/60 hover:bg-indigo-900 border-indigo-600/40'
                }`}
                title="Staff Monthly Hours & Duty Counts"
              >
                <Users className="w-3.5 h-3.5 lg:w-4 lg:h-4 mr-1.5 text-indigo-400" />
                <span className="hidden xl:inline">Staff Monthly Hours</span>
                <span className="xl:hidden">Hours</span>
              </button>
            )}

            {onOpenMemo && (
              <button
                onClick={onOpenMemo}
                className="inline-flex items-center px-2.5 py-1.5 lg:py-2 text-xs font-medium rounded-lg text-amber-200 hover:text-white bg-amber-950/60 hover:bg-amber-900 transition-colors border border-amber-600/40 shrink-0"
                title="View Official Policy Memo & 3-Strike Disciplinary Matrix"
              >
                <FileText className="w-3.5 h-3.5 lg:w-4 lg:h-4 mr-1.5 text-amber-400" />
                <span className="hidden xl:inline">Policy Memo</span>
                <span className="xl:hidden">Memo</span>
              </button>
            )}

            <button
              onClick={onOpenTelegram}
              className="inline-flex items-center px-2.5 py-1.5 lg:py-2 text-xs font-medium rounded-lg text-sky-200 hover:text-white bg-sky-950/60 hover:bg-sky-900 transition-colors border border-sky-600/40 shrink-0"
              title="Telegram Format & Bot Return Guide"
            >
              <Send className="w-3.5 h-3.5 lg:w-4 lg:h-4 mr-1.5 text-sky-400" />
              <span className="hidden lg:inline">Telegram Bot</span>
              <span className="lg:hidden">Telegram</span>
            </button>

            <button
              onClick={onOpenReconciliation}
              className="inline-flex items-center px-2.5 py-1.5 lg:py-2 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors border border-slate-700/60 shrink-0 relative"
              title="Missed Fingerprint Reconciliation for HR"
            >
              <Fingerprint className="w-3.5 h-3.5 lg:w-4 lg:h-4 mr-1.5 text-blue-400" />
              <span className="hidden xl:inline">Fingerprint Scan Reconcile</span>
              <span className="xl:hidden">Reconcile</span>
              {incompleteCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                  {incompleteCount}
                </span>
              )}
            </button>

            <button
              onClick={onExportCSV}
              className="inline-flex items-center px-2 py-1.5 lg:py-2 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors border border-slate-700/60 shrink-0"
              title="Export Requests to CSV"
            >
              <Download className="w-3.5 h-3.5 lg:w-4 lg:h-4 mr-1 text-emerald-400" />
              <span className="hidden lg:inline">Export</span>
            </button>

            <button
              onClick={onOpenSubmit}
              className="inline-flex items-center px-3 lg:px-4 py-1.5 lg:py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4 mr-1.5 text-slate-950 font-bold" />
              <span>Submit Request</span>
            </button>

            {/* Mr. Shawn Executive Account & Logout */}
            {currentUser && onLogout && (
              <div className="flex items-center pl-1.5 lg:pl-2 border-l border-slate-800 space-x-1.5 lg:space-x-2 shrink-0">
                <div className="hidden 2xl:flex flex-col text-right">
                  <span className="text-xs font-bold text-amber-400 leading-tight">Mr. Shawn</span>
                  <span className="text-[10px] text-slate-400">General Manager</span>
                </div>
                <button
                  onClick={onOpenStaffAccounts}
                  className="inline-flex items-center px-2.5 py-1.5 lg:py-2 text-xs font-medium rounded-lg text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700 border border-slate-700 transition-colors shrink-0"
                  title="Create and manage staff portal logins"
                >
                  <UserCog className="w-3.5 h-3.5 lg:w-4 lg:h-4 mr-1 sm:mr-1.5 text-emerald-400" />
                  <span className="hidden lg:inline">Staff Accounts</span>
                </button>
                <button
                  onClick={onOpenChangePassword}
                  className="inline-flex items-center px-2.5 py-1.5 lg:py-2 text-xs font-medium rounded-lg text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700 border border-slate-700 transition-colors shrink-0"
                  title="Change your portal password"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400 mr-1 sm:mr-1.5" />
                  <span className="hidden lg:inline">Change Password</span>
                </button>
                <button
                  onClick={onLogout}
                  className="inline-flex items-center px-2.5 py-1.5 lg:py-2 text-xs font-medium rounded-lg text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 transition-colors shrink-0"
                  title="Lock & Log Out of Executive Portal"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400 mr-1 sm:mr-1.5" />
                  <span className="hidden lg:inline">Log Out</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile & Tablet Actions (< md) */}
          <div className="flex md:hidden items-center space-x-2 shrink-0">
            <button
              onClick={onOpenSubmit}
              className="inline-flex items-center px-2.5 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1 text-slate-950 font-bold" />
              <span>Submit</span>
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 border border-slate-700/60 transition-colors relative"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-slate-200" />
              ) : (
                <>
                  <Menu className="w-5 h-5 text-slate-200" />
                  {activeCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-slate-900" />
                  )}
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Slide-Down Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-800 bg-slate-950 px-4 py-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
          
          {/* View switcher on mobile */}
          {onSelectView && (
            <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-800">
              <button
                onClick={() => {
                  onSelectView('register');
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                  currentView === 'register'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                <span>Movement Register</span>
                {activeCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-slate-900 text-amber-300">
                    {activeCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  onSelectView('staff_analytics');
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center justify-center px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                  currentView === 'staff_analytics'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <Users className="w-3.5 h-3.5 mr-1.5" />
                <span>Monthly Hours</span>
              </button>
            </div>
          )}

          {/* Action Items in Mobile Drawer */}
          <div className="space-y-1.5 pt-1">
            {onOpenMemo && (
              <button
                onClick={() => {
                  onOpenMemo();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium text-amber-200 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 transition-colors"
              >
                <div className="flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-amber-400" />
                  <span>Official Policy Memo & 3-Strike Rules</span>
                </div>
                <span className="text-[10px] text-amber-400 bg-amber-900/60 px-1.5 py-0.5 rounded font-mono">
                  Directive
                </span>
              </button>
            )}

            <button
              onClick={() => {
                onOpenTelegram();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium text-sky-200 bg-sky-950/40 hover:bg-sky-900/50 border border-sky-800/40 transition-colors"
            >
              <div className="flex items-center">
                <Send className="w-4 h-4 mr-2 text-sky-400" />
                <span>Telegram Bot Integration</span>
              </div>
              <span className="text-[10px] text-sky-400 bg-sky-900/60 px-1.5 py-0.5 rounded">
                Zero Login
              </span>
            </button>

            <button
              onClick={() => {
                onOpenReconciliation();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
            >
              <div className="flex items-center">
                <Fingerprint className="w-4 h-4 mr-2 text-blue-400" />
                <span>Fingerprint Scan Reconciliation</span>
              </div>
              {incompleteCount > 0 && (
                <span className="text-[10px] font-bold text-amber-950 bg-amber-400 px-1.5 py-0.5 rounded-full">
                  {incompleteCount} pending
                </span>
              )}
            </button>

            <button
              onClick={() => {
                onExportCSV();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center px-3 py-2.5 rounded-lg text-xs font-medium text-emerald-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
            >
              <Download className="w-4 h-4 mr-2 text-emerald-400" />
              <span>Export All Requests to CSV</span>
            </button>

            <button
              onClick={() => {
                onOpenStaffAccounts();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium text-emerald-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
            >
              <div className="flex items-center">
                <UserCog className="w-4 h-4 mr-2 text-emerald-400" />
                <span>Staff Accounts</span>
              </div>
              <span className="text-[10px] text-emerald-400 bg-emerald-900/40 px-1.5 py-0.5 rounded">
                Logins
              </span>
            </button>

            <button
              onClick={() => {
                onOpenChangePassword();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center px-3 py-2.5 rounded-lg text-xs font-medium text-amber-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
            >
              <KeyRound className="w-4 h-4 mr-2 text-amber-400" />
              <span>Change Password</span>
            </button>

            {currentUser && onLogout && (
              <button
                onClick={() => {
                  onLogout();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 transition-colors mt-2"
              >
                <div className="flex items-center">
                  <LogOut className="w-4 h-4 mr-2 text-rose-400" />
                  <span>Lock &amp; Log Out (Mr. Shawn)</span>
                </div>
                <span className="text-[10px] text-rose-400 bg-rose-900/60 px-1.5 py-0.5 rounded">
                  Lock
                </span>
              </button>
            )}
          </div>

        </div>
      )}
    </header>
  );
};
