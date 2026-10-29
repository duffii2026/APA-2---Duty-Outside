import React, { useMemo, useRef, useState } from 'react';
import {
  Send, CheckCircle2, Copy, Check, Fingerprint, Clock,
  MapPin, AlertCircle,
} from 'lucide-react';
import { DutyOutsideRequest, FIXED_OFFICIAL_APPROVER } from '../types';
import { autoDetectMissedScans } from '../utils/scanDetection';

/** Department options, matching the original staff fast-request form. */
export const PORTAL_DEPARTMENTS = [
  'General Staff',
  'Accounting & Finance',
  'Operations & Logistics',
  'Administration & HR',
  'Marketing & Sales',
  'Procurement',
  'IT & Technical',
  'Client Services',
];

/** Purpose options, matching the original staff fast-request form. */
export const PORTAL_REASONS = [
  'Banking & Financial Affairs',
  'Medical & Hospital Visit',
  'Client & Partner Meeting',
  'Government & Ministry Affairs',
  'Emergency Family Matter',
  'Official Duty & Errand',
];

export interface StaffRequestPayload {
  requesterName: string;
  position: string;
  department: string;
  reasonCategory: string;
  reasonDetail: string;
  destination: string;
  date: string;
  timeOfDeparture: string;
  timeOfReturn: string | null;
  isReturnPending: boolean;
  isDirectToHome: boolean;
  lateSubmissionReason: string;
  missedFingerprintScans: string[];
  /** How the record is being filed — only used for the provenance note. */
  via: 'portal' | 'public';
  /**
   * Anti-automation fields, only populated for the no-login tab. The backend
   * requires all three and silently rejects submissions that fail them.
   */
  challengeToken?: string;
  formElapsedMs?: number;
  /** Honeypot: a real person never sees or fills this field. */
  company?: string;
}

interface StaffRequestFormProps {
  /** Pre-fills and (in the portal) pins the requester. */
  defaultName?: string;
  /** Public tab: the name is free text. Portal: locked to the signed-in user. */
  lockName?: boolean;
  onSubmit: (payload: StaffRequestPayload) => Promise<DutyOutsideRequest>;
  /** Extra note under the submit button, e.g. the approver line. */
  footerNote?: React.ReactNode;
  /**
   * Set by the no-login tab. Carries the single-use challenge token and turns
   * on the anti-bot checks. Omitted for signed-in portal submissions.
   */
  challengeToken?: string | null;
}

const toDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * The Duty Outside request form, shared by two callers so the fields can never
 * drift apart:
 *   - StaffPortal          (signed-in staff, name locked to the account)
 *   - LoginScreen staff tab (no login, name is free text)
 *
 * Field semantics follow the APA memo: any duty may exceed two hours, and
 * "Direct to Home" closes the day at 17:00 with the checkout scan excused.
 */
export const StaffRequestForm: React.FC<StaffRequestFormProps> = ({
  defaultName = '',
  lockName = false,
  onSubmit,
  footerNote,
  challengeToken,
}) => {
  const today = toDate(new Date());

  // Anti-automation state. openedAt gives the backend a minimum time-on-form;
  // `company` is a hidden honeypot field that only an automated filler sees.
  const openedAtRef = useRef(Date.now());
  const [company, setCompany] = useState('');

  const [staffName, setStaffName] = useState(defaultName);
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('General Staff');
  const [reasonCategory, setReasonCategory] = useState(PORTAL_REASONS[0]);
  const [reasonDetail, setReasonDetail] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState(today);
  const [departureTime, setDepartureTime] = useState(toTime(new Date()));
  const [returnTime, setReturnTime] = useState('');
  const [isReturnPending, setIsReturnPending] = useState(true);
  const [isDirectToHome, setIsDirectToHome] = useState(false);
  const [lateSubmissionReason, setLateSubmissionReason] = useState('');

  const [receipt, setReceipt] = useState<DutyOutsideRequest | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Same helper the executive SubmissionModal uses, so staff and management
  // always see the same excused-scan list for the same hours.
  const detected = useMemo(
    () =>
      autoDetectMissedScans(
        departureTime,
        isDirectToHome ? '17:00' : isReturnPending ? null : returnTime,
        isDirectToHome ? false : isReturnPending,
        isDirectToHome
      ),
    [departureTime, returnTime, isReturnPending, isDirectToHome]
  );

  const isRetroactive = date < today;

  const buildPayload = (): StaffRequestPayload => ({
    requesterName: staffName.trim(),
    position: position.trim() || 'Staff',
    department,
    reasonCategory,
    reasonDetail: reasonDetail.trim(),
    destination: destination.trim(),
    date,
    timeOfDeparture: departureTime,
    timeOfReturn: isDirectToHome ? '17:00' : isReturnPending ? null : returnTime,
    isReturnPending: isDirectToHome ? false : isReturnPending,
    isDirectToHome,
    lateSubmissionReason: isRetroactive ? lateSubmissionReason.trim() : '',
    missedFingerprintScans: detected.scans,
    via: lockName ? 'portal' : 'public',
    // Only the no-login flow needs these; the portal is session-authenticated.
    challengeToken: challengeToken ?? undefined,
    formElapsedMs: Date.now() - openedAtRef.current,
    company: company || undefined,
  });

  const resetForm = () => {
    setReceipt(null);
    openedAtRef.current = Date.now();
    setCompany('');
    setStaffName(defaultName);
    setPosition('');
    setReasonDetail('');
    setDestination('');
    setLateSubmissionReason('');
    setReturnTime('');
    setDate(toDate(new Date()));
    setDepartureTime(toTime(new Date()));
    setIsReturnPending(true);
    setIsDirectToHome(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (staffName.trim().length < 2) {
      setError('Please enter your full name so the register can identify you.');
      return;
    }
    if (!lockName && position.trim().length < 2) {
      setError('Please enter your position so the register can identify you.');
      return;
    }
    setIsSubmitting(true);
    try {
      setReceipt(await onSubmit(buildPayload()));
    } catch (err: any) {
      setError(err?.message || 'Could not submit your request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyTelegramTemplate = () => {
    // The Telegram parser rejects any line whose label differs from its
    // canonical form (telegramParser CANONICAL_LABELS), so these labels must
    // stay byte-identical to the template the bot documents: "Reason",
    // "Other Teams", "Departure", "Return", "Missed Scans", "Approved By".
    const returnVal = isDirectToHome
      ? 'Direct to Home'
      : isReturnPending
        ? 'Pending'
        : returnTime;

    const template = `DUTY OUTSIDE REQUEST

1. Requester: ${staffName || '[Your Name]'}
2. Staff on Duty: ${staffName || '[Your Name]'}
3. Position: ${position || '[Position]'}
4. Reason: ${reasonDetail?.trim() || reasonCategory}
5. Other Teams: N/A
6. Date: ${date}
7. Departure: ${departureTime}
8. Return: ${returnVal}
9. Missed Scans: ${detected.scans.length ? detected.scans.join(', ') : 'None'}
10. Approved By: ${FIXED_OFFICIAL_APPROVER}`;

    navigator.clipboard.writeText(template);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2500);
  };

  const inputCls =
    'w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-white text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-colors placeholder:text-slate-600';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1';

  if (receipt) {
    return (
      <div className="text-center py-2 space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white">Gate Pass Registered</h2>
          <p className="text-xs sm:text-sm text-emerald-400 font-semibold mt-1">
            Request Submitted Successfully!
          </p>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
            Your request has been logged and dispatched to{' '}
            <strong className="text-amber-300">Mr. Shawn</strong> and the Telegram Group.
          </p>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left space-y-2 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <span className="text-slate-500">Gate Pass ID:</span>
            <span className="font-mono font-bold text-amber-400">{receipt.id}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Staff Member:</span>
            <span className="text-white font-semibold">{receipt.requesterName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Departure Time:</span>
            <span className="text-white">{receipt.timeOfDeparture}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Estimated Return:</span>
            <span className="text-amber-300">
              {receipt.isDirectToHome
                ? 'Direct to Home (17:00 excused)'
                : receipt.timeOfReturn || 'Pending return'}
            </span>
          </div>
          {receipt.missedFingerprintScans && receipt.missedFingerprintScans.length > 0 && (
            <div className="flex justify-between items-start gap-3">
              <span className="text-slate-500 shrink-0">Scans Excused:</span>
              <span className="text-white text-right">{receipt.missedFingerprintScans.join(', ')}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t border-slate-800">
            <span className="text-slate-500">Approver:</span>
            <span className="text-emerald-400 font-semibold">{receipt.approvedBy}</span>
          </div>
        </div>

        {receipt.isReturnPending && (
          <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-left">
            <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />
            Confirm your actual return time before 6:00 PM today, or reply in the Telegram group.
          </p>
        )}

        <button
          type="button"
          onClick={resetForm}
          className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs sm:text-sm transition-all shadow-md"
        >
          Submit Another Request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Honeypot: hidden from people, irresistible to automated form fillers.
          If it arrives non-empty the backend rejects the submission. */}
      <div className="absolute h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="company-field">Company</label>
        <input
          id="company-field"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            Staff Name <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            required
            value={staffName}
            readOnly={lockName}
            onChange={(e) => setStaffName(e.target.value)}
            placeholder="e.g. Sok Dara"
            className={`${inputCls} ${lockName ? 'opacity-70 cursor-not-allowed' : ''}`}
          />
        </div>
        <div>
          <label className={labelCls}>Department</label>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls}>
            {PORTAL_DEPARTMENTS.map((d) => (
              <option key={d} value={d} className="bg-slate-950">{d}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>
          Purpose / Reason <span className="text-rose-400">*</span>
        </label>
        <select
          value={reasonCategory}
          onChange={(e) => setReasonCategory(e.target.value)}
          className={`${inputCls} mb-2`}
        >
          {PORTAL_REASONS.map((r) => (
            <option key={r} value={r} className="bg-slate-950">{r}</option>
          ))}
        </select>
        <input
          type="text"
          value={reasonDetail}
          onChange={(e) => setReasonDetail(e.target.value)}
          placeholder="Specific detail (e.g. ABA Central Branch document signing)"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            Position{' '}
            {lockName ? (
              <span className="text-slate-500 font-normal">(optional)</span>
            ) : (
              <span className="text-rose-400">*</span>
            )}
          </label>
          <input type="text" value={position} onChange={(e) => setPosition(e.target.value)}
            required={!lockName}
            minLength={lockName ? undefined : 2}
            placeholder="e.g. Senior Accountant" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Destination (optional)</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. VICB branch" className={`${inputCls} pl-9`} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
            className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Time of Departure</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <input type="time" required value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)} className={`${inputCls} pl-9`} />
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <label className="flex items-start space-x-2.5 cursor-pointer">
          <input type="checkbox" checked={isReturnPending} disabled={isDirectToHome}
            onChange={(e) => setIsReturnPending(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
          <span className="text-xs font-medium text-slate-200">
            Return time pending (confirm before 6:00 PM)
          </span>
        </label>

        <label className="flex items-start space-x-2.5 cursor-pointer">
          <input type="checkbox" checked={isDirectToHome}
            onChange={(e) => {
              setIsDirectToHome(e.target.checked);
              if (e.target.checked) {
                setIsReturnPending(false);
                setReturnTime('17:00');
              } else {
                setReturnTime('');
              }
            }}
            className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500" />
          <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
            Direct to Home (17:00 Excused)
          </span>
        </label>

        {!isDirectToHome && !isReturnPending && (
          <div>
            <label className={labelCls}>Expected Return</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <input type="time" required value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)} className={`${inputCls} pl-9`} />
            </div>
          </div>
        )}

        <p className="text-[10px] text-amber-400/80 font-mono">
          Duration based on operational necessity (APA Memo Directive). No 2h restriction.
        </p>
      </div>

      {isRetroactive && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
          <p className="text-[11px] text-amber-200 font-semibold">
            This duty date is in the past — a written justification is required to qualify for the
            48-hour emergency grace period.
          </p>
          <input type="text" required value={lateSubmissionReason}
            onChange={(e) => setLateSubmissionReason(e.target.value)}
            placeholder="e.g. Medical emergency — hospital admission" className={inputCls} />
        </div>
      )}

      {detected.scans.length > 0 && (
        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30">
          <p className="text-[11px] text-sky-200 font-semibold flex items-center gap-1.5">
            <Fingerprint className="w-3.5 h-3.5" />
            Scans to be excused in Odoo
          </p>
          <p className="text-[11px] text-sky-300/90 mt-1">{detected.scans.join(' • ')}</p>
          {detected.explanation && (
            <p className="text-[10px] text-sky-400/80 mt-1">{detected.explanation}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={isSubmitting}
          className="flex-1 py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Submit Gate Pass Request</span>
            </>
          )}
        </button>

        <button type="button" onClick={handleCopyTelegramTemplate}
          title="Copy the 10-item message to paste into the Telegram group"
          className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition-all flex items-center gap-1.5 shrink-0">
          {copiedTemplate ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Copy Template</span>
            </>
          )}
        </button>
      </div>

      {footerNote}
    </form>
  );
};
