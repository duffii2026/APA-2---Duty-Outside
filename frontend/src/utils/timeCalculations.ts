import { DutyOutsideRequest, DisciplinaryNoticeLevel, SubmissionTiming } from '../types';
import { detectDutyCategory } from './dutyReasons';

export interface DutyDuration {
  minutes: number;
  hours: number;
  formatted: string; // e.g. "2h 25m"
  decimalHours: number; // e.g. 2.42
  isEstimatedOrOngoing: boolean;
  /** Minutes of the duty that fall inside standard working hours (08:00 – 17:00). */
  withinWorkingMinutes: number;
  /** Minutes of the duty that fall outside (before 08:00 or after 17:00) — the "beside hour". */
  besideWorkingMinutes: number;
  formattedWithinWorking: string; // e.g. "30m"
  formattedBesideWorking: string; // e.g. "30m"
}

/**
 * Standard office working hours used to split duty time into
 * "within working hours" and "beside working hours".
 * APA office hours are 08:00 – 17:00.
 */
export const WORKING_HOURS_START_MINUTES = 8 * 60; // 08:00
export const WORKING_HOURS_END_MINUTES = 17 * 60; // 17:00
export const WORKING_HOURS_LABEL = '8:00 AM – 5:00 PM';

/** Formats a raw minute count as "2h 25m" / "2h" / "25m". */
export function formatDurationMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  return hrs > 0 ? (mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`) : `${mins}m`;
}

/**
 * Splits an absolute duty interval (in minutes from midnight on the duty day)
 * into the portion inside working hours and the portion "beside" them.
 * Return minutes may exceed 1440 when a duty crosses midnight; any time past
 * midnight is counted as beside working hours.
 */
function splitWorkingAndBeside(
  depMinutes: number,
  retMinutes: number
): { within: number; beside: number } {
  const total = Math.max(0, retMinutes - depMinutes);
  const rawWithin =
    Math.min(retMinutes, WORKING_HOURS_END_MINUTES) -
    Math.max(depMinutes, WORKING_HOURS_START_MINUTES);
  const within = Math.max(0, Math.min(rawWithin, total));
  return { within, beside: total - within };
}

/**
 * Determines whether a request was submitted in advance, on-time, or retroactively.
 */
export function getSubmissionTiming(req: DutyOutsideRequest): SubmissionTiming {
  if (req.submissionTiming) return req.submissionTiming;
  if (req.isRetroactive) return 'retroactive';

  try {
    const createdDate = req.createdAt ? req.createdAt.split('T')[0] : '';
    if (req.date && createdDate) {
      if (req.date > createdDate) return 'advance';
      if (req.date < createdDate) return 'retroactive';
    }
  } catch (e) {
    // Ignore parse error
  }

  return 'on_time';
}

/**
 * Checks if a retroactive duty qualifies for the 48-hour emergency grace period with explanation.
 * - GM waived duties are always compliant.
 * - Non-retroactive duties are always compliant.
 * - Retroactive duties submitted within 48h with a valid reason (or Monday 10:00 AM for Friday duties)
 *   are granted an authorized emergency exemption (0 strikes).
 */
export function isEmergencyGraceCompliant(req: DutyOutsideRequest): boolean {
  if (req.isWaivedByGM) return true;
  if (!req.isRetroactive && getSubmissionTiming(req) !== 'retroactive') return true;

  // Must have a valid recorded justification to qualify for emergency grace
  if (!req.lateSubmissionReason || !req.lateSubmissionReason.trim()) {
    return false;
  }

  try {
    const dutyStart = new Date(`${req.date}T${req.timeOfDeparture}:00`).getTime();
    const created = req.createdAt ? new Date(req.createdAt).getTime() : dutyStart;
    const hoursDiff = (created - dutyStart) / (1000 * 60 * 60);

    // Weekend rollover (APA-MEMO Section 4): a Friday duty must be logged by
    // Monday 10:00 AM. This is a fixed wall-clock deadline, not a fixed hour
    // count — 72h from departure lands at 09:00 for a 09:00 Friday duty and
    // 17:00 for a 17:00 one, which mis-grades in both directions.
    const dutyDay = new Date(`${req.date}T12:00:00`).getDay();
    if (dutyDay === 5) {
      const deadline = new Date(`${req.date}T10:00:00`);
      deadline.setDate(deadline.getDate() + 3); // Friday + 3 days = Monday
      return created <= deadline.getTime();
    }

    return hoursDiff <= 48;
  } catch (e) {
    return true;
  }
}

/**
 * Calculates duration in minutes and hours between departure and return times.
 * Handles "HH:MM", "H:MM", 12h or 24h formats.
 */
export function calculateDutyDuration(
  departureTime: string,
  returnTime: string | null,
  isPending: boolean,
  dutyDate?: string
): DutyDuration {
  if (!departureTime) {
    return {
      minutes: 0,
      hours: 0,
      formatted: '0m',
      decimalHours: 0,
      isEstimatedOrOngoing: false,
      withinWorkingMinutes: 0,
      besideWorkingMinutes: 0,
      formattedWithinWorking: '0m',
      formattedBesideWorking: '0m'
    };
  }

  const parseTimeToMinutes = (timeStr: string): number => {
    const clean = timeStr.trim().toLowerCase();
    const isPM = clean.includes('pm');
    const isAM = clean.includes('am');
    const timeOnly = clean.replace(/[ap]m/, '').trim();
    const parts = timeOnly.split(':');
    let hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    return hours * 60 + minutes;
  };

  const depMinutes = parseTimeToMinutes(departureTime);

  // If return time is confirmed
  if (returnTime && !isPending) {
    let retMinutes = parseTimeToMinutes(returnTime);
    // If returned past midnight or next day
    if (retMinutes < depMinutes) {
      retMinutes += 24 * 60;
    }
    const diff = Math.max(0, retMinutes - depMinutes);
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    const formatted = hrs > 0 ? (mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`) : `${mins}m`;
    const split = splitWorkingAndBeside(depMinutes, retMinutes);

    return {
      minutes: diff,
      hours: hrs,
      formatted,
      decimalHours: Number((diff / 60).toFixed(2)),
      isEstimatedOrOngoing: false,
      withinWorkingMinutes: split.within,
      besideWorkingMinutes: split.beside,
      formattedWithinWorking: formatDurationMinutes(split.within),
      formattedBesideWorking: formatDurationMinutes(split.beside)
    };
  }

  // If return is pending, check if it's today
  const todayStr = new Date().toISOString().split('T')[0];
  if (isPending && dutyDate === todayStr) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const retMinutes = currentMinutes < depMinutes ? currentMinutes + 24 * 60 : currentMinutes;
    const diff = Math.max(0, retMinutes - depMinutes);
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    const formatted = hrs > 0 ? (mins > 0 ? `${hrs}h ${mins}m (ongoing)` : `${hrs}h (ongoing)`) : `${mins}m (ongoing)`;
    const split = splitWorkingAndBeside(depMinutes, retMinutes);

    return {
      minutes: diff,
      hours: hrs,
      formatted,
      decimalHours: Number((diff / 60).toFixed(2)),
      isEstimatedOrOngoing: true,
      withinWorkingMinutes: split.within,
      besideWorkingMinutes: split.beside,
      formattedWithinWorking: formatDurationMinutes(split.within),
      formattedBesideWorking: formatDurationMinutes(split.beside)
    };
  }

  // Default fallback for incomplete past pending returns
  return {
    minutes: 0,
    hours: 0,
    formatted: 'Pending Return',
    decimalHours: 0,
    isEstimatedOrOngoing: true,
    withinWorkingMinutes: 0,
    besideWorkingMinutes: 0,
    formattedWithinWorking: '0m',
    formattedBesideWorking: '0m'
  };
}

export interface ReasonStat {
  categoryId: string;
  categoryLabel: string;
  count: number;
  totalMinutes: number;
  totalHoursDecimal: number;
  formattedDuration: string;
  percentageOfStaffHours: number;
}

export interface StaffMonthlySummary {
  staffName: string;
  positions: string[];
  departments: string[];
  totalDuties: number;
  totalMinutes: number;
  totalHoursDecimal: number;
  formattedTotalDuration: string;
  /** Minutes of duty inside standard working hours (08:00 – 17:00). */
  withinWorkingMinutes: number;
  /** Minutes of duty beside working hours (before 08:00 or after 17:00). */
  besideWorkingMinutes: number;
  withinWorkingHoursDecimal: number;
  besideWorkingHoursDecimal: number;
  formattedWithinWorking: string;
  formattedBesideWorking: string;
  averageMinutesPerDuty: number;
  formattedAverageDuration: string;
  completedDuties: number;
  pendingDuties: number;
  incompleteDuties: number;
  missedScansCount: number;
  reasonsBreakdown: Record<string, ReasonStat>;
  dutyRecords: DutyOutsideRequest[];
  // Compliance & 3-Strike Warning Tracking
  onTimeDuties: number;
  advanceDuties: number;
  retroactiveDuties: number;
  excusedEmergencies?: number;
  gmWaivedDuties?: number;
  strikesCount: number;
  strikeLevel: DisciplinaryNoticeLevel;
  complianceRate: number; // percentage
}

export interface MonthlyCompanyStats {
  monthKey: string; // "YYYY-MM"
  monthDisplay: string; // "September 2026"
  totalCompanyDuties: number;
  totalCompanyMinutes: number;
  totalCompanyHoursDecimal: number;
  formattedCompanyHours: string;
  /** Company-wide minutes inside standard working hours (08:00 – 17:00). */
  totalWithinWorkingMinutes: number;
  /** Company-wide minutes beside working hours (before 08:00 or after 17:00). */
  totalBesideWorkingMinutes: number;
  totalWithinWorkingHoursDecimal: number;
  totalBesideWorkingHoursDecimal: number;
  formattedWithinWorkingHours: string;
  formattedBesideWorkingHours: string;
  activeStaffCount: number;
  reasonsDistribution: Record<string, { count: number; minutes: number; label: string }>;
  topDutyStaff: { name: string; hours: number; count: number } | null;
  // Global Compliance Stats
  totalOnTime: number;
  totalAdvance: number;
  totalRetroactive: number;
  totalStrikes: number;
  companyComplianceRate: number;
  staffSummaries: StaffMonthlySummary[];
}

/**
 * Extracts list of available unique months (YYYY-MM) from all requests.
 */
export function getAvailableMonths(requests: DutyOutsideRequest[]): { key: string; label: string }[] {
  const monthMap = new Map<string, string>();

  requests.forEach((req) => {
    if (!req.date) return;
    const [year, month] = req.date.split('-');
    if (year && month) {
      const key = `${year}-${month}`;
      const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const label = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      monthMap.set(key, label);
    }
  });

  // Ensure current month is always present
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  if (!monthMap.has(currentKey)) {
    monthMap.set(currentKey, currentLabel);
  }

  return Array.from(monthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, label]) => ({ key, label }));
}

/**
 * Aggregates all staff requests for a specific month (or all months).
 */
export function calculateStaffMonthlyAnalytics(
  requests: DutyOutsideRequest[],
  selectedMonthKey: string = 'all'
): MonthlyCompanyStats {
  // Filter by month if not 'all'
  const filtered = selectedMonthKey === 'all'
    ? requests
    : requests.filter((r) => r.date && r.date.startsWith(selectedMonthKey));

  const staffMap = new Map<string, {
    staffName: string;
    positions: Set<string>;
    departments: Set<string>;
    records: DutyOutsideRequest[];
  }>();

  // Populate staff including employeesOnDuty
  filtered.forEach((req) => {
    const participants = new Set<string>();
    if (req.requesterName) participants.add(req.requesterName.trim());
    if (Array.isArray(req.employeesOnDuty)) {
      req.employeesOnDuty.forEach((p) => {
        if (p && p.trim()) participants.add(p.trim());
      });
    }

    participants.forEach((name) => {
      if (!staffMap.has(name)) {
        staffMap.set(name, {
          staffName: name,
          positions: new Set<string>(),
          departments: new Set<string>(),
          records: []
        });
      }
      const entry = staffMap.get(name)!;
      if (req.position) entry.positions.add(req.position);
      if (req.department) entry.departments.add(req.department);
      entry.records.push(req);
    });
  });

  let totalCompanyMinutes = 0;
  let totalCompanyWithinWorkingMinutes = 0;
  let totalCompanyBesideWorkingMinutes = 0;
  const companyReasonsDist: Record<string, { count: number; minutes: number; label: string }> = {
    bank: { count: 0, minutes: 0, label: 'Go to bank' },
    gdt: { count: 0, minutes: 0, label: 'Go to GDT' },
    meet_gdt: { count: 0, minutes: 0, label: 'Go to meet GDT' },
    cfo_tasks: { count: 0, minutes: 0, label: 'Doing CFO tasks' },
    other: { count: 0, minutes: 0, label: 'Other' }
  };

  const staffSummaries: StaffMonthlySummary[] = [];

  let totalCompanyOnTime = 0;
  let totalCompanyAdvance = 0;
  let totalCompanyRetroactive = 0;
  let totalCompanyCompliant = 0;
  let totalCompanyStrikes = 0;

  staffMap.forEach((entry, staffName) => {
    let totalMinutes = 0;
    let totalWithinWorkingMinutes = 0;
    let totalBesideWorkingMinutes = 0;
    let completed = 0;
    let pending = 0;
    let incomplete = 0;
    let missedScans = 0;

    let onTimeDuties = 0;
    let advanceDuties = 0;
    let retroactiveDuties = 0;
    let excusedEmergencies = 0;
    let gmWaivedDuties = 0;
    let unexcusedViolations = 0;
    let compliantCount = 0;
    let abandonedIncompleteCount = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    const reasonsMap: Record<string, ReasonStat> = {
      bank: { categoryId: 'bank', categoryLabel: 'Go to bank', count: 0, totalMinutes: 0, totalHoursDecimal: 0, formattedDuration: '0m', percentageOfStaffHours: 0 },
      gdt: { categoryId: 'gdt', categoryLabel: 'Go to GDT', count: 0, totalMinutes: 0, totalHoursDecimal: 0, formattedDuration: '0m', percentageOfStaffHours: 0 },
      meet_gdt: { categoryId: 'meet_gdt', categoryLabel: 'Go to meet GDT', count: 0, totalMinutes: 0, totalHoursDecimal: 0, formattedDuration: '0m', percentageOfStaffHours: 0 },
      cfo_tasks: { categoryId: 'cfo_tasks', categoryLabel: 'Doing CFO tasks', count: 0, totalMinutes: 0, totalHoursDecimal: 0, formattedDuration: '0m', percentageOfStaffHours: 0 },
      other: { categoryId: 'other', categoryLabel: 'Other', count: 0, totalMinutes: 0, totalHoursDecimal: 0, formattedDuration: '0m', percentageOfStaffHours: 0 }
    };

    entry.records.forEach((req) => {
      const dur = calculateDutyDuration(req.timeOfDeparture, req.timeOfReturn, req.isReturnPending, req.date);
      totalMinutes += dur.minutes;
      totalWithinWorkingMinutes += dur.withinWorkingMinutes;
      totalBesideWorkingMinutes += dur.besideWorkingMinutes;

      if (req.status === 'returned' || req.isDirectToHome) completed++;
      else if (req.status === 'incomplete') incomplete++;
      else pending++;

      if (Array.isArray(req.missedFingerprintScans)) {
        missedScans += req.missedFingerprintScans.length;
      }

      if (req.isWaivedByGM) {
        gmWaivedDuties++;
      }

      // Check abandoned incomplete return:
      // Only count as abandoned strike if the duty date is in the past (before today),
      // because if the duty is today, staff may legitimately be out on assignment.
      const isPastDuty = req.date && req.date < todayStr;
      // A GM-waived record is officially excused (APA-MEMO Section 5) and can
      // never contribute a strike — including the abandoned-return strike.
      if (!req.isWaivedByGM) {
        if (req.isReturnPending && !req.isDirectToHome && isPastDuty) {
          abandonedIncompleteCount++;
        } else if (req.status === 'incomplete') {
          abandonedIncompleteCount++;
        }
      }

      // Timing check. A record counts as compliant unless it is an unexcused
      // retroactive violation. Tracked per record so that a GM-waived or
      // emergency-exempted record is never counted twice in the numerator.
      const timing = getSubmissionTiming(req);
      let isCompliantRecord = true;
      if (timing === 'advance') {
        advanceDuties++;
      } else if (timing === 'retroactive') {
        retroactiveDuties++;
        if (req.isWaivedByGM) {
          // Explicitly excused by General Manager Mr. Shawn
        } else if (isEmergencyGraceCompliant(req)) {
          // Authorized emergency exemption within 48 hours
          excusedEmergencies++;
        } else {
          // Overdue or unexcused retroactive violation
          unexcusedViolations++;
          isCompliantRecord = false;
        }
      } else {
        onTimeDuties++;
      }
      if (isCompliantRecord) compliantCount++;

      // Reason categorization
      const category = detectDutyCategory(req.reasonOrPurpose);
      const catKey = category.id in reasonsMap ? category.id : 'other';
      reasonsMap[catKey].count += 1;
      reasonsMap[catKey].totalMinutes += dur.minutes;

      // Global company bucket
      if (!companyReasonsDist[catKey]) {
        companyReasonsDist[catKey] = { count: 0, minutes: 0, label: category.label };
      }
      companyReasonsDist[catKey].count += 1;
      companyReasonsDist[catKey].minutes += dur.minutes;
    });

    totalCompanyMinutes += totalMinutes;
    totalCompanyWithinWorkingMinutes += totalWithinWorkingMinutes;
    totalCompanyBesideWorkingMinutes += totalBesideWorkingMinutes;
    totalCompanyOnTime += onTimeDuties;
    totalCompanyAdvance += advanceDuties;
    totalCompanyRetroactive += retroactiveDuties;
    totalCompanyCompliant += compliantCount;

    // Strike Calculation: Unexcused retroactive violations + abandoned past incomplete returns
    const strikesCount = unexcusedViolations + (abandonedIncompleteCount > 0 ? 1 : 0);
    totalCompanyStrikes += strikesCount;

    let strikeLevel: DisciplinaryNoticeLevel = 'clean';
    if (strikesCount === 1) strikeLevel = 'first_notice';
    else if (strikesCount === 2) strikeLevel = 'second_notice';
    else if (strikesCount === 3) strikeLevel = 'verbal_warning';
    else if (strikesCount >= 4) strikeLevel = 'written_warning';

    const complianceRate = entry.records.length > 0
      ? Math.min(100, Math.round((compliantCount / entry.records.length) * 100))
      : 100;

    // Format breakdown percentages & durations
    Object.keys(reasonsMap).forEach((k) => {
      const r = reasonsMap[k];
      r.totalHoursDecimal = Number((r.totalMinutes / 60).toFixed(2));
      const hrs = Math.floor(r.totalMinutes / 60);
      const mins = r.totalMinutes % 60;
      r.formattedDuration = hrs > 0 ? (mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`) : `${mins}m`;
      r.percentageOfStaffHours = totalMinutes > 0 ? Math.round((r.totalMinutes / totalMinutes) * 100) : 0;
    });

    const formattedTotalDuration = formatDurationMinutes(totalMinutes);
    const formattedWithinWorking = formatDurationMinutes(totalWithinWorkingMinutes);
    const formattedBesideWorking = formatDurationMinutes(totalBesideWorkingMinutes);

    const avgMins = entry.records.length > 0 ? Math.round(totalMinutes / entry.records.length) : 0;
    const avgHrs = Math.floor(avgMins / 60);
    const avgRemMins = avgMins % 60;
    const formattedAverageDuration = avgHrs > 0 ? `${avgHrs}h ${avgRemMins}m` : `${avgRemMins}m`;

    staffSummaries.push({
      staffName,
      positions: Array.from(entry.positions),
      departments: Array.from(entry.departments),
      totalDuties: entry.records.length,
      totalMinutes,
      totalHoursDecimal: Number((totalMinutes / 60).toFixed(2)),
      formattedTotalDuration,
      withinWorkingMinutes: totalWithinWorkingMinutes,
      besideWorkingMinutes: totalBesideWorkingMinutes,
      withinWorkingHoursDecimal: Number((totalWithinWorkingMinutes / 60).toFixed(2)),
      besideWorkingHoursDecimal: Number((totalBesideWorkingMinutes / 60).toFixed(2)),
      formattedWithinWorking,
      formattedBesideWorking,
      averageMinutesPerDuty: avgMins,
      formattedAverageDuration,
      completedDuties: completed,
      pendingDuties: pending,
      incompleteDuties: incomplete,
      missedScansCount: missedScans,
      reasonsBreakdown: reasonsMap,
      dutyRecords: entry.records.sort((a, b) => (b.date + b.timeOfDeparture).localeCompare(a.date + a.timeOfDeparture)),
      onTimeDuties,
      advanceDuties,
      retroactiveDuties,
      excusedEmergencies,
      gmWaivedDuties,
      strikesCount,
      strikeLevel,
      complianceRate
    });
  });

  // Sort staff by total duty hours descending
  staffSummaries.sort((a, b) => b.totalMinutes - a.totalMinutes || b.totalDuties - a.totalDuties);

  const topDutyStaff = staffSummaries.length > 0
    ? { name: staffSummaries[0].staffName, hours: staffSummaries[0].totalHoursDecimal, count: staffSummaries[0].totalDuties }
    : null;

  const formattedCompanyHours = formatDurationMinutes(totalCompanyMinutes);
  const formattedWithinWorkingHours = formatDurationMinutes(totalCompanyWithinWorkingMinutes);
  const formattedBesideWorkingHours = formatDurationMinutes(totalCompanyBesideWorkingMinutes);

  let monthDisplay = 'All Recorded Months';
  if (selectedMonthKey !== 'all') {
    const [y, m] = selectedMonthKey.split('-');
    const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    monthDisplay = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  const totalEvaluated = totalCompanyOnTime + totalCompanyAdvance + totalCompanyRetroactive;
  const companyComplianceRate = totalEvaluated > 0
    // Credits advance/on-time plus emergency-exempted and GM-waived records, so
    // the company figure agrees with the per-staff figure above.
    ? Math.round((totalCompanyCompliant / totalEvaluated) * 100)
    : 100;

  return {
    monthKey: selectedMonthKey,
    monthDisplay,
    totalCompanyDuties: filtered.length,
    totalCompanyMinutes,
    totalCompanyHoursDecimal: Number((totalCompanyMinutes / 60).toFixed(2)),
    formattedCompanyHours,
    totalWithinWorkingMinutes: totalCompanyWithinWorkingMinutes,
    totalBesideWorkingMinutes: totalCompanyBesideWorkingMinutes,
    totalWithinWorkingHoursDecimal: Number((totalCompanyWithinWorkingMinutes / 60).toFixed(2)),
    totalBesideWorkingHoursDecimal: Number((totalCompanyBesideWorkingMinutes / 60).toFixed(2)),
    formattedWithinWorkingHours,
    formattedBesideWorkingHours,
    activeStaffCount: staffSummaries.length,
    reasonsDistribution: companyReasonsDist,
    topDutyStaff,
    totalOnTime: totalCompanyOnTime,
    totalAdvance: totalCompanyAdvance,
    totalRetroactive: totalCompanyRetroactive,
    totalStrikes: totalCompanyStrikes,
    companyComplianceRate,
    staffSummaries
  };
}
