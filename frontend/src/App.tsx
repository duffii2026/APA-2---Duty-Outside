import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity,
  Building2, 
  Users, 
  Clock, 
  Fingerprint, 
  PlusCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  Download, 
  FileText,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowUpRight,
  Send,
  BarChart3
} from 'lucide-react';
import { DutyOutsideRequest } from './types';
import { Navbar } from './components/Navbar';
import { ApiLoadingOverlay } from './components/ApiLoadingOverlay';
import { SubmissionModal } from './components/SubmissionModal';
import { ReturnTimeModal } from './components/ReturnTimeModal';
import { RequestList } from './components/RequestList';
import { RequestDetailModal } from './components/RequestDetailModal';
import { FingerprintReconciliation } from './components/FingerprintReconciliation';
import { PrintSlipModal } from './components/PrintSlipModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { TelegramIntegrationModal } from './components/TelegramIntegrationModal';
import { OfficialPolicyMemoModal } from './components/OfficialPolicyMemoModal';
import { StaffMonthlyTracker } from './components/StaffMonthlyTracker';
import { LoginScreen } from './components/LoginScreen';
import { StaffPortal } from './components/StaffPortal';
import { StaffAccountsModal } from './components/StaffAccountsModal';
import { ExecutiveDashboard } from './components/ExecutiveDashboard';
import { ConfirmDialog } from './components/ConfirmDialog';
import { GenerateTemplate } from './components/GenerateTemplate';
import { api, ApiAuthError } from './services/api';
import { isPrivilegedRole } from './services/api';
import type { LoginUser } from './services/api';
import { APP_BRAND } from './config/app';

export default function App() {
  // Standalone /generate page — no login required
  if (window.location.pathname === '/generate') {
    return <GenerateTemplate />;
  }
  const [requests, setRequests] = useState<DutyOutsideRequest[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Executive roles land on an overview, with the register and analytics as
  // separate workspaces. Staff receive their own request dashboard below.
  const [currentView, setCurrentView] = useState<'dashboard' | 'register' | 'staff_analytics'>('dashboard');

  const refreshData = () => setRefreshTrigger(t => t + 1);

  // Modals state
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isReconcileOpen, setIsReconcileOpen] = useState(false);
  const [isTelegramOpen, setIsTelegramOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isStaffAccountsOpen, setIsStaffAccountsOpen] = useState(false);
  const [isMemoOpen, setIsMemoOpen] = useState(false);
  
  const [selectedReturnRequest, setSelectedReturnRequest] = useState<DutyOutsideRequest | null>(null);
  const [selectedDetailRequest, setSelectedDetailRequest] = useState<DutyOutsideRequest | null>(null);
  const [selectedPrintRequest, setSelectedPrintRequest] = useState<DutyOutsideRequest | null>(null);

  // Delete confirmation dialog (replaces window.confirm)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Authentication state. Nothing about the session is stored in
  // localStorage — the backend holds it in an httpOnly cookie; on app start we
  // ask the backend "who am I?" via /api/session/check.
  // The role decides which surface renders: staff get the submit-only portal,
  // privileged roles get the full executive register.
  const [currentUser, setCurrentUser] = useState<LoginUser | null>(null);
  const isExecutive = isPrivilegedRole(currentUser?.role) && !currentUser?.mustChangePassword;
  const hadSessionRef = useRef(false);
  // Whether the initial /api/session/check has finished. While false we render
  // a splash screen so a valid session never flashes the login screen first.
  const [authReady, setAuthReady] = useState(false);
  // Prevent repeat sign-out toasts while the poller keeps hitting 401s.
  const sessionExpiredRef = useRef(false);

  // Force sign-out when the backend session is rejected/expired.
  const handleSessionExpired = () => {
    if (!hadSessionRef.current || sessionExpiredRef.current) return;
    sessionExpiredRef.current = true;
    hadSessionRef.current = false;
    setCurrentUser(null);
    showToast('Session expired — please sign in again.');
  };

  // Restore a live session after a page reload (validates the httpOnly cookie).
  useEffect(() => {
    let active = true;
    api
      .sessionCheck()
      .then((result) => {
        if (!active) return;
        hadSessionRef.current = true;
        sessionExpiredRef.current = false;
        setCurrentUser(result.user);
      })
      .catch((err) => {
        if (err instanceof ApiAuthError) {
          // No valid session — stay on the login screen.
        } else {
          console.warn('Session check failed:', err);
        }
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Derived metrics
  const activeRequests = requests.filter((r) => r.status === 'active');

  // Load the register from the backend once on login. No polling: the register
  // is refreshed after every web submit/return (handlers below update state
  // from the server response) and via the manual "Check Telegram" sync.
  // Staff never fetch this list — the endpoint is privileged.
  useEffect(() => {
    if (!isExecutive) return;
    let disposed = false;

    const loadRegister = async () => {
      try {
        const data = await api.getRequests();
        if (disposed) return;
        const serverList = data.requests || [];
        if (serverList.length === 0) return; // backend is the source of truth
        setRequests([...serverList].reverse()); // newest first
      } catch (err) {
        if (err instanceof ApiAuthError) {
          handleSessionExpired();
        } else {
          console.warn('Backend sync failed:', err);
        }
      }
    };

    loadRegister();
    return () => {
      disposed = true;
      sessionExpiredRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecutive, refreshTrigger]);
  const incompleteRequests = requests.filter((r) => r.status === 'incomplete');
  const getTodayStr = () => {
    // Return YYYY-MM-DD in local time
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const returnedTodayCount = requests.filter((r) => {
    const todayStr = getTodayStr();
    return r.status === 'returned' && (r.date === todayStr || r.date.startsWith(todayStr.slice(0, 7)));
  }).length;
  
  const totalMissedScansCount = requests.reduce(
    (acc, cur) => acc + (cur.missedFingerprintScans ? cur.missedFingerprintScans.length * cur.employeesOnDuty.length : 0),
    0
  );

  // Handlers
  const handleCreateRequest = async (newReq: DutyOutsideRequest) => {
    try {
      const { request } = await api.createRequest(newReq);
      setRequests((prev) => {
        if (prev.some((r) => r.id === request.id)) {
          return prev.map((r) => (r.id === request.id ? request : r));
        }
        return [request, ...prev];
      });
      showToast(`Duty Request ${request.id} submitted for ${request.requesterName}`);
    } catch (err: any) {
      console.error('Failed to create request:', err);
      if (err instanceof ApiAuthError) {
        handleSessionExpired();
        return;
      }
      showToast(`⚠️ Failed to save request: ${err.message || 'Backend unreachable'}`);
    }
  };

  const handleConfirmReturn = async (id: string, returnTime: string, notes?: string) => {
    try {
      const { request } = await api.confirmReturn(id, returnTime, notes);
      setRequests((prev) => prev.map((item) => (item.id === id ? request : item)));
      showToast(`Return to office recorded at ${returnTime}. Record completed.`);
    } catch (err: any) {
      console.error('Failed to confirm return:', err);
      if (err instanceof ApiAuthError) {
        handleSessionExpired();
        return;
      }
      showToast(`⚠️ Failed to record return: ${err.message || 'Backend unreachable'}`);
    }
  };

  const handleWaiveStrike = async (requestId: string, note?: string) => {
    try {
      const { request } = await api.updateRequest(requestId, {
        isWaivedByGM: true,
        gmWaiverNote: note || 'Waived under GM Executive Discretion (APA Policy Section 5)',
        gmWaiverDate: new Date().toISOString(),
      });
      setRequests((prev) => prev.map((item) => (item.id === requestId ? request : item)));
      showToast(`Executive Discretion Applied: Duty waived for ${requestId}. Strike removed.`);
    } catch (err: any) {
      console.error('Failed to apply GM waiver:', err);
      if (err instanceof ApiAuthError) {
        handleSessionExpired();
        return;
      }
      showToast(`⚠️ Failed to apply waiver: ${err.message || 'Backend unreachable'}`);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setDeleteTargetId(id);
  };

  const confirmDeleteRequest = async () => {
    const id = deleteTargetId;
    if (!id) return;
    setIsDeleting(true);
    try {
      await api.deleteRequest(id);
      setRequests((prev) => prev.filter((item) => item.id !== id));
      showToast(`Request ${id} deleted.`);
      setDeleteTargetId(null);
    } catch (err: any) {
      console.error('Failed to delete request:', err);
      if (err instanceof ApiAuthError) {
        handleSessionExpired();
        return;
      }
      showToast(`⚠️ Failed to delete: ${err.message || 'Backend unreachable'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await api.deleteAllRequests();
      setRequests([]);
      showToast('All Duty Outside records have been deleted.');
    } catch (err: any) {
      console.error('Failed to delete all requests:', err);
      if (err instanceof ApiAuthError) {
        handleSessionExpired();
        return;
      }
      showToast(`⚠️ Failed to delete all records: ${err.message || 'Backend unreachable'}`);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Reference ID',
      'Requester Name',
      'Position',
      'Department',
      'Employees on Duty',
      'Reason or Purpose',
      'Destination',
      'Other Teams Involved',
      'Date',
      'Time of Departure',
      'Time of Return',
      'Status',
      'Missed Fingerprint Scans',
      'Approved By',
      'Return Remarks'
    ];

    const rows = requests.map((r) => [
      `"${r.id}"`,
      `"${r.requesterName.replace(/"/g, '""')}"`,
      `"${r.position.replace(/"/g, '""')}"`,
      `"${(r.department || '').replace(/"/g, '""')}"`,
      `"${r.employeesOnDuty.join('; ').replace(/"/g, '""')}"`,
      `"${r.reasonOrPurpose.replace(/"/g, '""')}"`,
      `"${(r.destination || '').replace(/"/g, '""')}"`,
      `"${(r.otherTeamsInvolved || '').replace(/"/g, '""')}"`,
      `"${r.date}"`,
      `"${r.timeOfDeparture}"`,
      `"${r.timeOfReturn || 'Pending'}"`,
      `"${r.status}"`,
      `"${(r.missedFingerprintScans || []).join('; ').replace(/"/g, '""')}"`,
      `"${r.approvedBy.replace(/"/g, '""')}"`,
      `"${(r.returnNotes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `APA_Duty_Outside_Requests_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported requests to CSV.');
  };

  const handleLoginSuccess = (user: LoginUser) => {
    hadSessionRef.current = true;
    sessionExpiredRef.current = false;
    setCurrentUser(user);
    showToast(`Welcome back, ${user.displayName}`);
  };

  const handleLogout = () => {
    // Invalidate the server-side session (clears the httpOnly cookie), then
    // drop the client view. Nothing else to clean up — no localStorage keys.
    hadSessionRef.current = false;
    api.logout().catch(() => {
      // Backend may be unreachable — still log out locally.
    });
    setCurrentUser(null);
    showToast('Logged out.');
  };

  // While the session check runs, show a branded splash so neither the login
  // nor the dashboard flashes before we know who is signed in.
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-5 px-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-400 flex items-center justify-center shadow-lg">
          <Building2 className="w-8 h-8 text-slate-900" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-black text-white tracking-tight">APA Executive Portal</h1>
          <p className="text-xs text-slate-400 mt-1">Loading secure session...</p>
        </div>
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // If not logged in, render the secure Login Screen (staff and executives
  // share one login; the backend decides the role)
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentUser.mustChangePassword) {
    return (
      <ChangePasswordModal
        isOpen
        required
        onClose={() => {}}
        onSuccess={(msg) => {
          setCurrentUser((user) => user ? { ...user, mustChangePassword: false } : user);
          showToast(msg);
        }}
      />
    );
  }

  // Staff accounts land on a submit-only portal. The executive register below
  // stays reachable only for privileged roles, matching the API guards.
  if (!isExecutive) {
    return <StaffPortal user={currentUser} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans selection:bg-amber-200 w-full max-w-full overflow-x-hidden">
      <ApiLoadingOverlay />
      
      {/* Top Navigation */}
      <Navbar
        onOpenSubmit={() => setIsSubmitOpen(true)}
        onOpenReconciliation={() => setIsReconcileOpen(true)}
        onOpenTelegram={() => setIsTelegramOpen(true)}
        onOpenMemo={() => setIsMemoOpen(true)}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
        onOpenStaffAccounts={() => setIsStaffAccountsOpen(true)}
        activeCount={activeRequests.length}
        incompleteCount={incompleteRequests.length}
        onExportCSV={handleExportCSV}
        currentView={currentView}
        onSelectView={(view) => setCurrentView(view)}
        currentUser={currentUser.displayName}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="max-w-[1600px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 flex-1 min-w-0">
        
        {/* Toast alert */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center space-x-2 text-xs sm:text-sm animate-bounce max-w-[90vw]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">{toastMessage}</span>
          </div>
        )}

        {/* View Switcher Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs w-full min-w-0">
          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:space-x-2 w-full sm:w-auto">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`flex items-center justify-center px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                currentView === 'dashboard' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Activity className="w-4 h-4 mr-1.5 text-emerald-400 shrink-0" />
              Overview
            </button>
            <button
              onClick={() => setCurrentView('register')}
              className={`flex items-center justify-center px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                currentView === 'register'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4 mr-1.5 text-amber-400 shrink-0" />
              <span className="whitespace-nowrap">
                <span className="hidden sm:inline">Movement </span>Register
              </span>
              {activeRequests.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 shrink-0">
                  {activeRequests.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentView('staff_analytics')}
              className={`flex items-center justify-center px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                currentView === 'staff_analytics'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4 mr-1.5 text-indigo-400 shrink-0" />
              <span className="whitespace-nowrap">Monthly Hours</span>
              <span className="ml-1.5 hidden md:inline px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 shrink-0">
                Analytics
              </span>
            </button>
          </div>

          <div className="hidden sm:flex items-center space-x-2 pr-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">APA Duty Outside</span>
            <span>•</span>
            <span className="text-slate-700 font-medium">{requests.length} Total Records Logged</span>
          </div>
        </div>

        {currentView === 'register' && <>
        {/* Executive KPI Summary Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          
          {/* Card 1: Active Duties */}
          <div 
            onClick={() => setCurrentView('register')}
            className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs flex items-center justify-between cursor-pointer hover:border-amber-300 transition-colors"
          >
            <div className="min-w-0 pr-1">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">
                <span className="sm:hidden">Outside Now</span>
                <span className="hidden sm:inline">Currently Outside</span>
              </span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl sm:text-3xl font-black text-slate-900">
                  {activeRequests.length}
                </span>
                <span className="text-[11px] sm:text-xs text-amber-600 font-medium truncate">
                  Active
                </span>
              </div>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/60 shrink-0">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>

          {/* Card 2: Returned Today */}
          <div 
            onClick={() => setCurrentView('register')}
            className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs flex items-center justify-between cursor-pointer hover:border-emerald-300 transition-colors"
          >
            <div className="min-w-0 pr-1">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">
                Returned Today
              </span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl sm:text-3xl font-black text-emerald-700">
                  {returnedTodayCount}
                </span>
                <span className="text-[11px] sm:text-xs text-emerald-600 font-medium truncate">Completed</span>
              </div>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60 shrink-0">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>

          {/* Card 3: Incomplete Return Updates */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs flex items-center justify-between">
            <div className="min-w-0 pr-1">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">
                <span className="sm:hidden">Pending Return</span>
                <span className="hidden sm:inline">Pending Return Update</span>
              </span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className={`text-xl sm:text-3xl font-black ${incompleteRequests.length > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {incompleteRequests.length}
                </span>
                <span className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">Same-Day</span>
              </div>
            </div>
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center border shrink-0 ${
              incompleteRequests.length > 0
                ? 'bg-rose-50 text-rose-600 border-rose-200'
                : 'bg-slate-50 text-slate-400 border-slate-200'
            }`}>
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>

          {/* Card 4: Staff Monthly Hours Quick Shortcut */}
          <div 
            onClick={() => setCurrentView('staff_analytics')}
            className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs flex items-center justify-between cursor-pointer hover:border-indigo-300 transition-colors"
          >
            <div className="min-w-0 pr-1">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">
                <span className="sm:hidden">Staff Hours</span>
                <span className="hidden sm:inline">Staff Hours & Tracking</span>
              </span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl sm:text-3xl font-black text-indigo-600">
                  {requests.length}
                </span>
                <span className="text-[11px] sm:text-xs text-indigo-700 font-medium flex items-center truncate">
                  <span className="hidden sm:inline">Records</span>
                  <span className="sm:hidden">Total</span>
                  <ArrowUpRight className="w-3 h-3 ml-0.5 shrink-0" />
                </span>
              </div>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200/60 shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>

        </div>

        {/* Same-Day Return Policy Alert if incomplete requests exist */}
        {incompleteRequests.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 sm:p-4 text-xs text-rose-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start space-x-3 min-w-0">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="font-bold text-sm block text-rose-950 leading-snug">
                  Attention: {incompleteRequests.length} Duty Outside Record{incompleteRequests.length > 1 ? 's require' : ' requires'} Time of Return Update
                </span>
                <p className="mt-1 text-rose-800 leading-relaxed">
                  As per the <strong>Same-Day Return Policy</strong>, staff are required to complete and update their return time on the same day of return without fail. Failure to update is treated as an incomplete record.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (incompleteRequests[0]) {
                  setSelectedReturnRequest(incompleteRequests[0]);
                }
              }}
              className="w-full sm:w-auto px-4 py-2 sm:py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shrink-0 shadow-xs transition-colors text-center"
            >
              Update Next Record
            </button>
          </div>
        )}
        </>}

        {/* Role-aware overview, movement register, and monthly analytics */}
        {currentView === 'dashboard' ? (
          <ExecutiveDashboard
            userName={currentUser.displayName}
            role={currentUser.role as 'hr' | 'manager' | 'admin'}
            requests={requests}
            onOpenRegister={() => setCurrentView('register')}
            onOpenAnalytics={() => setCurrentView('staff_analytics')}
            onOpenAccounts={() => setIsStaffAccountsOpen(true)}
            onOpenTelegram={() => setIsTelegramOpen(true)}
            onNewRequest={() => setIsSubmitOpen(true)}
            onMarkReturn={(req) => setSelectedReturnRequest(req)}
            onViewRequest={(req) => setSelectedDetailRequest(req)}
          />
        ) : currentView === 'staff_analytics' ? (
          <section>
            <StaffMonthlyTracker
              requests={requests}
              onViewRequestDetails={(req) => setSelectedDetailRequest(req)}
              onWaiveStrike={handleWaiveStrike}
            />
          </section>
        ) : (
          <>
            {/* Main Requests Register / Submissions Table */}
            <section>
              <RequestList
                requests={requests}
                onViewDetails={(req) => setSelectedDetailRequest(req)}
                onMarkReturn={(req) => setSelectedReturnRequest(req)}
                onPrintSlip={(req) => setSelectedPrintRequest(req)}
                onDelete={handleDeleteRequest}
                onDeleteAll={handleDeleteAll}
                onRefresh={refreshData}
                onWaiveStrike={handleWaiveStrike}
              />
            </section>
          </>
        )}

        {/* Quick Directive Reference Banner at Footer */}
        {currentView !== 'dashboard' && <>
        <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 text-white flex flex-col md:flex-row items-stretch md:items-center justify-between gap-5 border border-slate-800 shadow-lg w-full min-w-0">
          <div className="space-y-2 text-left min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-black bg-amber-400 text-slate-950 uppercase tracking-wider font-mono">
                APA Directive
              </span>
              <span className="text-xs text-slate-300 font-medium">All APA Staff & Heads of Department</span>
            </div>
            <h4 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Mandatory Submission Before Leaving Office Premises
            </h4>
            <div className="border-l-2 border-amber-400 pl-3 py-0.5">
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
                "APA 2 - Duty Outside is not an approval gate — it is a tracking mechanism that keeps management informed about staff on external duty."
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 w-full md:w-auto">
            <button
              onClick={() => setIsTelegramOpen(true)}
              className="px-4 py-2.5 sm:py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center justify-center shadow-sm"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Telegram Bot & Return Flow
            </button>
            <button
              onClick={() => setIsSubmitOpen(true)}
              className="px-4 py-2.5 sm:py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-sm flex items-center justify-center"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1.5 text-slate-950" />
              New Submission
            </button>
          </div>
        </div>
        </>}

      </main>

      {/* Corporate Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-4 text-center text-xs text-slate-500 w-full min-w-0">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>APA Company Ltd. • Internal Operational Systems</span>
          <span>{APP_BRAND} & Biometric Attendance Reconciliation</span>
        </div>
      </footer>

      {/* Modals */}
      <SubmissionModal
        isOpen={isSubmitOpen}
        onClose={() => setIsSubmitOpen(false)}
        onSubmit={handleCreateRequest}
      />

      <ReturnTimeModal
        request={selectedReturnRequest}
        isOpen={!!selectedReturnRequest}
        onClose={() => setSelectedReturnRequest(null)}
        onConfirmReturn={handleConfirmReturn}
      />

      <RequestDetailModal
        request={selectedDetailRequest}
        isOpen={!!selectedDetailRequest}
        onClose={() => setSelectedDetailRequest(null)}
        onMarkReturn={(req) => setSelectedReturnRequest(req)}
        onPrint={(req) => {
          setSelectedDetailRequest(null);
          setSelectedPrintRequest(req);
        }}
        onWaiveStrike={handleWaiveStrike}
      />

      <FingerprintReconciliation
        requests={requests}
        isOpen={isReconcileOpen}
        onClose={() => setIsReconcileOpen(false)}
      />

      <TelegramIntegrationModal
        isOpen={isTelegramOpen}
        onClose={() => setIsTelegramOpen(false)}
        onSubmitFromTelegram={handleCreateRequest}
      />

      <OfficialPolicyMemoModal
        isOpen={isMemoOpen}
        onClose={() => setIsMemoOpen(false)}
      />

      <PrintSlipModal
        request={selectedPrintRequest}
        isOpen={!!selectedPrintRequest}
        onClose={() => setSelectedPrintRequest(null)}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onSuccess={(msg) => {
          setCurrentUser((user) => user ? { ...user, mustChangePassword: false } : user);
          setIsChangePasswordOpen(false);
          showToast(msg);
        }}
      />

      {isStaffAccountsOpen && (
        <StaffAccountsModal
          onClose={() => setIsStaffAccountsOpen(false)}
          currentUserId={currentUser.id}
          onToast={(msg) => showToast(msg)}
          onSessionExpired={handleSessionExpired}
        />
      )}

      <ConfirmDialog
        isOpen={deleteTargetId !== null}
        title="Delete this record?"
        message={
          <>
            You are about to permanently delete request{' '}
            <span className="font-mono font-bold text-slate-900">{deleteTargetId}</span>. This
            removes the record and its audit entry and cannot be undone.
          </>
        }
        confirmLabel="Delete Record"
        cancelLabel="Keep Record"
        tone="danger"
        isBusy={isDeleting}
        onConfirm={confirmDeleteRequest}
        onCancel={() => {
          if (!isDeleting) setDeleteTargetId(null);
        }}
      />

    </div>
  );
}
