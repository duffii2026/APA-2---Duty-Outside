import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, CalendarDays, CheckCircle2, Clock3, Eye,
  FileText, Fingerprint, KeyRound, Link2, LogOut, MapPin, PlusCircle, RefreshCw,
  Search, Send, ShieldCheck, X,
} from 'lucide-react';
import { api } from '../services/api';
import type { LoginUser } from '../services/api';
import { StaffRequestForm } from './StaffRequestForm';
import type { StaffRequestPayload } from './StaffRequestForm';
import { DutyOutsideRequest, FIXED_OFFICIAL_APPROVER } from '../types';
import { calculateDutyDuration } from '../utils/timeCalculations';

interface StaffPortalProps {
  user: LoginUser;
  onLogout: () => void;
}

const PAGE_SIZE = 5;

const formatDate = (date: string) => {
  if (!date) return '—';
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(parsed);
};

export const StaffPortal: React.FC<StaffPortalProps> = ({ user, onLogout }) => {
  const [requests, setRequests] = useState<DutyOutsideRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<DutyOutsideRequest | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnTime, setReturnTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  const loadRequests = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const result = await api.getMyRequests();
      setRequests(result.requests || []);
    } catch (err: any) {
      setHistoryError(err?.message || 'Could not load your duty records.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleSubmit = async (p: StaffRequestPayload): Promise<DutyOutsideRequest> => {
    const res = await api.createRequest({
      requesterName: p.requesterName,
      employeesOnDuty: [p.requesterName],
      position: p.position,
      department: p.department,
      reasonOrPurpose: p.reasonDetail ? `${p.reasonCategory}: ${p.reasonDetail}` : p.reasonCategory,
      destination: p.destination,
      date: p.date,
      timeOfDeparture: p.timeOfDeparture,
      timeOfReturn: p.timeOfReturn,
      isReturnPending: p.isReturnPending,
      isDirectToHome: p.isDirectToHome,
      submissionTiming: p.lateSubmissionReason ? 'retroactive' : 'on_time',
      lateSubmissionReason: p.lateSubmissionReason,
      missedFingerprintScans: p.missedFingerprintScans,
      approvedBy: FIXED_OFFICIAL_APPROVER,
      returnNotes: p.isDirectToHome
        ? 'Afternoon duty concludes shift (Direct to Home)'
        : 'Submitted via Staff Portal',
    });
    setRequests((current) => [res.request, ...current.filter((item) => item.id !== res.request.id)].slice(0, 100));
    setShowRequestForm(false);
    setSearchTerm('');
    setStatusFilter('all');
    setDateFilter('');
    setPage(1);
    return res.request;
  };

  const handleReturn = async (requestId: string) => {
    try {
      const { request } = await api.confirmReturn(requestId, returnTime, 'Return confirmed via Staff Portal');
      setRequests((current) => current.map((item) => item.id === requestId ? request : item));
      setSelectedRequest(request);
      setReturningId(null);
      setHistoryError('');
    } catch (err: any) {
      setHistoryError(err?.message || 'Could not confirm your return.');
    }
  };

  const beginReturn = (requestId: string) => {
    const now = new Date();
    setReturningId(requestId);
    setReturnTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  };

  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const activeCount = requests.filter((request) => request.status === 'active').length;
  const returnedCount = requests.filter((request) => request.status === 'returned').length;
  const thisMonthCount = requests.filter((request) => request.date?.slice(0, 7) === currentMonth).length;
  const filteredRequests = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesSearch = !query || [request.id, request.reasonOrPurpose, request.destination]
        .some((value) => String(value || '').toLowerCase().includes(query));
      return matchesSearch
        && (statusFilter === 'all' || request.status === statusFilter)
        && (!dateFilter || request.date === dateFilter);
    }).sort((a, b) => b.date.localeCompare(a.date) || b.timeOfDeparture.localeCompare(a.timeOfDeparture));
  }, [requests, searchTerm, statusFilter, dateFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const visibleRequests = filteredRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const setFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const statusStyle = (status: DutyOutsideRequest['status']) => status === 'returned'
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
    : status === 'incomplete'
      ? 'border-rose-500/25 bg-rose-500/10 text-rose-300'
      : 'border-amber-500/25 bg-amber-500/10 text-amber-300';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050819] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -top-36 left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-amber-500/[0.07] blur-3xl" />
      <div className="relative mx-auto w-full max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-500 to-orange-600 text-[17px] font-black tracking-tight shadow-lg shadow-amber-950/40">APA 2</div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-black tracking-tight sm:text-2xl">Staff Duty Dashboard</h1><span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[9px] font-bold tracking-widest text-slate-400">STAFF</span></div>
              <p className="mt-1 text-xs text-slate-400">Signed in as <strong className="text-amber-400">{user.displayName || user.username}</strong></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowRequestForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-950/20 transition hover:bg-amber-400"><PlusCircle className="h-4 w-4" />New duty request</button>
            <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2.5 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:text-white"><LogOut className="h-3.5 w-3.5" />Sign out</button>
          </div>
        </header>

        {historyError && <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-900/70 bg-rose-950/40 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{historyError}</div>}

        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'My reports', value: requests.length, sub: 'All time', icon: <FileText className="h-5 w-5" />, tone: 'border-slate-700 bg-slate-800/70 text-slate-300' },
            { label: 'Currently outside', value: activeCount, sub: 'Active duty', icon: <Clock3 className="h-5 w-5" />, tone: 'border-amber-500/20 bg-amber-500/10 text-amber-400' },
            { label: 'Returned', value: returnedCount, sub: 'Completed', icon: <CheckCircle2 className="h-5 w-5" />, tone: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' },
            { label: 'This month', value: thisMonthCount, sub: new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date()), icon: <CalendarDays className="h-5 w-5" />, tone: 'border-sky-500/20 bg-sky-500/10 text-sky-400' },
          ].map((metric) => <article key={metric.label} className="flex min-h-24 items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-black/10">
            <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{metric.label}</p><div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-black text-white">{historyLoading ? '—' : metric.value}</span><span className="text-[11px] text-slate-400">{metric.sub}</span></div></div>
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${metric.tone}`}>{metric.icon}</span>
          </article>)}
        </section>

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-black/10 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-400"><Send className="h-5 w-5" /></span>
              <div><h2 className="text-sm font-bold">Personal Telegram</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">Connect your Telegram account to your staff profile. The link is private, single-use, and expires automatically.</p></div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-slate-300"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />Not linked</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#070c1d] px-4 py-3">
            <p className="text-xs text-slate-400">Telegram account linking is not enabled yet. Your duty reports are available below.</p>
            <button type="button" disabled title="Telegram linking is not available yet" className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-sky-600/50 px-4 py-2 text-xs font-bold text-white/70"><Link2 className="h-3.5 w-3.5" />Link Telegram</button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl shadow-black/10">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
            <div><h2 className="text-sm font-bold">My duty reports</h2><p className="mt-1 text-[11px] text-slate-400">Every record filed under your staff profile, newest first.</p></div>
            <button type="button" onClick={loadRequests} disabled={historyLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? 'animate-spin' : ''}`} />Refresh</button>
          </div>

          <div className="grid grid-cols-1 gap-2 px-5 pb-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(150px,0.75fr)_minmax(150px,0.75fr)] sm:px-6">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-[#070c1d] px-3"><Search className="h-4 w-4 shrink-0 text-slate-500" /><input aria-label="Search reports" value={searchTerm} onChange={(event) => setFilter(setSearchTerm)(event.target.value)} placeholder="Search reference, purpose or destination" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600" /></label>
            <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setFilter(setStatusFilter)(event.target.value)} className="h-10 rounded-xl border border-slate-800 bg-[#070c1d] px-3 text-xs text-slate-200 outline-none focus:border-slate-600"><option value="all">All statuses</option><option value="active">Active</option><option value="returned">Returned</option><option value="incomplete">Incomplete</option></select>
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-[#070c1d] px-3"><CalendarDays className="h-4 w-4 shrink-0 text-slate-500" /><input aria-label="Filter by duty date" type="date" value={dateFilter} onChange={(event) => setFilter(setDateFilter)(event.target.value)} className="w-full bg-transparent text-xs text-slate-300 outline-none [color-scheme:dark]" /></label>
          </div>

          <div className="space-y-3 px-5 pb-4 sm:px-6">
            {historyLoading ? <div className="rounded-xl border border-slate-800 bg-[#070c1d] p-10 text-center text-xs text-slate-400">Loading your reports…</div> : visibleRequests.length === 0 ? <div className="rounded-xl border border-slate-800 bg-[#070c1d] p-10 text-center"><FileText className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-3 text-sm font-semibold text-slate-200">{requests.length ? 'No matching reports' : 'No duty reports yet'}</p><p className="mt-1 text-xs text-slate-500">{requests.length ? 'Try changing or clearing your filters.' : 'Your submitted duty requests will appear here.'}</p>{requests.length === 0 && <button type="button" onClick={() => setShowRequestForm(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"><PlusCircle className="h-3.5 w-3.5" />New duty request</button>}</div> : visibleRequests.map((request) => <article key={request.id} className="rounded-xl border border-slate-800 bg-[#070c1d] p-4 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 font-mono text-[10px] font-bold text-amber-300">{request.id}</span><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold capitalize ${statusStyle(request.status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{request.status}</span></div>
                  <h3 className="mt-2 text-sm font-bold text-slate-100">{request.reasonOrPurpose || 'Duty outside'}</h3>
                  <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2 text-[11px] text-slate-400 sm:grid-cols-2 xl:grid-cols-4">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-500" />{formatDate(request.date)}</span>
                    <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-slate-500" />{request.timeOfDeparture} → {request.timeOfReturn || 'Pending'}</span>
                    <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-500" />{request.destination || 'Destination not specified'}</span>
                    <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-slate-500" />{request.approvedBy || FIXED_OFFICIAL_APPROVER}</span>
                  </div>
                  <p className="mt-3 border-t border-slate-800 pt-2.5 text-[10px] text-slate-500">Submitted {request.createdAt ? new Date(request.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {request.status !== 'returned' && (returningId === request.id ? (
                    <div className="flex items-center gap-1">
                      <input aria-label="Return time" type="time" value={returnTime} onChange={(event) => setReturnTime(event.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" />
                      <button type="button" onClick={() => handleReturn(request.id)} className="rounded-md bg-emerald-500 px-2 py-1.5 text-[10px] font-bold text-slate-950">Confirm</button>
                      <button type="button" onClick={() => setReturningId(null)} className="rounded-md px-1.5 py-1 text-[10px] text-slate-400">Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => beginReturn(request.id)} className="rounded-lg border border-emerald-500/20 px-2.5 py-2 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10">Confirm return</button>
                  ))}
                  <button type="button" onClick={() => setSelectedRequest(request)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-700"><Eye className="h-3.5 w-3.5" />View details</button>
                </div>
              </div>
              {request.missedFingerprintScans?.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-rose-300"><Fingerprint className="h-3.5 w-3.5" />Missed scans: {request.missedFingerprintScans.join(', ')}</p>}
            </article>)}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-5 py-3.5 text-[10px] text-slate-500 sm:px-6">
            <span>Showing {filteredRequests.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length}</span>
            <div className="flex items-center gap-3"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-lg border border-slate-800 bg-slate-800/70 px-3 py-2 font-semibold text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">‹ Previous</button><span>Page {page} of {pageCount}</span><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount} className="rounded-lg border border-slate-800 bg-slate-800/70 px-3 py-2 font-semibold text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Next ›</button></div>
          </footer>
        </section>

        <p className="mx-auto mt-6 flex max-w-2xl items-start justify-center gap-2 px-3 text-center text-[11px] leading-relaxed text-slate-500"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />This workspace only shows duty reports filed under your account. It is a movement tracker, not an approval gate — log before you leave so biometric scans can be excused.</p>
      </div>

      {showRequestForm && <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="new-duty-title">
        <div className="mx-auto my-4 max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:my-8">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 sm:px-7"><div><h2 id="new-duty-title" className="text-base font-bold">New duty request</h2><p className="mt-1 text-xs text-slate-400">Submit your duty details before leaving the office.</p></div><button type="button" onClick={() => setShowRequestForm(false)} aria-label="Close request form" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button></div>
          <div className="p-5 sm:p-7"><StaffRequestForm defaultName={user.displayName || user.username} lockName onSubmit={handleSubmit} footerNote={<p className="pt-1 text-center text-[10px] text-slate-500">Approver: <strong className="text-slate-400">{FIXED_OFFICIAL_APPROVER}</strong> · Security gate clearance enabled.</p>} /></div>
        </div>
      </div>}

      {selectedRequest && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="report-detail-title" onClick={() => setSelectedRequest(null)}>
        <section className="my-auto w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <header className="flex items-start justify-between border-b border-slate-800 px-5 py-4"><div><span className="font-mono text-xs font-bold text-amber-300">{selectedRequest.id}</span><h2 id="report-detail-title" className="mt-1 text-base font-bold">Duty report details</h2></div><button type="button" onClick={() => setSelectedRequest(null)} aria-label="Close details" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button></header>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            {[
              ['Purpose', selectedRequest.reasonOrPurpose || '—'], ['Status', selectedRequest.status],
              ['Date', formatDate(selectedRequest.date)], ['Destination', selectedRequest.destination || '—'],
              ['Departure', selectedRequest.timeOfDeparture || '—'], ['Return', selectedRequest.timeOfReturn || 'Pending'],
              ['Duration', calculateDutyDuration(selectedRequest.timeOfDeparture, selectedRequest.timeOfReturn, selectedRequest.isReturnPending, selectedRequest.date).formatted],
              ['Approver', selectedRequest.approvedBy || FIXED_OFFICIAL_APPROVER],
              ['Department', selectedRequest.department || '—'], ['Position', selectedRequest.position || '—'],
              ['Missed scans', selectedRequest.missedFingerprintScans?.join(', ') || 'None'],
              ['Submission timing', selectedRequest.submissionTiming || '—'],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-xs font-medium text-slate-200">{value}</p></div>)}
            {selectedRequest.lateSubmissionReason && <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 sm:col-span-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Late submission reason</p><p className="mt-1 text-xs text-slate-200">{selectedRequest.lateSubmissionReason}</p></div>}
            {selectedRequest.returnNotes && <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:col-span-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Return notes</p><p className="mt-1 text-xs text-slate-200">{selectedRequest.returnNotes}</p></div>}
          </div>
          <footer className="flex justify-end border-t border-slate-800 px-5 py-3"><button type="button" onClick={() => setSelectedRequest(null)} className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">Close</button></footer>
        </section>
      </div>}
    </div>
  );
};
