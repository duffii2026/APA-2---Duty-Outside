import React, { useState, useMemo } from 'react';
import { 
  X, 
  Fingerprint, 
  Search, 
  Calendar, 
  CheckCircle2, 
  Download, 
  AlertCircle,
  Copy,
  Check
} from 'lucide-react';
import { DutyOutsideRequest, STANDARD_FINGERPRINT_SCANS } from '../types';

interface FingerprintReconciliationProps {
  requests: DutyOutsideRequest[];
  isOpen: boolean;
  onClose: () => void;
}

export const FingerprintReconciliation: React.FC<FingerprintReconciliationProps> = ({
  requests,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  const [selectedScanFilter, setSelectedScanFilter] = useState<string>('all');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [copied, setCopied] = useState(false);

  // Flatten entries per employee on duty
  const reconciliationEntries = useMemo(() => {
    const list: Array<{
      employeeName: string;
      date: string;
      missedScan: string;
      requestId: string;
      dutyPurpose: string;
      departureTime: string;
      returnTime: string | null;
      approvedBy: string;
    }> = [];

    requests.forEach((req) => {
      if (req.missedFingerprintScans && req.missedFingerprintScans.length > 0) {
        req.employeesOnDuty.forEach((emp) => {
          req.missedFingerprintScans.forEach((scan) => {
            list.push({
              employeeName: emp,
              date: req.date,
              missedScan: scan,
              requestId: req.id,
              dutyPurpose: req.reasonOrPurpose,
              departureTime: req.timeOfDeparture,
              returnTime: req.timeOfReturn,
              approvedBy: req.approvedBy
            });
          });
        });
      }
    });

    return list.filter((item) => {
      const matchesSearch = 
        !employeeSearch || 
        item.employeeName.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        item.requestId.toLowerCase().includes(employeeSearch.toLowerCase());
      
      const matchesScan = 
        selectedScanFilter === 'all' || item.missedScan === selectedScanFilter;

      return matchesSearch && matchesScan;
    });
  }, [requests, employeeSearch, selectedScanFilter]);

  const handleCopySummary = () => {
    const text = reconciliationEntries
      .map(
        (e) =>
          `[${e.date}] ${e.employeeName} | Scan: ${e.missedScan} | Ref: ${e.requestId} | Duty: ${e.dutyPurpose} | Approved: ${e.approvedBy}`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-6">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-white">
                  HR & Attendance Biometric Reconciliation
                </h3>
                <span className="px-2 py-0.5 rounded text-[11px] bg-blue-400/20 text-blue-300 border border-blue-400/30 font-medium">
                  Attendance Policy Compliance
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Reconciliation ledger for fingerprint scans missed due to approved external duties.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <div className="relative w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Search staff or reference..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={selectedScanFilter}
              onChange={(e) => setSelectedScanFilter(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700"
            >
              <option value="all">All Missed Scans ({reconciliationEntries.length})</option>
              {STANDARD_FINGERPRINT_SCANS.map((scan) => (
                <option key={scan.id} value={scan.label}>
                  {scan.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCopySummary}
            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1" />
                Copied to Clipboard
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copy Reconcile Log
              </>
            )}
          </button>
        </div>

        {/* Content Table */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {reconciliationEntries.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <Fingerprint className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium">No missed fingerprint scan records found.</p>
              <p className="text-xs mt-1">Staff movements did not incur missed biometric scans.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase bg-slate-50">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Staff Name</th>
                  <th className="py-2.5 px-3">Authorized Missed Scan</th>
                  <th className="py-2.5 px-3">Duty Reference & Purpose</th>
                  <th className="py-2.5 px-3">Movement Hours</th>
                  <th className="py-2.5 px-3">Approved By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {reconciliationEntries.map((item, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/40">
                    <td className="py-3 px-3 font-medium whitespace-nowrap">
                      {item.date}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      {item.employeeName}
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-900 border border-blue-200">
                        {item.missedScan}
                      </span>
                    </td>
                    <td className="py-3 px-3 max-w-xs">
                      <span className="font-mono text-[11px] text-slate-500 block">
                        {item.requestId}
                      </span>
                      <span className="line-clamp-1 text-slate-800" title={item.dutyPurpose}>
                        {item.dutyPurpose}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="text-slate-600">
                        {item.departureTime} → {item.returnTime || 'Pending'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-emerald-800 font-medium whitespace-nowrap">
                      {item.approvedBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <p>
            Total Authorized Missed Biometric Scans: <strong>{reconciliationEntries.length}</strong>
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
