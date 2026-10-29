import React from 'react';
import { X, Printer, Download, CheckCircle2 } from 'lucide-react';
import { DutyOutsideRequest } from '../types';
import { DutyReasonBadge } from './DutyReasonBadge';

interface PrintSlipModalProps {
  request: DutyOutsideRequest | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PrintSlipModal: React.FC<PrintSlipModalProps> = ({
  request,
  isOpen,
  onClose
}) => {
  if (!isOpen || !request) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-auto max-h-[94vh] flex flex-col min-w-0 print:border-none print:shadow-none print:my-0 print:max-w-none print:max-h-none">
        
        {/* Modal Controls (Hidden in Print) */}
        <div className="bg-slate-900 px-3 sm:px-6 py-3 sm:py-4 text-white flex items-center justify-between gap-2.5 print:hidden shrink-0">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <Printer className="w-5 h-5 text-amber-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-white truncate">
              Duty Outside Pass & Slip
            </h3>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg flex items-center shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 mr-1" />
              Print
            </button>
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
        </div>

        {/* Printable Official Slip Content */}
        <div className="p-8 space-y-6 text-slate-900 bg-white">
          
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-black text-xl tracking-wider">
                APA
              </div>
              <div>
                <h1 className="text-xl font-black uppercase tracking-wide text-slate-900">
                  APA Company Ltd.
                </h1>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Duty Outside Movement Pass & Biometric Attendance Slip
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="font-mono text-xs font-bold text-slate-900 block">
                REF: {request.id}
              </span>
              <span className="text-xs text-slate-500 block">
                Date: {request.date}
              </span>
              <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-300">
                {request.status === 'active' ? 'OUTSIDE (ACTIVE)' : 'VERIFIED COMPLETED'}
              </span>
            </div>
          </div>

          {/* Table of 10 Submission Items */}
          <div className="border border-slate-300 rounded-lg overflow-hidden text-xs">
            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="p-2.5 border-r border-slate-300 bg-slate-50 font-bold text-slate-700">
                1. Requester's Name:
              </div>
              <div className="p-2.5 font-semibold text-slate-900">
                {request.requesterName}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="p-2.5 border-r border-slate-300 bg-slate-50 font-bold text-slate-700">
                2. Employee(s) on Duty:
              </div>
              <div className="p-2.5 text-slate-900 font-medium">
                {request.employeesOnDuty.join(', ')}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="p-2.5 border-r border-slate-300 bg-slate-50 font-bold text-slate-700">
                3. Position:
              </div>
              <div className="p-2.5 text-slate-900">
                {request.position} {request.department ? `(${request.department})` : ''}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="p-2.5 border-r border-slate-300 bg-slate-50 font-bold text-slate-700">
                4. Reason or Purpose:
              </div>
              <div className="p-2.5 text-slate-900 space-y-1">
                <DutyReasonBadge reason={request.reasonOrPurpose} className="mb-0.5 inline-flex" />
                <div className="font-medium text-slate-900">{request.reasonOrPurpose}</div>
                {request.destination && (
                  <span className="block mt-0.5 text-slate-600 italic">
                    Location: {request.destination}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="p-2.5 border-r border-slate-300 bg-slate-50 font-bold text-slate-700">
                5. Other Team(s) Involved:
              </div>
              <div className="p-2.5 text-slate-900">
                {request.otherTeamsInvolved || 'N/A'}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="p-2.5 border-r border-slate-300 bg-slate-50 font-bold text-slate-700">
                6. Date of Duty:
              </div>
              <div className="p-2.5 text-slate-900 font-semibold">
                {request.date}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="p-2.5 border-r border-slate-300 bg-slate-50 font-bold text-slate-700">
                7. Time of Departure:
              </div>
              <div className="p-2.5 text-slate-900 font-bold">
                {request.timeOfDeparture}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="p-2.5 border-r border-slate-300 bg-slate-50 font-bold text-slate-700">
                8. Time of Return:
              </div>
              <div className="p-2.5 text-slate-900 font-bold">
                {request.timeOfReturn || 'Pending Return (To update upon arrival)'}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-300">
              <div className="p-2.5 border-r border-slate-300 bg-slate-50 font-bold text-slate-700">
                9. Missed Fingerprint Scan(s):
              </div>
              <div className="p-2.5 text-blue-900 font-semibold">
                {request.missedFingerprintScans.length > 0 
                  ? request.missedFingerprintScans.join('; ')
                  : 'None (Standard Scans Completed)'}
              </div>
            </div>

            <div className="grid grid-cols-2">
              <div className="p-2.5 border-r border-slate-300 bg-slate-50 font-bold text-slate-700">
                10. Approved By:
              </div>
              <div className="p-2.5 text-slate-900 font-bold">
                {request.approvedBy}
              </div>
            </div>
          </div>

          {/* Official Signatures & Verification Grid */}
          <div className="pt-4 grid grid-cols-3 gap-4 text-center">
            <div className="border border-slate-300 rounded p-3 text-[11px]">
              <p className="font-bold text-slate-700 uppercase">Requester</p>
              <div className="h-12 flex items-end justify-center">
                <span className="font-serif italic text-xs text-slate-700">{request.requesterName}</span>
              </div>
              <div className="border-t border-slate-300 pt-1 text-slate-500">
                Signature & Date
              </div>
            </div>

            <div className="border border-slate-300 rounded p-3 text-[11px]">
              <p className="font-bold text-slate-700 uppercase">Approving Supervisor</p>
              <div className="h-12 flex items-end justify-center">
                <span className="font-serif italic text-xs text-slate-700">{request.approvedBy}</span>
              </div>
              <div className="border-t border-slate-300 pt-1 text-slate-500">
                Signature & Date
              </div>
            </div>

            <div className="border border-slate-300 rounded p-3 text-[11px]">
              <p className="font-bold text-slate-700 uppercase">HR & Gate Check</p>
              <div className="h-12 flex items-center justify-center">
                <span className="text-[10px] text-slate-400 border border-dashed border-slate-300 p-1 rounded">
                  Official Verification Stamp
                </span>
              </div>
              <div className="border-t border-slate-300 pt-1 text-slate-500">
                Attendance Reconciled
              </div>
            </div>
          </div>

          {/* Compliance statement footnote */}
          <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-200">
            * APA Official Directive Policy: Return time must be updated upon returning to office on the same day without fail. Missed biometric scans are recorded for authorized attendance reconciliation.
          </div>

        </div>

      </div>
    </div>
  );
};
