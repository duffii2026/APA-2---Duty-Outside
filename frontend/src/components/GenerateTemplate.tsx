import React, { useEffect, useRef, useState } from 'react';
import { Copy, CheckCircle2, RotateCcw, ClipboardList, Plus, X, Fingerprint, MapPin, Car } from 'lucide-react';
import { autoDetectMissedScans } from '../utils/scanDetection';
import { STANDARD_FINGERPRINT_SCANS, PRESET_DUTY_REASONS, FIXED_OFFICIAL_APPROVER, POSITION_OPTIONS, POSITION_OTHER } from '../types';

export const GenerateTemplate: React.FC = () => {
  const today = new Date().toISOString().split('T')[0];
  const currentTime = new Date().toTimeString().slice(0, 5);

  const [requesterName, setRequesterName] = useState('');
  const [position, setPosition] = useState('');
  const [isCustomPosition, setIsCustomPosition] = useState(false);
  const [department, setDepartment] = useState('');
  const [employees, setEmployees] = useState<string[]>([]);
  const [newEmployee, setNewEmployee] = useState('');
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [specificDetail, setSpecificDetail] = useState('');
  const [otherTeams, setOtherTeams] = useState('');
  const [date, setDate] = useState(today);
  const [departureTime, setDepartureTime] = useState(currentTime);
  const [isReturnPending, setIsReturnPending] = useState(true);
  const [isDirectToHome, setIsDirectToHome] = useState(false);
  const [returnTime, setReturnTime] = useState('');
  const [selectedScans, setSelectedScans] = useState<string[]>([]);
  const [gdtLocation, setGdtLocation] = useState('');
  const [scanAutoExplanation, setScanAutoExplanation] = useState('');

  const scanAutoRunRef = useRef('');
  const manualScansDirtyRef = useRef(false);

  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);

  const selectedReason = PRESET_DUTY_REASONS.find((r) => r.id === selectedReasonId);
  const isGdtReason = selectedReasonId === 'gdt' || selectedReasonId === 'meet_gdt';

  useEffect(() => {
    if (!departureTime) return;
    const result = autoDetectMissedScans(departureTime, isReturnPending ? null : returnTime, isReturnPending, isDirectToHome);
    setScanAutoExplanation(result.explanation);
    const key = `${departureTime}|${returnTime}|${isReturnPending}|${isDirectToHome}`;
    if (key !== scanAutoRunRef.current) {
      scanAutoRunRef.current = key;
      manualScansDirtyRef.current = false;
    }
    if (manualScansDirtyRef.current) return;
    setSelectedScans(result.scans);
  }, [departureTime, isReturnPending, returnTime, isDirectToHome]);

  const addEmployee = () => {
    const t = newEmployee.trim();
    if (t && !employees.includes(t)) {
      setEmployees([...employees, t]);
      setNewEmployee('');
    }
  };

  const removeEmployee = (name: string) => setEmployees(employees.filter((e) => e !== name));

  const toggleScan = (label: string) => {
    manualScansDirtyRef.current = true;
    setScanAutoExplanation('');
    setSelectedScans((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  const buildReason = () => {
    const base = selectedReason ? selectedReason.label : '';
    let reason = base;
    if (base === 'Other' && specificDetail.trim()) reason = specificDetail.trim();
    else if (specificDetail.trim()) reason = `${base} — ${specificDetail.trim()}`;
    if (isGdtReason && gdtLocation.trim()) {
      reason = `${reason} (${gdtLocation.trim()})`;
    }
    return reason;
  };

  const generate = () => {
    const reason = buildReason() || 'Official Duty';
    const staffList = employees.length > 0 ? employees.join(', ') : requesterName.trim();
    const effectiveDate = date || new Date().toISOString().split('T')[0];
    const effectiveDeparture = departureTime || currentTime;
    const effectiveReturn = isDirectToHome ? 'Direct to Home' : !isReturnPending && returnTime.trim() ? returnTime : 'Pending (Will update upon return)';
    const effectiveScans = selectedScans.length > 0 ? selectedScans.join(', ') : 'None';

    const lines = [
      `DUTY OUTSIDE REQUEST`,
      ``,
      `1. Requester: ${requesterName.trim()}`,
      `2. Staff on Duty: ${staffList}`,
      `3. Position: ${position.trim()}${department.trim() ? ' (' + department.trim() + ')' : ''}`,
      `4. Reason: ${reason}`,
      `5. Other Teams: ${otherTeams.trim() || 'N/A'}`,
      `6. Date: ${effectiveDate}`,
      `7. Departure: ${effectiveDeparture}`,
      `8. Return: ${effectiveReturn}`,
      `9. Missed Scans: ${effectiveScans}`,
      `10. Approved By: ${FIXED_OFFICIAL_APPROVER}`,
    ];

    setGenerated(lines.join('\n'));
    setCopied(false);
  };

  const copyToClipboard = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = generated;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const reset = () => {
    setRequesterName('');
    setPosition('');
    setIsCustomPosition(false);
    setDepartment('');
    setEmployees([]);
    setNewEmployee('');
    setSelectedReasonId('');
    setSpecificDetail('');
    setGdtLocation('');
    setOtherTeams('');
    setDate(new Date().toISOString().split('T')[0]);
    setDepartureTime(new Date().toTimeString().slice(0, 5));
    setIsReturnPending(true);
    setIsDirectToHome(false);
    setReturnTime('');
    setSelectedScans([]);
    setScanAutoExplanation('');
    scanAutoRunRef.current = '';
    manualScansDirtyRef.current = false;
    setGenerated('');
    setCopied(false);
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white';
  const labelCls = 'block text-[11px] font-semibold text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans">
      <header className="bg-slate-900 text-white px-4 sm:px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight">APA Duty Outside Request</h1>
          <p className="text-[11px] text-slate-400">Generate Telegram template — copy & paste into the group</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-5">
          {/* Row 1: Name + Position */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>1. Requester *</label>
              <input className={inputCls} value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="requester name" />
            </div>
            <div>
              <label className={labelCls}>3. Position *</label>
              <select
                className={inputCls}
                value={isCustomPosition ? POSITION_OTHER : position}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === POSITION_OTHER) {
                    setIsCustomPosition(true);
                    setPosition('');
                  } else {
                    setIsCustomPosition(false);
                    setPosition(v);
                  }
                }}
              >
                <option value="" disabled>Select position...</option>
                {POSITION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {isCustomPosition && (
                <input
                  className={`${inputCls} mt-1.5`}
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Type custom position..."
                />
              )}
            </div>
          </div>

          {/* Department */}
          <div>
            <label className={labelCls}>Department (Optional)</label>
            <input className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Finance" />
          </div>

          {/* Employees */}
          <div>
            <label className={labelCls}>2. Staff on Duty *</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {employees.map((emp) => (
                <span key={emp} className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium text-slate-700">
                  {emp}
                  <button onClick={() => removeEmployee(emp)} className="text-slate-400 hover:text-rose-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={`${inputCls} flex-1`}
                value={newEmployee}
                onChange={(e) => setNewEmployee(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmployee(); }}}
                placeholder="Type name and press Enter or Add"
              />
              <button type="button" onClick={addEmployee} className="px-3 py-2 text-xs font-semibold bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 shrink-0">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className={labelCls}>4. Reason *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
              {PRESET_DUTY_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedReasonId(r.id)}
                  className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors ${
                    selectedReasonId === r.id
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {selectedReason && (
              <textarea
                className={`${inputCls} resize-none`}
                rows={2}
                value={specificDetail}
                onChange={(e) => setSpecificDetail(e.target.value)}
                placeholder={selectedReasonId === 'other' ? 'Specify your duty purpose' : `Add detail for ${selectedReason.label} (optional)`}
              />
            )}
            {isGdtReason && (
              <div className="mt-1.5">
                <label className={`${labelCls} text-amber-700`}>
                  <MapPin className="w-3 h-3 inline mr-1" />GDT Location (for {selectedReason?.label.toLowerCase()})
                </label>
                <input
                  className={inputCls}
                  value={gdtLocation}
                  onChange={(e) => setGdtLocation(e.target.value)}
                  placeholder="e.g. GDT Khan Daun Penh, Ministry of Economy"
                />
              </div>
            )}
          </div>

          {/* Teams + Date + Times */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>5. Other Teams Involved</label>
              <input className={inputCls} value={otherTeams} onChange={(e) => setOtherTeams(e.target.value)} placeholder="e.g. IT, HR (optional)" />
            </div>
            <div>
              <label className={labelCls}>6. Date *</label>
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>7. Departure *</label>
              <input type="time" className={inputCls} value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className={labelCls}>8. Return</label>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={isReturnPending}
                    onChange={(e) => {
                      setIsReturnPending(e.target.checked);
                      if (e.target.checked) { setIsDirectToHome(false); setReturnTime(''); }
                    }}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  Pending (will update later)
                </label>
                <label className="flex items-center gap-2 cursor-pointer bg-amber-50/70 border border-amber-200/70 rounded-lg px-2.5 py-2 text-xs text-amber-900 hover:bg-amber-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={isDirectToHome}
                    onChange={(e) => {
                      setIsDirectToHome(e.target.checked);
                      if (e.target.checked) { setIsReturnPending(false); setReturnTime(''); }
                      else { setIsReturnPending(true); setReturnTime(''); }
                    }}
                    className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="flex items-center gap-1"><Car className="w-3 h-3" /> End of Day / Direct to Home (Will not return to office)</span>
                </label>
              </div>
              {!isReturnPending && !isDirectToHome && (
                <input type="time" className={inputCls} value={returnTime} onChange={(e) => setReturnTime(e.target.value)} />
              )}
              {isReturnPending && (
                <div className="px-3 py-2 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg italic">Will update later</div>
              )}
              {isDirectToHome && (
                <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">Auto-selects Evening Out scan and marks duty as completed at end of shift for Odoo payroll reconciliation.</div>
              )}
            </div>
          </div>

          {/* Missed Scans */}
          <div>
            <label className={labelCls}><Fingerprint className="w-3 h-3 inline mr-1" />9. Missed Scans</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STANDARD_FINGERPRINT_SCANS.map((scan) => (
                <button
                  key={scan.id}
                  type="button"
                  onClick={() => toggleScan(scan.label)}
                  className={`px-2 py-2 text-[11px] font-medium rounded-lg border text-left transition-colors ${
                    selectedScans.includes(scan.label)
                      ? 'bg-rose-500 text-white border-rose-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300'
                  }`}
                >
                  {scan.label}
                </button>
              ))}
            </div>
            {scanAutoExplanation && !manualScansDirtyRef.current && (
              <p className="mt-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                {scanAutoExplanation} — Scan list refreshed automatically.
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={generate}
              disabled={!requesterName.trim() || !position.trim()}
              className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Generate Template
            </button>
            <button type="button" onClick={reset} className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-colors">
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Reset
            </button>
            <div className="ml-auto text-[11px] text-slate-400">10. Approved By: <span className="font-medium text-slate-600">{FIXED_OFFICIAL_APPROVER}</span></div>
          </div>
        </div>

        {/* Generated Output */}
        {generated && (
          <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Generated Telegram Message</h3>
              <button
                type="button"
                onClick={copyToClipboard}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors bg-emerald-500 hover:bg-emerald-400 text-white"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="whitespace-pre-wrap bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 font-mono leading-relaxed select-all">
              {generated}
            </pre>
            <p className="text-[11px] text-slate-500">Paste this into the Telegram group to submit a duty outside request.</p>
          </div>
        )}
      </main>
    </div>
  );
};