import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Clock, 
  Calendar, 
  Landmark, 
  Building2, 
  Briefcase, 
  HelpCircle, 
  Search, 
  Download, 
  ArrowUpDown, 
  ChevronRight, 
  ChevronLeft, 
  User, 
  Fingerprint, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Filter, 
  X,
  ExternalLink,
  Printer,
  ShieldAlert,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { DutyOutsideRequest, DisciplinaryNoticeLevel } from '../types';
import { 
  calculateStaffMonthlyAnalytics, 
  getAvailableMonths, 
  StaffMonthlySummary,
  calculateDutyDuration,
  getSubmissionTiming,
  isEmergencyGraceCompliant,
  WORKING_HOURS_LABEL
} from '../utils/timeCalculations';
import { DutyReasonBadge } from './DutyReasonBadge';
import { StaffMonthlyCharts } from './StaffMonthlyCharts';

interface StaffMonthlyTrackerProps {
  requests: DutyOutsideRequest[];
  onViewRequestDetails?: (req: DutyOutsideRequest) => void;
  onWaiveStrike?: (requestId: string, note?: string) => void;
}

export const StaffMonthlyTracker: React.FC<StaffMonthlyTrackerProps> = ({
  requests,
  onViewRequestDetails,
  onWaiveStrike
}) => {
  const availableMonths = useMemo(() => getAvailableMonths(requests), [requests]);
  
  // Default to the first available month (e.g. 2026-09)
  const [selectedMonth, setSelectedMonth] = useState<string>(
    availableMonths[0]?.key || 'all'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'hours' | 'duties' | 'name' | 'strikes'>('hours');
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'warnings' | 'clean'>('all');
  const [selectedStaff, setSelectedStaff] = useState<StaffMonthlySummary | null>(null);

  // Compute analytics for chosen month
  const monthlyStats = useMemo(() => {
    return calculateStaffMonthlyAnalytics(requests, selectedMonth);
  }, [requests, selectedMonth]);

  // Filtered & sorted staff list
  const filteredStaff = useMemo(() => {
    return monthlyStats.staffSummaries
      .filter((s) => {
        const q = searchTerm.toLowerCase();
        const matchesName = s.staffName.toLowerCase().includes(q);
        const matchesPos = s.positions.some((p) => p.toLowerCase().includes(q));
        const matchesDept = s.departments.some((d) => d.toLowerCase().includes(q));
        const matchesSearch = matchesName || matchesPos || matchesDept;

        // Compliance filter
        let matchesCompliance = true;
        if (complianceFilter === 'warnings') {
          matchesCompliance = s.strikesCount > 0;
        } else if (complianceFilter === 'clean') {
          matchesCompliance = s.strikesCount === 0;
        }

        return matchesSearch && matchesCompliance;
      })
      .sort((a, b) => {
        if (sortBy === 'hours') return b.totalMinutes - a.totalMinutes;
        if (sortBy === 'duties') return b.totalDuties - a.totalDuties;
        if (sortBy === 'strikes') return b.strikesCount - a.strikesCount;
        return a.staffName.localeCompare(b.staffName);
      });
  }, [monthlyStats, searchTerm, sortBy, complianceFilter]);

  const getStrikeBadge = (level: DisciplinaryNoticeLevel, strikesCount: number) => {
    switch (level) {
      case 'clean':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
            Clean (100% On-Time)
          </span>
        );
      case 'first_notice':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <AlertTriangle className="w-3 h-3 mr-1 text-amber-600" />
            1st Strike (Reminder)
          </span>
        );
      case 'second_notice':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-950 border border-orange-300">
            <AlertTriangle className="w-3 h-3 mr-1 text-orange-600" />
            2nd Strike (HOD Copy)
          </span>
        );
      case 'verbal_warning':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300 animate-pulse">
            <ShieldAlert className="w-3 h-3 mr-1 text-rose-600" />
            3rd Strike (Verbal Warning)
          </span>
        );
      case 'written_warning':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-950 border border-purple-300">
            <ShieldAlert className="w-3 h-3 mr-1 text-purple-600" />
            Written Warning Risk
          </span>
        );
    }
  };

  // Keep selectedStaff synced if it exists
  const activeStaffDetail = useMemo(() => {
    if (!selectedStaff) return null;
    return monthlyStats.staffSummaries.find((s) => s.staffName === selectedStaff.staffName) || null;
  }, [selectedStaff, monthlyStats]);

  // Export CSV for the chosen month
  const handleExportMonthlyCSV = () => {
    const headers = [
      'Staff Name',
      'Position',
      'Department',
      'Month',
      'Total Duty Count',
      'Total Hours (Formatted)',
      'Total Hours (Decimal)',
      'On-Time Duties',
      'Advance Bookings',
      'Retroactive (Late) Duties',
      'Active Strikes Count',
      'Disciplinary Strike Level',
      'Compliance Rate (%)',
      'Bank Duties (Count)',
      'Bank Duration',
      'GDT Duties (Count)',
      'GDT Duration',
      'Meet GDT (Count)',
      'Meet GDT Duration',
      'CFO Tasks (Count)',
      'CFO Tasks Duration',
      'Other Duties (Count)',
      'Other Duration',
      'Missed Scans Justified'
    ];

    const rows = monthlyStats.staffSummaries.map((s) => [
      `"${s.staffName}"`,
      `"${s.positions.join('; ')}"`,
      `"${s.departments.join('; ')}"`,
      `"${monthlyStats.monthDisplay}"`,
      s.totalDuties,
      `"${s.formattedTotalDuration}"`,
      s.totalHoursDecimal,
      s.onTimeDuties,
      s.advanceDuties,
      s.retroactiveDuties,
      s.strikesCount,
      `"${s.strikeLevel}"`,
      `"${s.complianceRate}%"`,
      s.reasonsBreakdown.bank.count,
      `"${s.reasonsBreakdown.bank.formattedDuration}"`,
      s.reasonsBreakdown.gdt.count,
      `"${s.reasonsBreakdown.gdt.formattedDuration}"`,
      s.reasonsBreakdown.meet_gdt.count,
      `"${s.reasonsBreakdown.meet_gdt.formattedDuration}"`,
      s.reasonsBreakdown.cfo_tasks.count,
      `"${s.reasonsBreakdown.cfo_tasks.formattedDuration}"`,
      s.reasonsBreakdown.other.count,
      `"${s.reasonsBreakdown.other.formattedDuration}"`,
      s.missedScansCount
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Staff_Duty_Monthly_Hours_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Find max minutes for relative bar visualization
  const maxStaffMinutes = useMemo(() => {
    return Math.max(...monthlyStats.staffSummaries.map((s) => s.totalMinutes), 1);
  }, [monthlyStats]);

  return (
    <div className="space-y-6">
      
      {/* Top Controls & Month Filter Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200">
                <Users className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Staff Duty Outside Tracking & Monthly Hours
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Track duty counts, reason breakdowns, and total hours spent out of the office for every staff member.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Month Picker */}
            <div className="flex items-center bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 mr-2 text-indigo-600 shrink-0" />
              <span className="text-slate-500 mr-1.5">Period:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent font-semibold text-slate-900 focus:outline-hidden cursor-pointer"
              >
                {availableMonths.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
                <option value="all">All Recorded Months</option>
              </select>
            </div>

            {/* Export CSV */}
            <button
              onClick={handleExportMonthlyCSV}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors shadow-2xs"
              title="Download full monthly breakdown for payroll and HR audit"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
              Export Timesheet (CSV)
            </button>
          </div>
        </div>

        {/* Executive KPI Summary for Selected Month */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-5 pt-5 border-t border-slate-100">
          
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Staff on Duty Outside
            </span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-2xl font-black text-slate-900">
                {monthlyStats.activeStaffCount}
              </span>
              <span className="text-xs text-slate-500">Employees</span>
            </div>
          </div>

          <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200/70">
            <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider block">
              Total Duty Movements
            </span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-2xl font-black text-indigo-950">
                {monthlyStats.totalCompanyDuties}
              </span>
              <span className="text-xs text-indigo-600">Requests</span>
            </div>
          </div>

          <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70">
            <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">
              Total Hours Outside Office
            </span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-2xl font-black text-amber-950">
                {monthlyStats.formattedCompanyHours}
              </span>
              <span className="text-xs text-amber-700 font-medium">({monthlyStats.totalCompanyHoursDecimal} hrs)</span>
            </div>
          </div>

          <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-200/70">
            <span className="text-[11px] font-semibold text-violet-800 uppercase tracking-wider block">
              Working vs Beside Hours
            </span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-xl font-black text-violet-950">
                {monthlyStats.formattedWithinWorkingHours}
              </span>
              <span className="text-[10px] text-violet-700 font-medium">within {WORKING_HOURS_LABEL}</span>
            </div>
            <div className="flex items-center mt-0.5 text-[11px] font-semibold text-amber-800">
              <span className="w-2 h-2 rounded-sm bg-amber-500 mr-1 shrink-0" />
              {monthlyStats.formattedBesideWorkingHours}
              <span className="ml-1 font-medium text-slate-500">beside hours (outside {WORKING_HOURS_LABEL})</span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Most Active Staff
            </span>
            <div className="mt-0.5">
              {monthlyStats.topDutyStaff ? (
                <div>
                  <span className="text-sm font-bold text-slate-900 block truncate">
                    {monthlyStats.topDutyStaff.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {monthlyStats.topDutyStaff.hours} hrs ({monthlyStats.topDutyStaff.count} trips)
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-400">No duty records</span>
              )}
            </div>
          </div>

        </div>

        {/* Executive Compliance & 3-Strike Warning Overview Banner */}
        <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-slate-950 uppercase tracking-wider">
                Policy Compliance
              </span>
              <span className="text-xs text-indigo-300 font-semibold">3-Strike Progressive Warning Framework</span>
            </div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>Staff Duty Submission Timing & Retroactive Log Audit</span>
            </h3>
            <p className="text-[11px] text-slate-300">
              Evaluates on-time departures vs. retroactive (late) entries under Directive <strong>APA-MEMO_09-2026_05</strong>.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0 text-center">
            <div className="px-3 py-2 bg-white/10 rounded-lg border border-white/10">
              <span className="text-[10px] text-indigo-200 block uppercase font-medium">Compliance Rate</span>
              <span className="text-base font-black text-emerald-400">{monthlyStats.companyComplianceRate}%</span>
            </div>
            <div className="px-3 py-2 bg-white/10 rounded-lg border border-white/10">
              <span className="text-[10px] text-indigo-200 block uppercase font-medium">Advance Bookings</span>
              <span className="text-base font-black text-sky-400">{monthlyStats.totalAdvance}</span>
            </div>
            <div className="px-3 py-2 bg-white/10 rounded-lg border border-white/10">
              <span className="text-[10px] text-indigo-200 block uppercase font-medium">Late / Retro</span>
              <span className="text-base font-black text-rose-400">{monthlyStats.totalRetroactive}</span>
            </div>
            <div className="px-3 py-2 bg-white/10 rounded-lg border border-white/10">
              <span className="text-[10px] text-indigo-200 block uppercase font-medium">Active Strikes</span>
              <span className={`text-base font-black ${monthlyStats.totalStrikes > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {monthlyStats.totalStrikes}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Visual Graphical Analytics (recharts) */}
      <StaffMonthlyCharts
        staffSummaries={monthlyStats.staffSummaries}
        monthlyStats={monthlyStats}
        requests={requests}
        onSelectStaff={(staff) => setSelectedStaff(staff)}
      />

      {/* Main Staff Leaderboard Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Search & Sort Filters */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search staff name or position..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Compliance Filter Tabs */}
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setComplianceFilter('all')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  complianceFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({monthlyStats.staffSummaries.length})
              </button>
              <button
                type="button"
                onClick={() => setComplianceFilter('warnings')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center ${
                  complianceFilter === 'warnings'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-rose-700 hover:text-rose-900 hover:bg-rose-50'
                }`}
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Under Warning ({monthlyStats.staffSummaries.filter(s => s.strikesCount > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setComplianceFilter('clean')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center ${
                  complianceFilter === 'clean'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50'
                }`}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Clean ({monthlyStats.staffSummaries.filter(s => s.strikesCount === 0).length})
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs w-full lg:w-auto justify-between lg:justify-end">
            <span className="text-slate-500 flex items-center">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1 text-slate-400" /> Sort by:
            </span>
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
              <button
                onClick={() => setSortBy('hours')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  sortBy === 'hours' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hours Spent
              </button>
              <button
                onClick={() => setSortBy('duties')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  sortBy === 'duties' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Duty Count
              </button>
              <button
                onClick={() => setSortBy('strikes')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  sortBy === 'strikes' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Strikes Count
              </button>
              <button
                onClick={() => setSortBy('name')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  sortBy === 'name' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Staff Name
              </button>
            </div>
          </div>
        </div>

        {/* Table / Mobile Cards Content */}
        {filteredStaff.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No duty outside records found</p>
            <p className="text-xs text-slate-500 mt-1">
              {searchTerm ? 'Try adjusting your search criteria.' : `No staff went outside in ${monthlyStats.monthDisplay}.`}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile View (< md): High-Clarity Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredStaff.map((staff, idx) => {
                return (
                  <div 
                    key={`mobile-${staff.staffName}`}
                    className="p-4 space-y-3 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedStaff(staff)}
                  >
                    {/* Header: Avatar, Name, Position & Trips */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-700 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                          {staff.staffName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                            <span className="truncate">{staff.staffName}</span>
                            {idx === 0 && sortBy === 'hours' && (
                              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300">
                                Top Hours
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 block truncate">
                            {staff.positions[0] || 'Staff'} {staff.departments[0] ? `• ${staff.departments[0]}` : ''}
                          </span>
                        </div>
                      </div>

                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                        {staff.totalDuties} trip{staff.totalDuties === 1 ? '' : 's'}
                      </span>
                    </div>

                    {/* Total Hours with Progress Bar */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium flex items-center">
                          <Clock className="w-3.5 h-3.5 mr-1 text-indigo-600" /> Total Time Outside:
                        </span>
                        <div className="text-right">
                          <strong className="text-slate-900 text-sm">{staff.formattedTotalDuration}</strong>
                          <span className="text-[10px] text-slate-500 ml-1">({staff.totalHoursDecimal} hrs)</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden flex">
                        <div
                          className="h-full bg-indigo-500"
                          style={{ width: `${staff.totalMinutes > 0 ? (staff.withinWorkingMinutes / staff.totalMinutes) * 100 : 0}%` }}
                          title={`Within ${WORKING_HOURS_LABEL}: ${staff.formattedWithinWorking}`}
                        />
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${staff.totalMinutes > 0 ? (staff.besideWorkingMinutes / staff.totalMinutes) * 100 : 0}%` }}
                          title={`Beside working hours: ${staff.formattedBesideWorking}`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span className="flex items-center">
                          <span className="w-2 h-2 rounded-sm bg-indigo-500 mr-1 shrink-0" />
                          Within {WORKING_HOURS_LABEL}:&nbsp;<strong className="text-slate-700 font-semibold">{staff.formattedWithinWorking}</strong>
                        </span>
                        <span className="flex items-center">
                          <span className="w-2 h-2 rounded-sm bg-amber-500 mr-1 shrink-0" />
                          Beside:&nbsp;<strong className={`font-semibold ${staff.besideWorkingMinutes > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{staff.formattedBesideWorking}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Timing & Strike Status on Mobile Card */}
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Directive Compliance</span>
                        {getStrikeBadge(staff.strikeLevel, staff.strikesCount)}
                      </div>
                      <div className="text-right text-[10px] text-slate-500">
                        <span className="font-semibold text-emerald-700 block">{staff.onTimeDuties} On-Time</span>
                        <span className="text-slate-400">
                          {staff.advanceDuties > 0 && `${staff.advanceDuties} adv, `}
                          {staff.retroactiveDuties > 0 ? (
                            <strong className="text-rose-600 font-bold">{staff.retroactiveDuties} late</strong>
                          ) : '0 late'}
                        </span>
                      </div>
                    </div>

                    {/* Stats Grid: Avg trip duration & scans */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-white border border-slate-200/70">
                        <span className="text-[10px] text-slate-400 block">Avg. Trip Time</span>
                        <span className="font-semibold text-slate-800">{staff.formattedAverageDuration}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-slate-200/70">
                        <span className="text-[10px] text-slate-400 block">Fingerprint Scans</span>
                        <span className="font-semibold text-blue-700 flex items-center mt-0.5">
                          <Fingerprint className="w-3 h-3 mr-1 text-blue-600" />
                          {staff.missedScansCount} scan{staff.missedScansCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    {/* Reason badges */}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {staff.reasonsBreakdown.bank.count > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <Landmark className="w-3 h-3 mr-1 text-emerald-600" /> Bank: {staff.reasonsBreakdown.bank.count}x
                        </span>
                      )}
                      {staff.reasonsBreakdown.gdt.count > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-800 border border-blue-200">
                          <Building2 className="w-3 h-3 mr-1 text-blue-600" /> GDT: {staff.reasonsBreakdown.gdt.count}x
                        </span>
                      )}
                      {staff.reasonsBreakdown.meet_gdt.count > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-800 border border-purple-200">
                          <Users className="w-3 h-3 mr-1 text-purple-600" /> Meet GDT: {staff.reasonsBreakdown.meet_gdt.count}x
                        </span>
                      )}
                      {staff.reasonsBreakdown.cfo_tasks.count > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          <Briefcase className="w-3 h-3 mr-1 text-amber-600" /> CFO: {staff.reasonsBreakdown.cfo_tasks.count}x
                        </span>
                      )}
                      {staff.reasonsBreakdown.other.count > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          Other: {staff.reasonsBreakdown.other.count}x
                        </span>
                      )}
                    </div>

                    {/* View Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStaff(staff);
                      }}
                      className="w-full py-2 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center justify-center transition-colors shadow-2xs"
                    >
                      <span>View Timesheet & Duty Log</span>
                      <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Desktop View (>= md): Full Detailed Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Monthly Trips</th>
                    <th className="py-3 px-4 min-w-[180px]">Total Hours Spent Outside</th>
                    <th className="py-3 px-4 min-w-[170px]">Timing & Strike Status</th>
                    <th className="py-3 px-4">Avg. Trip Time</th>
                    <th className="py-3 px-4 min-w-[250px]">Reason Breakdown (Counts & Hours)</th>
                    <th className="py-3 px-4">Scans Justified</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStaff.map((staff, idx) => {
                    const percentOfMax = Math.min(100, Math.round((staff.totalMinutes / maxStaffMinutes) * 100));

                    return (
                      <tr
                        key={staff.staffName}
                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                        onClick={() => setSelectedStaff(staff)}
                      >
                        {/* Staff Name & Position */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-700 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                              {staff.staffName.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center">
                                <span>{staff.staffName}</span>
                                {idx === 0 && sortBy === 'hours' && (
                                  <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300">
                                    Top Hours
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 block truncate max-w-xs">
                                {staff.positions[0] || 'Staff'} {staff.departments[0] ? `• ${staff.departments[0]}` : ''}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Trips Count */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {staff.totalDuties} trip{staff.totalDuties === 1 ? '' : 's'}
                          </span>
                        </td>

                        {/* Total Hours Spent Outside with within/beside working-hours split */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-black text-slate-900">
                                {staff.formattedTotalDuration}
                              </span>
                              <span className="text-[11px] font-medium text-slate-500">
                                {staff.totalHoursDecimal} hrs
                              </span>
                            </div>
                            <div
                              className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200 flex"
                              title={`${staff.formattedTotalDuration} (${percentOfMax}% of top staff)`}
                            >
                              <div
                                className="h-full bg-indigo-500"
                                style={{
                                  width: `${staff.totalMinutes > 0 ? (staff.withinWorkingMinutes / staff.totalMinutes) * 100 : 0}%`
                                }}
                                title={`Within ${WORKING_HOURS_LABEL}: ${staff.formattedWithinWorking}`}
                              />
                              <div
                                className="h-full bg-amber-500"
                                style={{
                                  width: `${staff.totalMinutes > 0 ? (staff.besideWorkingMinutes / staff.totalMinutes) * 100 : 0}%`
                                }}
                                title={`Beside working hours: ${staff.formattedBesideWorking}`}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span className="flex items-center" title={`Within ${WORKING_HOURS_LABEL}`}>
                                <span className="w-2 h-2 rounded-sm bg-indigo-500 mr-1 shrink-0" />
                                Within:&nbsp;<strong className="text-slate-700 font-semibold">{staff.formattedWithinWorking}</strong>
                              </span>
                              <span
                                className="flex items-center"
                                title={`Beside working hours (before 8:00 AM or after 5:00 PM). Counted in total.`}
                              >
                                <span className="w-2 h-2 rounded-sm bg-amber-500 mr-1 shrink-0" />
                                Beside:&nbsp;<strong className={`font-semibold ${staff.besideWorkingMinutes > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{staff.formattedBesideWorking}</strong>
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Timing & Strike Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <div>{getStrikeBadge(staff.strikeLevel, staff.strikesCount)}</div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              <span className="text-emerald-700 font-semibold">{staff.onTimeDuties} on-time</span>
                              {staff.advanceDuties > 0 && <span className="text-sky-700">, {staff.advanceDuties} adv</span>}
                              {staff.retroactiveDuties > 0 ? (
                                <span className="text-rose-600 font-bold">, {staff.retroactiveDuties} late</span>
                              ) : (
                                <span className="text-slate-400">, 0 late</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Average Trip Duration */}
                        <td className="py-3.5 px-4 text-slate-700 font-medium whitespace-nowrap">
                          {staff.formattedAverageDuration}
                        </td>

                        {/* Reasons Breakdown */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1.5">
                            {staff.reasonsBreakdown.bank.count > 0 && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
                                title={`Bank: ${staff.reasonsBreakdown.bank.formattedDuration}`}
                              >
                                <Landmark className="w-3 h-3 mr-1 text-emerald-600" />
                                Bank: <strong>{staff.reasonsBreakdown.bank.count}x</strong> ({staff.reasonsBreakdown.bank.formattedDuration})
                              </span>
                            )}

                            {staff.reasonsBreakdown.gdt.count > 0 && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200"
                                title={`GDT: ${staff.reasonsBreakdown.gdt.formattedDuration}`}
                              >
                                <Building2 className="w-3 h-3 mr-1 text-blue-600" />
                                GDT: <strong>{staff.reasonsBreakdown.gdt.count}x</strong> ({staff.reasonsBreakdown.gdt.formattedDuration})
                              </span>
                            )}

                            {staff.reasonsBreakdown.meet_gdt.count > 0 && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 text-purple-800 border border-purple-200"
                                title={`Meet GDT: ${staff.reasonsBreakdown.meet_gdt.formattedDuration}`}
                              >
                                <Users className="w-3 h-3 mr-1 text-purple-600" />
                                Meet GDT: <strong>{staff.reasonsBreakdown.meet_gdt.count}x</strong> ({staff.reasonsBreakdown.meet_gdt.formattedDuration})
                              </span>
                            )}

                            {staff.reasonsBreakdown.cfo_tasks.count > 0 && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200"
                                title={`CFO Tasks: ${staff.reasonsBreakdown.cfo_tasks.formattedDuration}`}
                              >
                                <Briefcase className="w-3 h-3 mr-1 text-amber-600" />
                                CFO: <strong>{staff.reasonsBreakdown.cfo_tasks.count}x</strong> ({staff.reasonsBreakdown.cfo_tasks.formattedDuration})
                              </span>
                            )}

                            {staff.reasonsBreakdown.other.count > 0 && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                                title={`Other Duties: ${staff.reasonsBreakdown.other.formattedDuration}`}
                              >
                                <HelpCircle className="w-3 h-3 mr-1 text-slate-500" />
                                Other: <strong>{staff.reasonsBreakdown.other.count}x</strong> ({staff.reasonsBreakdown.other.formattedDuration})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Fingerprint Scans Justified */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center text-slate-700 font-semibold">
                            <Fingerprint className="w-3.5 h-3.5 mr-1 text-blue-600" />
                            {staff.missedScansCount} scan{staff.missedScansCount === 1 ? '' : 's'}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStaff(staff);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 inline-flex items-center transition-colors"
                          >
                            View Timesheet <ChevronRight className="w-3.5 h-3.5 ml-1" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Detailed Staff Profile Drill-Down Modal */}
      {activeStaffDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-white font-black text-base shadow-inner">
                  {activeStaffDetail.staffName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-bold">{activeStaffDetail.staffName}</h3>
                    <span className="bg-indigo-500/30 text-indigo-200 text-xs font-medium px-2.5 py-0.5 rounded-full border border-indigo-400/30">
                      {monthlyStats.monthDisplay}
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200">
                    {activeStaffDetail.positions.join(' / ') || 'Staff Member'} 
                    {activeStaffDetail.departments.length > 0 ? ` • ${activeStaffDetail.departments.join(', ')}` : ''}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStaff(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              
              {/* Individual KPI Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                  <span className="text-[11px] font-semibold text-indigo-800 uppercase tracking-wider block">
                    Total Hours Outside
                  </span>
                  <div className="flex items-baseline space-x-1.5 mt-0.5">
                    <span className="text-2xl font-black text-indigo-950">
                      {activeStaffDetail.formattedTotalDuration}
                    </span>
                  </div>
                  <span className="text-[10px] text-indigo-600 font-medium">
                    {activeStaffDetail.totalHoursDecimal} billable hours
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                    Monthly Duty Count
                  </span>
                  <div className="flex items-baseline space-x-1.5 mt-0.5">
                    <span className="text-2xl font-black text-slate-900">
                      {activeStaffDetail.totalDuties}
                    </span>
                    <span className="text-xs text-slate-500">trips</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-medium">
                    {activeStaffDetail.completedDuties} completed return{activeStaffDetail.completedDuties === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                    Average Trip Duration
                  </span>
                  <div className="flex items-baseline space-x-1.5 mt-0.5">
                    <span className="text-2xl font-black text-slate-900">
                      {activeStaffDetail.formattedAverageDuration}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">per outside duty</span>
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                  <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider block">
                    Fingerprint Scans
                  </span>
                  <div className="flex items-baseline space-x-1.5 mt-0.5">
                    <span className="text-2xl font-black text-blue-950">
                      {activeStaffDetail.missedScansCount}
                    </span>
                    <span className="text-xs text-blue-700">scans</span>
                  </div>
                  <span className="text-[10px] text-blue-700 font-medium">reconciled with HR</span>
                </div>
              </div>

              {/* Compliance & Strike Audit Card for this staff member */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-slate-800 flex items-center">
                      <ShieldCheck className="w-4 h-4 mr-1 text-indigo-600" />
                      APA Attendance Policy & Strike Assessment
                    </span>
                    {getStrikeBadge(activeStaffDetail.strikeLevel, activeStaffDetail.strikesCount)}
                  </div>
                  <div className="text-xs text-slate-600">
                    Compliance Rate: <strong className="text-slate-900">{activeStaffDetail.complianceRate}%</strong>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block uppercase">On-Time Submissions</span>
                    <strong className="text-emerald-700 text-sm">{activeStaffDetail.onTimeDuties}</strong>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block uppercase">Advance Bookings</span>
                    <strong className="text-sky-700 text-sm">{activeStaffDetail.advanceDuties}</strong>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 block uppercase">Retroactive (Late) Entries</span>
                    <strong className={`text-sm ${activeStaffDetail.retroactiveDuties > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                      {activeStaffDetail.retroactiveDuties}
                    </strong>
                  </div>
                </div>

                {/* If staff has retroactive submissions, list them */}
                {activeStaffDetail.retroactiveDuties > 0 && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-800 block">
                      📋 Recorded Retroactive Entries & 48h Emergency Audit:
                    </span>
                    <div className="space-y-1.5">
                      {activeStaffDetail.dutyRecords
                        .filter(r => getSubmissionTiming(r) === 'retroactive')
                        .map(r => {
                          const isCompliant = isEmergencyGraceCompliant(r);
                          const isWaived = r.isWaivedByGM;

                          return (
                            <div key={r.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900">{r.id}</span>
                                  <span className="text-slate-600 font-medium">{r.date} ({r.timeOfDeparture} – {r.timeOfReturn || 'Pending'})</span>
                                  {isWaived ? (
                                    <span className="text-[10px] bg-purple-100 text-purple-900 border border-purple-200 font-bold px-1.5 py-0.2 rounded">
                                      Excused by GM
                                    </span>
                                  ) : isCompliant ? (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold px-1.5 py-0.2 rounded">
                                      48h Grace (0 Strikes)
                                    </span>
                                  ) : (
                                    <span className="text-[10px] bg-rose-100 text-rose-900 border border-rose-200 font-bold px-1.5 py-0.2 rounded">
                                      Strike Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-600 text-[11px] mt-0.5 italic">
                                  "{r.reasonOrPurpose}" {r.lateSubmissionReason ? `• Justification: ${r.lateSubmissionReason}` : '• No reason recorded'}
                                </p>
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                {!isWaived && onWaiveStrike && (
                                  <button
                                    type="button"
                                    onClick={() => onWaiveStrike(r.id, 'Waived under GM Executive Discretion')}
                                    className="px-2 py-1 bg-purple-700 hover:bg-purple-800 text-white font-bold text-[10px] rounded shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>Excuse Strike</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* Exact Breakdown by Reason */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
                  <span>Duty Reason & Hours Breakdown for {activeStaffDetail.staffName}</span>
                  <span className="text-[11px] font-normal text-slate-500">100% of external movements</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {[
                    { id: 'bank', label: 'Go to bank', icon: Landmark, bg: 'bg-emerald-50 border-emerald-200 text-emerald-900', stat: activeStaffDetail.reasonsBreakdown.bank },
                    { id: 'gdt', label: 'Go to GDT', icon: Building2, bg: 'bg-blue-50 border-blue-200 text-blue-900', stat: activeStaffDetail.reasonsBreakdown.gdt },
                    { id: 'meet_gdt', label: 'Go to meet GDT', icon: Users, bg: 'bg-purple-50 border-purple-200 text-purple-900', stat: activeStaffDetail.reasonsBreakdown.meet_gdt },
                    { id: 'cfo_tasks', label: 'Doing CFO tasks', icon: Briefcase, bg: 'bg-amber-50 border-amber-200 text-amber-900', stat: activeStaffDetail.reasonsBreakdown.cfo_tasks },
                    { id: 'other', label: 'Other Tasks', icon: HelpCircle, bg: 'bg-slate-100 border-slate-200 text-slate-800', stat: activeStaffDetail.reasonsBreakdown.other }
                  ].map((item) => {
                    const Icon = item.icon;
                    const count = item.stat?.count || 0;
                    const duration = item.stat?.formattedDuration || '0m';
                    const pct = item.stat?.percentageOfStaffHours || 0;

                    return (
                      <div key={item.id} className={`p-3 rounded-xl border ${item.bg} flex flex-col justify-between`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <Icon className="w-4 h-4 shrink-0 opacity-80" />
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/80 border border-current/20">
                            {pct}% time
                          </span>
                        </div>
                        <span className="text-xs font-bold block">{item.label}</span>
                        <div className="mt-2 pt-2 border-t border-current/15 flex items-baseline justify-between text-[11px]">
                          <span><strong>{count}</strong> trip{count === 1 ? '' : 's'}</span>
                          <span className="font-extrabold">{duration}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Complete Trip History Table for This Staff */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Chronological Duty Outside Log ({activeStaffDetail.dutyRecords.length} Record{activeStaffDetail.dutyRecords.length === 1 ? '' : 's'})
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Showing all departure & return timestamps
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Departure & Return</th>
                        <th className="py-2.5 px-3">Duration</th>
                        <th className="py-2.5 px-3">Reason / Purpose</th>
                        <th className="py-2.5 px-3">Destination</th>
                        <th className="py-2.5 px-3">Status</th>
                        {onViewRequestDetails && <th className="py-2.5 px-3 text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeStaffDetail.dutyRecords.map((req) => {
                        const dur = calculateDutyDuration(req.timeOfDeparture, req.timeOfReturn, req.isReturnPending, req.date);

                        return (
                          <tr key={req.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                              {req.date}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="text-amber-700 font-semibold">{req.timeOfDeparture}</span>
                              <span className="text-slate-400 mx-1.5">→</span>
                              <span className={req.isReturnPending ? 'text-amber-600 font-medium' : 'text-emerald-700 font-semibold'}>
                                {req.isReturnPending ? 'Pending Return' : req.timeOfReturn}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                {dur.formatted}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 max-w-xs">
                              <div className="mb-0.5">
                                <DutyReasonBadge reason={req.reasonOrPurpose} short />
                              </div>
                              <p className="line-clamp-1 text-slate-700 text-[11px]" title={req.reasonOrPurpose}>
                                {req.reasonOrPurpose}
                              </p>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px] truncate max-w-[150px]">
                              {req.destination || 'Not specified'}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {req.status === 'returned' && (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  Returned
                                </span>
                              )}
                              {req.status === 'active' && (
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  Currently Outside
                                </span>
                              )}
                              {req.status === 'incomplete' && (
                                <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                  Incomplete (Sec 4)
                                </span>
                              )}
                            </td>
                            {onViewRequestDetails && (
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onViewRequestDetails(req);
                                  }}
                                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center"
                                >
                                  Details <ExternalLink className="w-3 h-3 ml-0.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Data synchronized with attendance & fingerprint registers
              </span>
              <button
                onClick={() => setSelectedStaff(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors"
              >
                Close Timesheet
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
