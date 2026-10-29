import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  Users, 
  Printer, 
  Eye, 
  MoreVertical,
  Fingerprint,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Tag,
  Trash2,
  LayoutGrid,
  List,
  RefreshCw,
  Globe
} from 'lucide-react';
import { DutyOutsideRequest, STANDARD_FINGERPRINT_SCANS } from '../types';
import { DutyReasonBadge } from './DutyReasonBadge';
import { detectDutyCategory } from '../utils/dutyReasons';
import { getSubmissionTiming, isEmergencyGraceCompliant, calculateDutyDuration, WORKING_HOURS_LABEL } from '../utils/timeCalculations';

interface RequestListProps {
  requests: DutyOutsideRequest[];
  onViewDetails: (req: DutyOutsideRequest) => void;
  onMarkReturn: (req: DutyOutsideRequest) => void;
  onPrintSlip: (req: DutyOutsideRequest) => void;
  onDelete?: (id: string) => void;
  onDeleteAll?: () => void;
  onRefresh?: () => void;
  onWaiveStrike?: (requestId: string, note?: string) => void;
}

const PAGE_SIZE = 10;
const VIEW_MODE_KEY = 'apa_duty_view_mode';

type ViewMode = 'list' | 'grid';

// Build a compact page-number list with ellipsis separators for large ranges.
function getPageItems(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const candidates = [1, total, current - 1, current, current + 1];
  const sorted = [...new Set(candidates)].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const items: (number | '...')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) items.push('...');
    items.push(p);
    prev = p;
  }
  return items;
}

const PaginationControls: React.FC<{
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}> = ({ page, totalPages, totalItems, pageSize, onPageChange }) => {
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/70">
      <p className="text-[11px] sm:text-xs text-slate-500">
        Showing <span className="font-bold text-slate-700">{from}–{to}</span> of{' '}
        <span className="font-bold text-slate-700">{totalItems}</span> records
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {getPageItems(page, totalPages).map((item, idx) =>
          item === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400 select-none">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={`min-w-8 h-8 px-2 text-xs font-bold rounded-lg transition-colors ${
                item === page
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

/**
 * Compact movement duration with a "beside working hours" indicator.
 * "Beside" = time outside standard office hours (8:00 AM – 5:00 PM); it is
 * still counted in the movement duration but flagged for payroll/HR review.
 */
const MovementDuration: React.FC<{ req: DutyOutsideRequest; compact?: boolean }> = ({ req, compact }) => {
  const dur = calculateDutyDuration(req.timeOfDeparture, req.timeOfReturn, req.isReturnPending, req.date);
  const hasBeside = dur.besideWorkingMinutes > 0;
  const hasDuration = dur.minutes > 0;

  return (
    <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
      <div className="flex items-center gap-1 text-xs">
        <Clock className={`w-3 h-3 ${hasBeside ? 'text-amber-500' : 'text-slate-400'}`} />
        <span className="font-semibold text-slate-800">{dur.formatted}</span>
      </div>
      {hasDuration && (
        hasBeside ? (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 w-fit"
            title={`${dur.formattedBesideWorking} of this movement falls beside working hours (outside ${WORKING_HOURS_LABEL}). Counted in the total.`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Beside: {dur.formattedBesideWorking}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Within {WORKING_HOURS_LABEL}
          </span>
        )
      )}
    </div>
  );
};

export const RequestList: React.FC<RequestListProps> = ({
  requests,
  onViewDetails,
  onMarkReturn,
  onPrintSlip,
  onDelete,
  onDeleteAll,
  onRefresh,
  onWaiveStrike
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'returned' | 'incomplete'>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [scanFilter, setScanFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [timingFilter, setTimingFilter] = useState<'all' | 'on_time' | 'advance' | 'retroactive'>('all');

  // View mode (grid / list) persisted in localStorage so the choice sticks.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'grid' ? 'grid' : 'list';
  });

  const [currentPage, setCurrentPage] = useState(1);

  const switchViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
    setCurrentPage(1);
  };

  // Any change to filters resets pagination back to the first page.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, reasonFilter, scanFilter, dateFilter, timingFilter]);

  const canDelete = (_req: DutyOutsideRequest) => true;

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // Search
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        !searchTerm ||
        req.requesterName.toLowerCase().includes(searchLower) ||
        req.id.toLowerCase().includes(searchLower) ||
        req.reasonOrPurpose.toLowerCase().includes(searchLower) ||
        req.approvedBy.toLowerCase().includes(searchLower) ||
        req.employeesOnDuty.some(emp => emp.toLowerCase().includes(searchLower)) ||
        (req.destination && req.destination.toLowerCase().includes(searchLower)) ||
        (req.otherTeamsInvolved && req.otherTeamsInvolved.toLowerCase().includes(searchLower)) ||
        (req.lateSubmissionReason && req.lateSubmissionReason.toLowerCase().includes(searchLower));

      // Status
      const matchesStatus = 
        statusFilter === 'all' || req.status === statusFilter;

      // Reason Category
      const dutyCat = detectDutyCategory(req.reasonOrPurpose);
      const matchesReason = 
        reasonFilter === 'all' || dutyCat.id === reasonFilter;

      // Scan Filter
      const matchesScan = 
        scanFilter === 'all' || 
        (scanFilter === 'has_missed' ? req.missedFingerprintScans.length > 0 : req.missedFingerprintScans.includes(scanFilter));

      // Date Filter
      const matchesDate = 
        dateFilter === 'all' || req.date === dateFilter;

      // Timing Filter (On-time, Advance, Retroactive)
      const timing = getSubmissionTiming(req);
      const matchesTiming = 
        timingFilter === 'all' || timing === timingFilter;

      return matchesSearch && matchesStatus && matchesReason && matchesScan && matchesDate && matchesTiming;
    });
  }, [requests, searchTerm, statusFilter, reasonFilter, scanFilter, dateFilter, timingFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedRequests = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRequests.slice(start, start + PAGE_SIZE);
  }, [filteredRequests, safePage]);

  const getStatusBadge = (status: DutyOutsideRequest['status'], isPending: boolean) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse"></span>
            Currently Outside
          </span>
        );
      case 'returned':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            Returned to Office
          </span>
        );
      case 'incomplete':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-900 border border-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
            Incomplete Record (Pending Return)
          </span>
        );
    }
  };

  const getTimingBadge = (req: DutyOutsideRequest) => {
    // Filed through the no-login staff tab, so the identity is unverified.
    // Shown first because it is the one badge that calls for a human check.
    if (req.source === 'public') {
      return (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shrink-0"
          title="Filed from the no-login Staff Request tab. Identity not verified — confirm this was really this staff member."
        >
          <Globe className="w-2.5 h-2.5 mr-1 text-amber-700" />
          Public Tab (Unverified)
        </span>
      );
    }

    if (req.isWaivedByGM) {
      return (
        <span 
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200 shrink-0"
          title={req.gmWaiverNote || 'Waived under GM Executive Discretion'}
        >
          <ShieldCheck className="w-2.5 h-2.5 mr-1 text-purple-700" />
          Excused by GM
        </span>
      );
    }

    const timing = getSubmissionTiming(req);
    if (timing === 'retroactive') {
      const isCompliant = isEmergencyGraceCompliant(req);
      if (isCompliant) {
        return (
          <span 
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0"
            title={req.lateSubmissionReason ? `48h Emergency Grace Granted: ${req.lateSubmissionReason}` : '48h Emergency Grace Granted'}
          >
            <CheckCircle2 className="w-2.5 h-2.5 mr-1 text-emerald-600" />
            48h Grace (0 Strikes)
          </span>
        );
      }

      return (
        <span 
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 shrink-0"
          title={req.lateSubmissionReason ? `Justification: ${req.lateSubmissionReason}` : 'Overdue or Unexcused Retroactive Submission'}
        >
          <AlertTriangle className="w-2.5 h-2.5 mr-1 text-rose-600" />
          Late / Strike
        </span>
      );
    }
    if (timing === 'advance') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-800 border border-sky-200 shrink-0">
          <Calendar className="w-2.5 h-2.5 mr-1 text-sky-600" />
          Advance
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
        On-Time
      </span>
    );
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
      
      {/* Controls / Filter Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Duty Outside Register
            </h3>
            <p className="text-xs text-slate-500">
              Complete submission records & movement verification log ({filteredRequests.length} of {requests.length} records)
            </p>
          </div>

          {/* Search Box + View Toggle */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search staff, duty, purpose, approver..."
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Grid / List View Switch */}
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5 shrink-0" role="group" aria-label="View mode">
              <button
                type="button"
                onClick={() => switchViewMode('list')}
                className={`flex items-center px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="List view"
              >
                <List className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                type="button"
                onClick={() => switchViewMode('grid')}
                className={`flex items-center px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">Grid</span>
              </button>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={!onRefresh}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded-lg transition-colors"
              title="Refresh data from server"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Pills - All in a Single Clean Row */}
        <div className="flex items-center gap-1.5 sm:gap-2 pt-1 overflow-x-auto no-scrollbar pb-1 text-xs whitespace-nowrap">
          <div className="flex items-center space-x-1 text-slate-500 shrink-0 mr-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium">Filter Status:</span>
          </div>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded-lg transition-colors shrink-0 ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            All Statuses
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded-lg transition-colors shrink-0 flex items-center ${
              statusFilter === 'active'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse hidden sm:inline-block"></span>
            Currently Outside
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('returned')}
            className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded-lg transition-colors shrink-0 ${
              statusFilter === 'returned'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            Returned
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('incomplete')}
            className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded-lg transition-colors shrink-0 ${
              statusFilter === 'incomplete'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            <span>Incomplete</span>
            <span className="hidden xl:inline"> (Pending Return)</span>
          </button>

          <div className="h-4 w-px bg-slate-300 mx-1 shrink-0"></div>

          {/* Duty Reason Selector */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="text-slate-500 font-medium">Reason:</span>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-medium cursor-pointer"
            >
              <option value="all">All Reasons</option>
              <option value="bank">Go to bank</option>
              <option value="gdt">Go to GDT</option>
              <option value="meet_gdt">Go to meet GDT</option>
              <option value="cfo_tasks">Doing CFO tasks</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="h-4 w-px bg-slate-300 mx-1 shrink-0"></div>

          {/* Missed Fingerprint scan selector */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="text-slate-500 font-medium">Fingerprint Scan:</span>
            <select
              value={scanFilter}
              onChange={(e) => setScanFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-medium cursor-pointer"
            >
              <option value="all">All Scan Records</option>
              <option value="has_missed">Has Missed Scans</option>
              {STANDARD_FINGERPRINT_SCANS.map((s) => (
                <option key={s.id} value={s.label}>
                  Missed: {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-slate-300 mx-1 shrink-0"></div>

          {/* Submission Timing Filter */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="text-slate-500 font-medium">Timing:</span>
            <select
              value={timingFilter}
              onChange={(e) => setTimingFilter(e.target.value as 'all' | 'on_time' | 'advance' | 'retroactive')}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-medium cursor-pointer"
            >
              <option value="all">All Timings</option>
              <option value="on_time">On-Time</option>
              <option value="advance">Advance Booking</option>
              <option value="retroactive">Retroactive / Late</option>
            </select>
          </div>
        </div>
      </div>

      {/* List / Grid Content */}
      {filteredRequests.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-medium text-slate-700">No submission records matched your filters.</p>
          <p className="text-xs text-slate-500 mt-1">Try resetting the search terms or status filters.</p>
        </div>
      ) : (
        <>
          {/* ===== LIST VIEW ===== */}
          {viewMode === 'list' ? (
            <>
              {/* Mobile View (< md): Clean Request Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {paginatedRequests.map((req) => (
                  <div 
                    key={`mobile-${req.id}`}
                    className="p-4 space-y-3 hover:bg-slate-50/70 transition-colors cursor-pointer"
                    onClick={() => onViewDetails(req)}
                  >
                    {/* Top Row: Ref, Date & Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          {req.id}
                        </span>
                        <span className="text-[11px] text-slate-500 flex items-center">
                          <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                          {req.date}
                        </span>
                      </div>
                      <div>
                        {getStatusBadge(req.status, req.isReturnPending)}
                      </div>
                      <div className="mt-1">
                        {getTimingBadge(req)}
                      </div>
                    </div>

                    {/* Requester & Position (Items 1 & 3) */}
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between">
                        <h4 className="font-bold text-slate-900 text-sm">
                          <span className="text-[10px] text-slate-400 font-medium mr-1">1.</span>
                          {req.requesterName}
                        </h4>
                        <span className="text-xs text-slate-500 font-medium">
                          <span className="text-[10px] text-slate-400 font-medium mr-0.5">3.</span>
                          {req.position}
                        </span>
                      </div>

                      {/* Employees on Duty (Item 2) */}
                      {req.employeesOnDuty.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          <span className="text-[10px] text-slate-400 self-center">2. Staff:</span>
                          {req.employeesOnDuty.map((emp, i) => (
                            <span
                              key={i}
                              className="inline-block px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-700 font-medium"
                            >
                              {emp}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Other Teams (Item 5) */}
                      {req.otherTeamsInvolved && (
                        <div className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50 inline-block">
                          <span className="font-medium">5. Team:</span> {req.otherTeamsInvolved}
                        </div>
                      )}
                    </div>

                    {/* Purpose (Item 4) */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 font-medium">4.</span>
                          <DutyReasonBadge reason={req.reasonOrPurpose} />
                        </div>
                        {req.destination && (
                          <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
                            📍 {req.destination}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-800 line-clamp-2">
                        {req.reasonOrPurpose}
                      </p>
                    </div>

                    {/* Timing Row: Departure & Return (Items 7 & 8) */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-white border border-slate-200/80">
                        <span className="text-[10px] text-slate-400 block">7. Departure</span>
                        <span className="font-bold text-slate-900">{req.timeOfDeparture}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-slate-200/80">
                        <span className="text-[10px] text-slate-400 block">8. Return</span>
                        {req.timeOfReturn ? (
                          <span className="font-bold text-emerald-700">{req.timeOfReturn}</span>
                        ) : (
                          <span className="font-semibold text-amber-700 italic">Pending</span>
                        )}
                      </div>
                    </div>

                    {/* Duration with within/beside working-hours indicator */}
                    <div className="p-2 rounded-lg bg-white border border-slate-200/80 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Duration</span>
                      <MovementDuration req={req} compact />
                    </div>

                    {/* Missed Scans (Item 9) */}
                    {req.missedFingerprintScans.length > 0 && (
                      <div className="flex items-center flex-wrap gap-1 text-[10px]">
                        <span className="text-blue-700 font-semibold flex items-center">
                          <Fingerprint className="w-3 h-3 mr-0.5" /> 9. Scans:
                        </span>
                        {req.missedFingerprintScans.map((s, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Approved By (Item 10) */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <div className="text-[11px] text-slate-500 flex items-center">
                        <ShieldCheck className="w-3.5 h-3.5 mr-1 text-slate-400" />
                        <span className="text-[10px] text-slate-400 font-medium mr-1">10.</span>
                        <span>{req.approvedBy}</span>
                      </div>

                      <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                        {(req.status === 'active' || req.status === 'incomplete') && (
                          <button
                            onClick={() => onMarkReturn(req)}
                            className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-2xs"
                          >
                            Mark Return
                          </button>
                        )}

                        <button
                          onClick={() => onViewDetails(req)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onPrintSlip(req)}
                          className="p-1.5 text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                          title="Print Pass"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {onDelete && canDelete(req) && (
                          <button
                            onClick={() => onDelete(req.id)}
                            className="p-1.5 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            title="Delete Incorrect Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                ))}
              </div>

              {/* Desktop View (>= md): Full Table */}
              <div className="hidden md:block overflow-x-auto w-full min-w-0">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/60 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <th className="py-3 px-4">Ref & 6. Date</th>
                      <th className="py-3 px-4">1. Requester & 3. Position</th>
                      <th className="py-3 px-4">2. Employees on Duty</th>
                      <th className="py-3 px-4">4. Reason or Purpose</th>
                      <th className="py-3 px-4">5. Other Teams</th>
                      <th className="py-3 px-4">7. Departure / 8. Return</th>
                      <th className="py-3 px-4">Duration (Within / Beside)</th>
                      <th className="py-3 px-4">9. Missed Finger Scans</th>
                      <th className="py-3 px-4">10. Approved By</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {paginatedRequests.map((req) => (
                      <tr 
                        key={req.id}
                        className="hover:bg-amber-50/40 transition-colors group"
                      >
                        {/* Ref & Date */}
                        <td className="py-3.5 px-4 font-medium whitespace-nowrap">
                          <span className="font-mono text-xs font-semibold text-slate-900 block">
                            {req.id}
                          </span>
                          <span className="text-[11px] text-slate-500 flex items-center mt-0.5">
                            <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                            {req.date}
                          </span>
                        </td>

                        {/* Requester & Position */}
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-900 block">
                            {req.requesterName}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            {req.position}
                          </span>
                          {req.department && (
                            <span className="text-[10px] text-slate-400">
                              {req.department}
                            </span>
                          )}
                        </td>

                        {/* Employees on Duty */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {req.employeesOnDuty.map((emp, i) => (
                              <span
                                key={i}
                                className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-800 font-medium"
                              >
                                {emp}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Purpose */}
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="mb-1">
                            <DutyReasonBadge reason={req.reasonOrPurpose} />
                          </div>
                          <p className="line-clamp-2 text-slate-800 font-medium" title={req.reasonOrPurpose}>
                            {req.reasonOrPurpose}
                          </p>
                          {req.destination && (
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                              Loc: {req.destination}
                            </p>
                          )}
                        </td>

                        {/* Other Teams (Item 5) */}
                        <td className="py-3.5 px-4">
                          {req.otherTeamsInvolved ? (
                            <span className="text-[11px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50 font-medium">
                              {req.otherTeamsInvolved}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">N/A</span>
                          )}
                        </td>

                        {/* Times */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-xs">
                            <span className="text-slate-500 font-medium">Dep: </span>
                            <span className="font-bold text-slate-900">{req.timeOfDeparture}</span>
                          </div>
                          <div className="text-xs mt-0.5">
                            <span className="text-slate-500 font-medium">Ret: </span>
                            {req.timeOfReturn ? (
                              <span className="font-semibold text-emerald-700">{req.timeOfReturn}</span>
                            ) : (
                              <span className="text-amber-700 font-medium italic">Pending Return</span>
                            )}
                          </div>
                        </td>

                        {/* Duration with within/beside working-hours indicator */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <MovementDuration req={req} />
                        </td>

                        {/* Missed Fingerprint Scans */}
                        <td className="py-3.5 px-4">
                          {req.missedFingerprintScans.length === 0 ? (
                            <span className="text-[11px] text-slate-400 italic">None</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {req.missedFingerprintScans.map((s, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center text-[10px] font-medium text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100"
                                >
                                  <Fingerprint className="w-2.5 h-2.5 mr-1 text-blue-600" />
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* 10. Approved By */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="mb-1 flex flex-wrap items-center gap-1">
<div className="flex items-center gap-1.5">
                      {getStatusBadge(req.status, req.isReturnPending)}
                      {getTimingBadge(req)}
                    </div>
                            {getTimingBadge(req)}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center">
                            <ShieldCheck className="w-3 h-3 mr-1 text-slate-400" />
                            <span className="truncate max-w-[140px]" title={req.approvedBy}>
                              {req.approvedBy}
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Mark Return Button if pending */}
                            {(req.status === 'active' || req.status === 'incomplete') && (
                              <button
                                onClick={() => onMarkReturn(req)}
                                className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors shadow-xs"
                                title="Mark Return Time (Same-Day Policy)"
                              >
                                Mark Return
                              </button>
                            )}

                            <button
                              onClick={() => onViewDetails(req)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                              title="View Full 10-Item Detail"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => onPrintSlip(req)}
                              className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-md transition-colors"
                              title="Print Official Gate Pass / Attendance Slip"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            {/* Delete record */}
                            {onDelete && canDelete(req) && (
                              <button
                                onClick={() => onDelete(req.id)}
                                className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                                title="Delete Incorrect Record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* ===== GRID VIEW ===== */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3 sm:p-4">
              {paginatedRequests.map((req) => (
                <div
                  key={`grid-${req.id}`}
                  className="bg-white border border-slate-200 rounded-xl shadow-xs hover:shadow-md hover:border-amber-300 transition-all p-4 flex flex-col gap-3 cursor-pointer"
                  onClick={() => onViewDetails(req)}
                >
                  {/* Top Row: Ref, Date & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                        {req.id}
                      </span>
                      <span className="text-[11px] text-slate-500 flex items-center min-w-0">
                        <Calendar className="w-3 h-3 mr-1 text-slate-400 shrink-0" />
                        <span className="truncate">{req.date}</span>
                      </span>
                    </div>
                    {getStatusBadge(req.status, req.isReturnPending)}
                  </div>

                  {/* Requester & Position */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm line-clamp-1" title={req.requesterName}>
                      {req.requesterName}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {req.position}
                      {req.department && <span className="text-slate-400"> • {req.department}</span>}
                    </p>
                  </div>

                  {/* Purpose */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <DutyReasonBadge reason={req.reasonOrPurpose} />
                      {req.destination && (
                        <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                          📍 {req.destination}
                        </span>
                      )}
                    </div>
<p className="text-xs text-slate-800 line-clamp-2" title={req.reasonOrPurpose}>
                       {req.reasonOrPurpose}
                     </p>
                     {req.isRetroactive && req.lateSubmissionReason && (
                       <p className="text-[10px] text-rose-700 italic line-clamp-2" title={req.lateSubmissionReason}>
                         Justification: {req.lateSubmissionReason}
                       </p>
                     )}
                   </div>

                  {/* Employees on Duty */}
                  {req.employeesOnDuty.length > 0 && (
                    <div className="flex items-center flex-wrap gap-1">
                      <span className="text-[10px] text-slate-400 flex items-center mr-0.5">
                        <Users className="w-3 h-3 mr-1 text-slate-400" /> Staff:
                      </span>
                      {req.employeesOnDuty.map((emp, i) => (
                        <span
                          key={i}
                          className="inline-block px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-700 font-medium"
                        >
                          {emp}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Times */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-white border border-slate-200/80">
                      <span className="text-[10px] text-slate-400 block">Departure</span>
                      <span className="font-bold text-slate-900">{req.timeOfDeparture}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-slate-200/80">
                      <span className="text-[10px] text-slate-400 block">Return</span>
                      {req.timeOfReturn ? (
                        <span className="font-bold text-emerald-700">{req.timeOfReturn}</span>
                      ) : (
                        <span className="font-semibold text-amber-700 italic">Pending</span>
                      )}
                    </div>
                  </div>

                  {/* Duration with within/beside working-hours indicator */}
                  <div className="p-2 rounded-lg bg-white border border-slate-200/80 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Duration</span>
                    <MovementDuration req={req} compact />
                  </div>

                  {/* Missed Scans */}
                  {req.missedFingerprintScans.length > 0 && (
                    <div className="flex items-center flex-wrap gap-1 text-[10px]">
                      <span className="text-blue-700 font-semibold flex items-center">
                        <Fingerprint className="w-3 h-3 mr-0.5" /> Scans:
                      </span>
                      {req.missedFingerprintScans.map((s, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Approved By + Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
                    <div className="text-[11px] text-slate-500 flex items-center min-w-0">
                      <ShieldCheck className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
                      <span className="truncate" title={req.approvedBy}>{req.approvedBy}</span>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {(req.status === 'active' || req.status === 'incomplete') && (
                        <button
                          onClick={() => onMarkReturn(req)}
                          className="px-2 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-2xs"
                          title="Mark Return"
                        >
                          Mark Return
                        </button>
                      )}

                      <button
                        onClick={() => onViewDetails(req)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onPrintSlip(req)}
                        className="p-1.5 text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                        title="Print Pass"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>

                      {onDelete && canDelete(req) && (
                        <button
                          onClick={() => onDelete(req.id)}
                          className="p-1.5 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                          title="Delete Incorrect Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination (applies to both list and grid) */}
          <PaginationControls
            page={safePage}
            totalPages={totalPages}
            totalItems={filteredRequests.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
};
