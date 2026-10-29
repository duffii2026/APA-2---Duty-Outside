import React, { useState } from 'react';
import { 
  X, 
  FileText, 
  Printer, 
  Copy, 
  Check, 
  ShieldCheck, 
  AlertTriangle, 
  Calendar, 
  Clock, 
  Fingerprint,
  Info
} from 'lucide-react';
import { 
  OFFICIAL_MEMO_META, 
  MEMO_SECTIONS, 
  MEMO_SUBMISSION_REQUIREMENTS,
  FIXED_OFFICIAL_APPROVER 
} from '../types';

interface OfficialPolicyMemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OfficialPolicyMemoModal: React.FC<OfficialPolicyMemoModalProps> = ({
  isOpen,
  onClose
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const fullMemoText = `=====================================================
INTERNAL MEMORANDUM | APA GROUP
Document No: ${OFFICIAL_MEMO_META.docNumber}
Issued By: ${OFFICIAL_MEMO_META.office}
Signatory: ${OFFICIAL_MEMO_META.signatory} (${OFFICIAL_MEMO_META.signatoryTitle})
Date of Issuance: September 2026
Classification: INTERNAL - FOR ALL APA STAFF
=====================================================

SUBJECT: DIRECTIVE ON MANDATORY DUTY OUTSIDE REQUESTS, ATTENDANCE RECONCILIATION & DISCIPLINARY POLICY

1. PURPOSE & TRACKING NATURE
Effective immediately, all APA staff are required to submit a Duty Outside Request through the Duty Outside Request System before leaving the office for any external duty assignment.
This is an operational tracking mechanism — NOT an approval gate — to ensure management has full visibility of staff on external duty at all times without delaying urgent assignments. The system is available via the web portal and Telegram bot assistant.

2. SUBMISSION REQUIREMENTS & ADVANCE BOOKINGS
Each request must be completed with the following 10 standard items:
1. Requester's Name
2. Employee(s) on Duty — list all staff involved (one person may submit on behalf of a team)
3. Position
4. Reason or Purpose — Bank, GDT, Meet GDT, CFO Tasks, or Other
5. Other Team(s) Involved — if inter-departmental
6. Date — Today or a future date for advance bookings
7. Time of Departure
8. Time of Return — Confirmed time, Pending, or Direct to Home
9. Missed Fingerprint Scan(s) — indicated for Odoo attendance excuse
10. Approved By — Fixed official approver: ${FIXED_OFFICIAL_APPROVER}

Advance Bookings: Staff are welcome to submit requests in advance for upcoming dates. When submitted in advance, the record remains scheduled until the duty date occurs.

3. RETURN TIME POLICY: OPERATIONAL NECESSITY, PENDING RETURN & DIRECT TO HOME
• Operational Need: Duties outside are authorized based on business necessity (e.g. bank queues, GDT tax audits, CFO tasks). There is no arbitrary 2-hour cap.
• If your return time is known in advance: Enter both your Departure Time and Return Time when submitting. You do NOT need to update or confirm anything after returning unless delayed.
• If your return time is uncertain: Select "Pending". You must confirm the actual return time before 6:00 PM (end of working day) upon returning to the office, or via Telegram bot (/return [HH:MM]). Ongoing duties during active office hours are not treated as overdue strikes.
• Direct to Home: If an afternoon duty concludes your work day and you will not return to the office, select "Direct to Home". Your evening checkout scan (17:00) is officially excused.

4. COMPLIANCE, 48-HOUR EMERGENCY GRACE PERIOD & 3-STRIKE DISCIPLINARY FRAMEWORK
Submission prior to departure is mandatory for all staff without exception. Leaving company premises without logging a request is strictly prohibited.

• 48-Hour Emergency Grace Period & Weekend Rollover: In unavoidable emergency cases where a duty could not be pre-logged, staff must submit a retroactive request with a valid written explanation within 48 hours. For duties occurring on Friday afternoon, the deadline is extended to Monday at 10:00 AM.
• Emergency Exemption vs. Strike:
  - Valid Emergency (< 48h): If logged within 48 hours with verified written explanation, an official attendance exemption is granted (0 strikes) and biometric scans are excused in Odoo.
  - Overdue Submissions (> 48h) or Unexcused Absences: Triggers the progressive disciplinary framework.
• Progressive Disciplinary Measures (3-Strike Rule):
  - 1st Occurrence: Friendly HR Reminder & Recorded Note.
  - 2nd Occurrence: Formal Notice to Staff with copy to Head of Department (HOD).
  - 3rd Occurrence: Official Verbal Warning placed on HR record. Missed time without approved request will be treated as Unauthorised Absence with salary deduction in Odoo.
  - Continued Violations (4th+): Formal Written Disciplinary Warning Letter signed by the General Manager.

5. EXECUTIVE DISCRETION & GM STRIKE WAIVER
The General Manager (Mr. Shawn) reserves full executive discretion to review, excuse, or waive recorded strikes in exceptional circumstances (e.g., verified medical emergencies, hospitalization, severe transportation disruptions, or technical system outages). When waived, the duty record is officially marked "Excused by GM" with attendance preserved in Odoo.

All staff and Heads of Department are required to strictly observe this memorandum.

Approved and Authorized by:
${OFFICIAL_MEMO_META.signatory}
${OFFICIAL_MEMO_META.signatoryTitle}
${OFFICIAL_MEMO_META.organization}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullMemoText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-auto max-h-[95vh] flex flex-col min-w-0 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 px-4 sm:px-6 py-4 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-mono text-[11px] font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded">
                  {OFFICIAL_MEMO_META.docNumber}
                </span>
                <span className="text-xs text-indigo-300 font-medium hidden sm:inline">Official Memorandum</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white truncate mt-0.5">
                APA Staff Duty Outside Directive & Policy
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleCopy}
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors shadow-xs"
              title="Copy formatted memo text for email or staff announcement"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  <span className="text-emerald-300">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  <span>Copy Memo</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors shadow-xs hidden sm:inline-flex"
              title="Print official memorandum"
            >
              <Printer className="w-3.5 h-3.5 mr-1 text-amber-400" />
              <span>Print</span>
            </button>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl text-white bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Memo Body */}
        <div className="p-6 overflow-y-auto space-y-6 max-h-[80vh] bg-slate-50/50">
          
          {/* Official Letterhead Header */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-slate-200 pb-4 gap-2">
              <div>
                <span className="text-xs font-black tracking-widest text-amber-600 uppercase block">
                  {OFFICIAL_MEMO_META.organization}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {OFFICIAL_MEMO_META.office}
                </h3>
                <p className="text-xs text-slate-500">
                  Directive on Staff External Duty, Movement Transparency & Attendance Reconciliation
                </p>
              </div>

              <div className="text-left sm:text-right text-xs space-y-0.5">
                <div><span className="text-slate-500">Ref:</span> <strong className="font-mono text-slate-900">{OFFICIAL_MEMO_META.docNumber}</strong></div>
                <div><span className="text-slate-500">Signatory:</span> <strong className="text-slate-900">{OFFICIAL_MEMO_META.signatory} ({OFFICIAL_MEMO_META.signatoryTitle})</strong></div>
                <div><span className="text-slate-500">Effective:</span> <strong className="text-slate-900">September 2026</strong></div>
              </div>
            </div>

            {/* Quick Policy Highlights Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-3 bg-amber-50/80 rounded-lg border border-amber-200 text-xs">
                <span className="font-bold text-amber-900 block mb-0.5">1. Tracking Mechanism</span>
                <p className="text-amber-800 text-[11px] leading-tight">
                  Not an approval gate. Log before leaving to ensure visibility and excuse missed biometric scans in Odoo.
                </p>
              </div>
              <div className="p-3 bg-sky-50/80 rounded-lg border border-sky-200 text-xs">
                <span className="font-bold text-sky-900 block mb-0.5">2. Operational Duration</span>
                <p className="text-sky-800 text-[11px] leading-tight">
                  No arbitrary 2-hour cap. Pending returns close by 6:00 PM; Direct to Home excuses 17:00 checkout.
                </p>
              </div>
              <div className="p-3 bg-emerald-50/80 rounded-lg border border-emerald-200 text-xs">
                <span className="font-bold text-emerald-900 block mb-0.5">3. 48h Emergency Grace</span>
                <p className="text-emerald-800 text-[11px] leading-tight">
                  Retroactive requests with written reason within 48h (or Mon 10 AM for Fri) grant attendance exemption (0 strikes).
                </p>
              </div>
              <div className="p-3 bg-purple-50/80 rounded-lg border border-purple-200 text-xs">
                <span className="font-bold text-purple-900 block mb-0.5">4. GM Executive Waiver</span>
                <p className="text-purple-800 text-[11px] leading-tight">
                  GM Mr. Shawn retains executive authority to review and waive strikes in exceptional circumstances.
                </p>
              </div>
            </div>
          </div>

          {/* Full Sections */}
          <div className="space-y-4">
            {MEMO_SECTIONS.map((sec) => (
              <div key={sec.num} className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center justify-center">
                    {sec.num}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900">
                    Section {sec.num}: {sec.title}
                  </h4>
                </div>
                <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line pl-8">
                  {sec.content}
                </div>
              </div>
            ))}
          </div>

          {/* 3-Strike Disciplinary Matrix Table */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Summary Table: Progressive Disciplinary Matrix (3-Strike Rule)
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 text-[11px] uppercase font-bold">
                  <tr>
                    <th className="py-2.5 px-3 border-b border-slate-200">Violation Level</th>
                    <th className="py-2.5 px-3 border-b border-slate-200">Scenario</th>
                    <th className="py-2.5 px-3 border-b border-slate-200">Management Action & HR Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-emerald-50/40">
                    <td className="py-2.5 px-3 font-bold text-emerald-800">Emergency Exemption</td>
                    <td className="py-2.5 px-3 text-slate-700">Sudden emergency duty submitted within 48h with valid justification.</td>
                    <td className="py-2.5 px-3 text-slate-800"><strong>Authorized Exemption (0 Strikes)</strong>. Biometric attendance excused in Odoo. Friday duties extended to Monday 10:00 AM.</td>
                  </tr>
                  <tr className="bg-blue-50/40">
                    <td className="py-2.5 px-3 font-bold text-blue-800">1st Occurrence</td>
                    <td className="py-2.5 px-3 text-slate-700">First unlogged departure or late submission without emergency justification.</td>
                    <td className="py-2.5 px-3 text-slate-800">Friendly HR Reminder. Exception granted; recorded in HR attendance notes.</td>
                  </tr>
                  <tr className="bg-amber-50/40">
                    <td className="py-2.5 px-3 font-bold text-amber-800">2nd Occurrence</td>
                    <td className="py-2.5 px-3 text-slate-700">Second late submission or unlogged departure within the same period.</td>
                    <td className="py-2.5 px-3 text-slate-800">Formal Notice sent to staff member with official copy to Head of Department (HOD). Recorded in HR attendance notes.</td>
                  </tr>
                  <tr className="bg-rose-50/40">
                    <td className="py-2.5 px-3 font-bold text-rose-800">3rd Occurrence</td>
                    <td className="py-2.5 px-3 text-slate-700">Repeated failure to submit or disregard of duty outside procedure.</td>
                    <td className="py-2.5 px-3 text-slate-800">Official Verbal Warning placed on HR employee record. Missed time without approved request treated as <strong>Unauthorised Absence</strong> with payroll salary deduction in Odoo.</td>
                  </tr>
                  <tr className="bg-purple-50/40">
                    <td className="py-2.5 px-3 font-bold text-purple-800">4th+ Occurrence</td>
                    <td className="py-2.5 px-3 text-slate-700">Continued non-compliance.</td>
                    <td className="py-2.5 px-3 text-slate-800">Formal Written Warning Letter issued and signed by General Manager Mr. Shawn.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Authorization Footer */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] text-slate-400 block">Official Classification</span>
              <p className="text-slate-600 text-xs leading-relaxed max-w-lg">
                {OFFICIAL_MEMO_META.classification}
              </p>
            </div>
            <div className="text-left sm:text-right shrink-0 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4">
              <span className="text-[11px] text-slate-500 block">Authorized by</span>
              <span className="font-bold text-sm text-slate-900 block">{OFFICIAL_MEMO_META.signatory}</span>
              <span className="text-xs text-indigo-700 font-semibold">{OFFICIAL_MEMO_META.signatoryTitle}</span>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Click <strong>"Copy Memo"</strong> above to copy the full ready-to-send text for your company email or memo bulletin.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs"
          >
            Close Memo
          </button>
        </div>

      </div>
    </div>
  );
};
