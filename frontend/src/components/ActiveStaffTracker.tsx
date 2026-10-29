import React from 'react';
import { 
  Users, 
  Clock, 
  MapPin, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  Trash2
} from 'lucide-react';
import { DutyOutsideRequest } from '../types';
import { DutyReasonBadge } from './DutyReasonBadge';

interface ActiveStaffTrackerProps {
  activeRequests: DutyOutsideRequest[];
  onMarkReturn: (req: DutyOutsideRequest) => void;
  onViewDetails: (req: DutyOutsideRequest) => void;
  onDelete?: (id: string) => void;
}

export const ActiveStaffTracker: React.FC<ActiveStaffTrackerProps> = ({
  activeRequests,
  onMarkReturn,
  onViewDetails,
  onDelete
}) => {
  if (activeRequests.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
          <Users className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-800">No Staff Currently Outside</h4>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          All staff members are currently logged inside office premises or have completed their recorded return times.
        </p>
      </div>
    );
  }

  // Calculate elapsed time from departure
  const getElapsedDisplay = (dateStr: string, timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const departureDate = new Date(`${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
      const now = new Date();
      const diffMs = now.getTime() - departureDate.getTime();
      if (diffMs < 0) return 'Just departed';
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const h = Math.floor(diffMins / 60);
      const m = diffMins % 60;
      if (h > 0) return `${h}h ${m}m elapsed`;
      return `${m}m elapsed`;
    } catch {
      return `Departed ${timeStr}`;
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeRequests.map((req) => (
          <div
            key={req.id}
            className="bg-white border border-slate-200 hover:border-amber-400/80 rounded-xl p-4 shadow-xs transition-all flex flex-col justify-between relative group"
          >
            <div>
              {/* Header tags */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-100 text-slate-700">
                  {req.id}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
                  <Clock className="w-3 h-3 mr-1 text-amber-600" />
                  {getElapsedDisplay(req.date, req.timeOfDeparture)}
                </span>
              </div>

              {/* Requester & Position */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                  {req.requesterName}
                </h4>
                <p className="text-xs text-slate-500">
                  {req.position} {req.department ? `• ${req.department}` : ''}
                </p>
              </div>

              {/* Employees on Duty */}
              <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Staff on Duty ({req.employeesOnDuty.length}):</span>
                  {req.otherTeamsInvolved && (
                    <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      + {req.otherTeamsInvolved}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {req.employeesOnDuty.map((emp, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800"
                    >
                      {emp}
                    </span>
                  ))}
                </div>
              </div>

              {/* Purpose */}
              <div className="mt-3">
                <div className="mb-1">
                  <DutyReasonBadge reason={req.reasonOrPurpose} />
                </div>
                <p className="text-xs text-slate-700 line-clamp-2" title={req.reasonOrPurpose}>
                  {req.reasonOrPurpose}
                </p>
                {req.destination && (
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center">
                    <MapPin className="w-3 h-3 mr-1 text-slate-400 shrink-0" />
                    <span className="truncate">{req.destination}</span>
                  </p>
                )}
              </div>

              {/* Scans to be missed */}
              {req.missedFingerprintScans.length > 0 && (
                <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-blue-50/60 border border-blue-100 text-[11px] text-blue-900">
                  <span className="font-semibold">Missed Scan(s): </span>
                  {req.missedFingerprintScans.join(', ')}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                onClick={() => onViewDetails(req)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center py-1.5"
              >
                View Full Info
                <ArrowRight className="w-3 h-3 ml-1" />
              </button>

              <div className="flex items-center gap-2">
                {onDelete && (
                  <button
                    onClick={() => onDelete(req.id)}
                    className="p-2 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                    title="Delete Incorrect Record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onMarkReturn(req)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors"
                  title="Log actual return time upon arriving at office"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Mark Return
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
