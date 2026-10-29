import React, { useState } from 'react';
import { 
  X, 
  Calendar, 
  Clock, 
  User, 
  Users, 
  Briefcase, 
  MapPin, 
  FileText, 
  Fingerprint, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle,
  Printer,
  Send
} from 'lucide-react';
import { DutyOutsideRequest } from '../types';
import { DutyReasonBadge } from './DutyReasonBadge';
import { dispatchTelegramReturnAlert, dispatchTelegramDutyRequestAlert } from '../services/telegramBotService';
import { getSubmissionTiming, calculateDutyDuration, WORKING_HOURS_LABEL } from '../utils/timeCalculations';

interface RequestDetailModalProps {
  request: DutyOutsideRequest | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkReturn: (req: DutyOutsideRequest) => void;
  onPrint: (req: DutyOutsideRequest) => void;
  onWaiveStrike?: (requestId: string, note?: string) => void;
}

export const RequestDetailModal: React.FC<RequestDetailModalProps> = ({
  request,
  isOpen,
  onClose,
  onMarkReturn,
  onPrint,
  onWaiveStrike
}) => {
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);

  if (!isOpen || !request) return null;

  const duration = calculateDutyDuration(
    request.timeOfDeparture,
    request.timeOfReturn,
    request.isReturnPending,
    request.date
  );

  const handleSendTelegramAlert = async () => {
    setIsSendingTelegram(true);
    setTelegramStatus(null);
    try {
      if (request.status === 'returned' || request.timeOfReturn) {
        const res = await dispatchTelegramReturnAlert(
          request, 
          request.timeOfReturn || new Date().toTimeString().slice(0, 5), 
          request.returnNotes
        );
        if (res.groupSent || res.shawnSent) {
          setTelegramStatus(`✅ Alert sent to ${[res.groupSent ? 'Staff Group' : '', res.shawnSent ? "Mr. Shawn's Chat" : ''].filter(Boolean).join(' & ')}!`);
        } else {
          setTelegramStatus(`⚠️ Note: ${res.errors.join('; ') || 'Check bot configuration in settings'}`);
        }
      } else {
        const res = await dispatchTelegramDutyRequestAlert(request);
        if (res.groupSent || res.shawnSent) {
          setTelegramStatus(`✅ Duty Alert sent to ${[res.groupSent ? 'Staff Group' : '', res.shawnSent ? "Mr. Shawn's Chat" : ''].filter(Boolean).join(' & ')}!`);
        } else {
          setTelegramStatus(`⚠️ Note: ${res.errors.join('; ') || 'Check bot configuration in settings'}`);
        }
      }
    } catch (e: any) {
      setTelegramStatus(`❌ Error: ${e.message}`);
    } finally {
      setIsSendingTelegram(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-auto max-h-[94vh] sm:max-h-[90vh] flex flex-col min-w-0">
        
        {/* Header */}
        <div className="bg-slate-900 px-4 sm:px-6 py-3.5 sm:py-4 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded">
                {request.id}
              </span>
              <span className="text-xs text-slate-400 truncate">APA Duty Outside Verification</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white mt-1 truncate">
              Duty Outside Record Details
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-white bg-white/15 hover:bg-white/25 active:bg-white/35 border border-white/20 transition-colors shrink-0 flex items-center justify-center shadow-xs"
            aria-label="Close dialog"
            title="Close"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Content Body - 10 Items from Memo */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
          {/* Status Bar */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-500 block">Current Movement Status</span>
                {(() => {
                  const timing = getSubmissionTiming(request);
                  if (timing === 'retroactive') {
                    return (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        ⚠️ Retroactive / Late
                      </span>
                    );
                  }
                  if (timing === 'advance') {
                    return (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800 border border-sky-200">
                        📅 Advance Booking
                      </span>
                    );
                  }
                  return (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      ✓ On-Time
                    </span>
                  );
                })()}
              </div>
              <span className="text-sm font-bold text-slate-900 capitalize mt-0.5 block">
                {request.status === 'active' && 'Currently Outside Office (Active Duty)'}
                {request.status === 'returned' && 'Returned to Office (Completed)'}
                {request.status === 'incomplete' && 'Incomplete Record (Pending Return Update)'}
              </span>
            </div>
            {request.status === 'active' && (
              <button
                onClick={() => {
                  onClose();
                  onMarkReturn(request);
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-xs"
              >
                Mark Return to Office
              </button>
            )}
          </div>

          {/* GM Executive Waiver Banner */}
          {request.isWaivedByGM && (
            <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-purple-950">
                <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0" />
                <span>Executive Strike Waiver Applied (Mr. Shawn, General Manager)</span>
              </div>
              <p className="text-[11px] text-purple-800">
                <strong>Recorded Note:</strong> {request.gmWaiverNote || 'Waived under General Manager Executive Discretion (APA Policy Section 5)'}
              </p>
              <p className="text-[10px] text-purple-700/80">
                Disciplinary violation forgiven. Attendance status protected in Odoo.
              </p>
            </div>
          )}

          {/* Direct to Home Banner */}
          {request.isDirectToHome && (
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <strong className="block text-emerald-950">Direct to Home Authorized</strong>
                <span className="text-[11px] text-emerald-800">Afternoon duty concluded workday. Evening 17:00 biometric check-out is excused.</span>
              </div>
            </div>
          )}

          {/* Retroactive Notice & Justification Card */}
          {request.isRetroactive && (() => {
            let hoursDiff = 0;
            try {
              const dutyStart = new Date(`${request.date}T${request.timeOfDeparture}:00`).getTime();
              const created = new Date(request.createdAt).getTime();
              hoursDiff = Math.max(0, Math.round((created - dutyStart) / (1000 * 60 * 60)));
            } catch (e) {
              hoursDiff = 0;
            }
            const isWithin48Hours = hoursDiff <= 48;

            return (
              <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-900 space-y-1.5">
                <div className="flex items-center justify-between font-bold text-rose-900">
                  <div className="flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Emergency Retroactive Notice (APA Attendance Audit)</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    isWithin48Hours ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-200 text-rose-900'
                  }`}>
                    {isWithin48Hours ? 'Within 48h Grace Period' : 'Exceeded 48h Window'}
                  </span>
                </div>
                <p className="text-[11px] text-rose-800">
                  <strong>Recorded Justification:</strong> {request.lateSubmissionReason || 'No justification entered.'}
                </p>
                <p className="text-[10px] text-rose-700/80">
                  {isWithin48Hours 
                    ? 'Logged within the permitted 48-hour emergency window. Biometric scan excused in accordance with Policy Directive.' 
                    : 'Logged after the 48-hour deadline. Subject to progressive disciplinary review and unauthorized absence penalty.'}
                </p>

                {/* 1-Click Executive Waiver Button for Mr. Shawn */}
                {!request.isWaivedByGM && onWaiveStrike && (
                  <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between">
                    <span className="text-[10px] text-rose-700 font-medium">Executive Discretion (Policy Sec. 5)</span>
                    <button
                      type="button"
                      onClick={() => onWaiveStrike(request.id, 'Waived under GM Executive Discretion')}
                      className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white font-bold text-[10px] rounded-lg shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      <span>Excuse Strike (GM Waiver)</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Item 1 */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                1. Requester's Name
              </span>
              <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                {request.requesterName}
              </span>
            </div>

            {/* Item 3 */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                3. Position & Department
              </span>
              <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                {request.position}
              </span>
              {request.department && (
                <span className="text-xs text-slate-500">{request.department}</span>
              )}
            </div>
          </div>

          {/* Item 2 */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              2. Employee(s) on Duty ({request.employeesOnDuty.length} Staff Member{request.employeesOnDuty.length > 1 ? 's' : ''})
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {request.employeesOnDuty.map((emp, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-white flex items-center"
                >
                  <User className="w-3 h-3 mr-1 text-amber-400" />
                  {emp}
                </span>
              ))}
            </div>
          </div>

          {/* Item 4 & Destination */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  4. Reason or Purpose
                </span>
                <DutyReasonBadge reason={request.reasonOrPurpose} />
              </div>
              <p className="text-sm text-slate-900 mt-1 font-medium whitespace-pre-wrap">
                {request.reasonOrPurpose}
              </p>
            </div>
            {request.destination && (
              <div className="pt-2 border-t border-slate-200/80 flex items-center text-xs text-slate-600">
                <MapPin className="w-3.5 h-3.5 mr-1 text-amber-600" />
                <span>Destination: <strong>{request.destination}</strong></span>
              </div>
            )}
          </div>

          {/* Item 5 */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              5. Other Team(s) Involved
            </span>
            <span className="text-sm text-slate-800 mt-0.5 block font-medium">
              {request.otherTeamsInvolved || 'None (Single Team Duty)'}
            </span>
          </div>

          {/* Item 6, 7, 8 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                6. Date
              </span>
              <span className="text-sm font-bold text-slate-900 mt-0.5 block flex items-center">
                <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                {request.date}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                7. Time of Departure
              </span>
              <span className="text-sm font-bold text-amber-700 mt-0.5 block flex items-center">
                <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
                {request.timeOfDeparture}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                8. Time of Return
              </span>
              {request.timeOfReturn ? (
                <span className="text-sm font-bold text-emerald-700 mt-0.5 block flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  {request.timeOfReturn}
                </span>
              ) : (
                <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded mt-1 inline-block">
                  Pending Return Update
                </span>
              )}
            </div>
          </div>

          {/* Movement Duration: Within vs Beside Working Hours */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center">
                <Clock className="w-3.5 h-3.5 mr-1 text-slate-500" />
                Movement Duration
              </span>
              <span className="text-sm font-black text-slate-900">
                {duration.minutes > 0 ? duration.formatted : '—'}
              </span>
            </div>
            {duration.minutes > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-indigo-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    Within {WORKING_HOURS_LABEL}
                  </span>
                  <span className="text-xs font-bold text-indigo-900">
                    {duration.formattedWithinWorking}
                  </span>
                </div>
                <div
                  className={`p-2.5 rounded-lg border flex items-center justify-between ${
                    duration.besideWorkingMinutes > 0
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <span
                    className={`text-[11px] font-semibold flex items-center gap-1.5 ${
                      duration.besideWorkingMinutes > 0 ? 'text-amber-900' : 'text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        duration.besideWorkingMinutes > 0 ? 'bg-amber-500' : 'bg-slate-300'
                      }`}
                    />
                    Beside Working Hours
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      duration.besideWorkingMinutes > 0 ? 'text-amber-900' : 'text-slate-500'
                    }`}
                  >
                    {duration.formattedBesideWorking}
                  </span>
                </div>
              </div>
            )}
            <p className="text-[10px] text-slate-500">
              Beside hours are time outside {WORKING_HOURS_LABEL}. They are included in the total
              movement duration but flagged for payroll/HR review.
            </p>
          </div>

          {/* Item 9: Missed Fingerprint Scans */}
          <div className="p-3.5 bg-blue-50/70 rounded-lg border border-blue-200 space-y-1">
            <span className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider flex items-center">
              <Fingerprint className="w-3.5 h-3.5 mr-1 text-blue-700" />
              9. Missed Fingerprint Scan(s) (HR Attendance Reconciliation)
            </span>
            {request.missedFingerprintScans.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                No fingerprint scans missed. Standard scan schedule followed.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {request.missedFingerprintScans.map((scan, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-600 text-white"
                  >
                    {scan}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-blue-800 pt-1">
              This will be reconciled against biometric logs so staff are not marked absent.
            </p>
          </div>

          {/* Item 10: Approved By */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              10. Approved By
            </span>
            <div className="flex items-center space-x-2 mt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold text-slate-900">
                {request.approvedBy}
              </span>
            </div>
          </div>

          {/* Return remarks if any */}
          {request.returnNotes && (
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-900">
              <span className="font-semibold block">Return Confirmation Notes:</span>
              <p className="mt-0.5">{request.returnNotes}</p>
            </div>
          )}

          {/* Telegram Alert Status Feedback */}
          {telegramStatus && (
            <div className={`p-3 rounded-lg border text-xs font-medium ${
              telegramStatus.startsWith('✅') 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {telegramStatus}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onPrint(request)}
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
            >
              <Printer className="w-4 h-4 mr-1.5 text-slate-600" />
              Print Official Duty Slip
            </button>
            <button
              onClick={handleSendTelegramAlert}
              disabled={isSendingTelegram}
              className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-xs transition-colors disabled:opacity-50"
              title="Dispatch or re-send real-time alert to Telegram Staff Group and Mr. Shawn"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {isSendingTelegram 
                ? 'Dispatching...' 
                : request.status === 'returned' 
                  ? 'Send Telegram Return Alert' 
                  : 'Dispatch Telegram Duty Alert'}
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-800 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
