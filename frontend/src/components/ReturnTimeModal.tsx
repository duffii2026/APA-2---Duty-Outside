import React, { useState } from 'react';
import { X, Clock, CheckCircle, AlertTriangle, Send } from 'lucide-react';
import { DutyOutsideRequest } from '../types';

interface ReturnTimeModalProps {
  request: DutyOutsideRequest | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmReturn: (id: string, returnTime: string, notes?: string) => void;
}

export const ReturnTimeModal: React.FC<ReturnTimeModalProps> = ({
  request,
  isOpen,
  onClose,
  onConfirmReturn
}) => {
  if (!isOpen || !request) return null;

  const currentTime = new Date().toTimeString().slice(0, 5);
  const [returnTime, setReturnTime] = useState(request.timeOfReturn || currentTime);
  const [returnNotes, setReturnNotes] = useState(request.returnNotes || '');
  const [error, setError] = useState('');

  const handleUseCurrentTime = () => {
    const now = new Date().toTimeString().slice(0, 5);
    setReturnTime(now);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTime) {
      setError('Please provide the time of return to the office.');
      return;
    }
    onConfirmReturn(request.id, returnTime, returnNotes.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden my-auto max-h-[94vh] flex flex-col min-w-0">
        
        {/* Header */}
        <div className="bg-slate-900 px-4 sm:px-6 py-3.5 sm:py-4 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">Record Return to Office</h3>
              <p className="text-[11px] text-slate-400 truncate">Ref: {request.id}</p>
            </div>
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

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          
          {/* Summary Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Requester:</span>
              <span className="font-semibold text-slate-900">{request.requesterName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Duty Assignment:</span>
              <span className="font-medium text-slate-800 truncate max-w-[240px]" title={request.reasonOrPurpose}>
                {request.reasonOrPurpose}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Departed Office At:</span>
              <span className="font-semibold text-amber-700">{request.timeOfDeparture} ({request.date})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Approved By:</span>
              <span className="text-slate-700">{request.approvedBy}</span>
            </div>
          </div>

          {/* Attendance Compliance Note */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 flex items-start space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              Updating your actual return time completes this record in compliance with the <strong>Same-Day Return Time Policy</strong>.
            </p>
          </div>

          {/* Time Picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-800">
                8. Actual Time of Return <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleUseCurrentTime}
                className="text-xs text-amber-600 hover:text-amber-700 font-medium underline"
              >
                Set to Now ({new Date().toTimeString().slice(0, 5)})
              </button>
            </div>
            <input
              type="time"
              value={returnTime}
              onChange={(e) => {
                setReturnTime(e.target.value);
                if (error) setError('');
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              required
            />
            {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
          </div>

          {/* Return Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Return Remarks / Outcome (Optional)
            </label>
            <textarea
              rows={2}
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="e.g., Meeting concluded successfully, documents delivered and signed."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            />
          </div>

          {/* Telegram Alert Note */}
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 text-xs text-sky-900 flex items-center space-x-2">
            <Send className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="leading-tight">
              <strong>Live Bot Sync:</strong> Confirming return will automatically notify the Staff Telegram Group and Mr. Shawn's Direct Chat in real-time.
            </span>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs"
            >
              Confirm Return to Office
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
