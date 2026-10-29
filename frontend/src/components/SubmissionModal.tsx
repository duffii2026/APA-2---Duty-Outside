import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Clock, 
  Calendar, 
  User, 
  Users, 
  Briefcase, 
  HelpCircle, 
  ShieldCheck, 
  Fingerprint, 
  AlertCircle,
  Building,
  Building2,
  Landmark,
  Check,
  Lock,
  Sparkles
} from 'lucide-react';
import { 
  DutyOutsideRequest, 
  STANDARD_FINGERPRINT_SCANS, 
  PRESET_DUTY_REASONS,
  FIXED_OFFICIAL_APPROVER,
  POSITION_OPTIONS,
  POSITION_OTHER
} from '../types';
import { autoDetectMissedScans } from '../utils/scanDetection';

interface SubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (request: DutyOutsideRequest) => void;
}

export const SubmissionModal: React.FC<SubmissionModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const today = new Date().toISOString().split('T')[0];
  const currentTime = new Date().toTimeString().slice(0, 5);

  const [requesterName, setRequesterName] = useState('');
  const [position, setPosition] = useState('');
  const [isCustomPosition, setIsCustomPosition] = useState(false);
  const [department, setDepartment] = useState('');
  const [reasonOrPurpose, setReasonOrPurpose] = useState('');
  const [selectedReasonId, setSelectedReasonId] = useState<string>('');
  const [specificDetail, setSpecificDetail] = useState('');
  const [destination, setDestination] = useState('');
  const [otherTeamsInvolved, setOtherTeamsInvolved] = useState('');
  const [date, setDate] = useState(today);
  const [timeOfDeparture, setTimeOfDeparture] = useState(currentTime);
  const [isReturnPending, setIsReturnPending] = useState(true);
  const [timeOfReturn, setTimeOfReturn] = useState('');
  
  // Only Mr. Shawn can approve - fixed for all submissions
  const approvedBy = FIXED_OFFICIAL_APPROVER;
  
  // Multiple employees on duty
  const [employees, setEmployees] = useState<string[]>([]);
  const [newEmployeeInput, setNewEmployeeInput] = useState('');

  // Missed fingerprint scans
  const [selectedScans, setSelectedScans] = useState<string[]>([]);
  const [customScanInput, setCustomScanInput] = useState('');
  const [showCustomScan, setShowCustomScan] = useState(false);
  const [autoDetectNotice, setAutoDetectNotice] = useState<string>('');
  const [isDirectToHome, setIsDirectToHome] = useState(false);

  // Automatically detect missed fingerprint scans based on departure & return times.
  // Detection always replaces the previous selection (incl. clearing stale ones) unless
  // the user manually edited the scan list after the last time input change.
  const scanInputsRef = useRef(`${timeOfDeparture}|${timeOfReturn}|${isReturnPending}|${isDirectToHome}`);
  const manualScanDirtyRef = useRef(false);

  useEffect(() => {
    if (!timeOfDeparture) return;
    const result = autoDetectMissedScans(
      timeOfDeparture,
      isReturnPending ? null : timeOfReturn,
      isReturnPending,
      isDirectToHome
    );

    setAutoDetectNotice(result.scans.length > 0 ? result.explanation : '');

    const key = `${timeOfDeparture}|${timeOfReturn}|${isReturnPending}|${isDirectToHome}`;
    if (key !== scanInputsRef.current) {
      scanInputsRef.current = key;
      manualScanDirtyRef.current = false;
    }
    if (manualScanDirtyRef.current) return;
    setSelectedScans(result.scans);
  }, [timeOfDeparture, timeOfReturn, isReturnPending, isDirectToHome]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset all form fields every time the modal opens
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const now = new Date();
      setRequesterName('');
      setPosition('');
      setIsCustomPosition(false);
      setDepartment('');
      setReasonOrPurpose('');
      setSelectedReasonId('');
      setSpecificDetail('');
      setDestination('');
      setOtherTeamsInvolved('');
      setDate(now.toISOString().split('T')[0]);
      setTimeOfDeparture(now.toTimeString().slice(0, 5));
      setIsReturnPending(true);
      setTimeOfReturn('');
      setEmployees([]);
      setNewEmployeeInput('');
      setSelectedScans([]);
      setCustomScanInput('');
      setShowCustomScan(false);
      setAutoDetectNotice('');
      setIsDirectToHome(false);
      setErrors({});
      scanInputsRef.current = '';
      manualScanDirtyRef.current = false;
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddEmployee = () => {
    const trimmed = newEmployeeInput.trim();
    if (trimmed && !employees.includes(trimmed)) {
      setEmployees([...employees, trimmed]);
      setNewEmployeeInput('');
    }
  };

  const handleRemoveEmployee = (index: number) => {
    setEmployees(employees.filter((_, i) => i !== index));
  };

  const handleAddRequesterToDutyList = () => {
    if (requesterName.trim() && !employees.includes(requesterName.trim())) {
      setEmployees([requesterName.trim(), ...employees]);
    }
  };

  const toggleScan = (label: string) => {
    manualScanDirtyRef.current = true;
    if (selectedScans.includes(label)) {
      setSelectedScans(selectedScans.filter((s) => s !== label));
    } else {
      setSelectedScans([...selectedScans, label]);
    }
  };

  const handleAddCustomScan = () => {
    const trimmed = customScanInput.trim();
    if (trimmed && !selectedScans.includes(trimmed)) {
      manualScanDirtyRef.current = true;
      setSelectedScans([...selectedScans, trimmed]);
      setCustomScanInput('');
      setShowCustomScan(false);
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!requesterName.trim()) errs.requesterName = "Requester's Name is required (Item 1)";
    if (employees.length === 0 && !requesterName.trim()) {
      errs.employees = "At least one employee must be listed on duty (Item 2)";
    }
    if (!position.trim()) errs.position = "Position is required (Item 3)";
    if (!reasonOrPurpose.trim()) errs.reasonOrPurpose = "Reason or Purpose is required (Item 4)";
    if (!date) errs.date = "Date is required (Item 6)";
    if (!timeOfDeparture) errs.timeOfDeparture = "Time of Departure is required (Item 7)";
    if (!isReturnPending && !timeOfReturn) {
      errs.timeOfReturn = "Please specify confirmed return time or check Pending (Item 8)";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Ensure requester is in employees list if list is empty
    const finalEmployees = employees.length > 0 
      ? employees 
      : (requesterName.trim() ? [requesterName.trim()] : []);

    const newId = `DOR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newRequest: DutyOutsideRequest = {
      id: newId,
      requesterName: requesterName.trim(),
      employeesOnDuty: finalEmployees,
      position: position.trim(),
      department: department.trim() || undefined,
      reasonOrPurpose: reasonOrPurpose.trim(),
      destination: destination.trim() || undefined,
      otherTeamsInvolved: otherTeamsInvolved.trim() || undefined,
      date,
      timeOfDeparture,
      timeOfReturn: isReturnPending ? null : timeOfReturn,
      isReturnPending,
      isDirectToHome,
      missedFingerprintScans: selectedScans,
      approvedBy: approvedBy.trim(),
      status: isReturnPending ? 'active' : 'returned',
      createdAt: new Date().toISOString()
    };

    onSubmit(newRequest);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden my-auto max-h-[95vh] sm:max-h-[90vh] flex flex-col min-w-0">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-950 px-4 sm:px-6 py-3.5 sm:py-5 text-white flex items-center justify-between gap-3 border-b border-slate-800 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="inline-block px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-xs font-bold uppercase tracking-wider">
                Submission Form
              </span>
              <span className="text-xs text-slate-300 font-mono truncate">Official Procedure</span>
            </div>
            <h2 className="text-base sm:text-xl font-bold text-white mt-1 truncate">
              Duty Outside Request Submission
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              Complete required items before leaving the office premises.
            </p>
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

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Policy Info banner */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-3.5 rounded-r-lg text-xs text-amber-900 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-950">APA Tracking Mechanism Notice</p>
              <p className="mt-0.5 text-amber-800">
                This request acts as an operational tracking mechanism for staff movement and biometric attendance reconciliation. If return time is left pending, it must be updated on the same day of return without fail.
              </p>
            </div>
          </div>

          {/* Section 1 & 3: Requester Details */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center">
              <User className="w-4 h-4 mr-2 text-slate-600" />
              1. Requester & Department Information
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  1. Requester's Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => {
                    setRequesterName(e.target.value);
                    if (errors.requesterName) setErrors({ ...errors, requesterName: '' });
                  }}
                  placeholder="e.g., Sok Mouy"
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white ${
                    errors.requesterName ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                  }`}
                />
                {errors.requesterName && (
                  <p className="text-xs text-rose-600 mt-1">{errors.requesterName}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  3. Position <span className="text-rose-500">*</span>
                </label>
                <select
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
                    if (errors.position) setErrors({ ...errors, position: '' });
                  }}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white ${
                    errors.position ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                  }`}
                >
                  <option value="" disabled>
                    Select position...
                  </option>
                  {POSITION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {isCustomPosition && (
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => {
                      setPosition(e.target.value);
                      if (errors.position) setErrors({ ...errors, position: '' });
                    }}
                    placeholder="Type custom position..."
                    className={`w-full px-3 py-2 mt-1.5 text-sm border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white ${
                      errors.position ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                  />
                )}
                {errors.position && (
                  <p className="text-xs text-rose-600 mt-1">{errors.position}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Department (Optional)
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g., IT & Infrastructure"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  5. Other Team(s) Involved (if applicable)
                </label>
                <input
                  type="text"
                  value={otherTeamsInvolved}
                  onChange={(e) => setOtherTeamsInvolved(e.target.value)}
                  placeholder="e.g., Operations, Logistics, Facilities"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Employees on Duty */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center">
                  <Users className="w-4 h-4 mr-2 text-slate-600" />
                  2. Employee(s) on Duty <span className="text-rose-500 ml-1">*</span>
                </h3>
                <p className="text-xs text-slate-500">
                  List all staff members involved in the external duty assignment.
                </p>
              </div>
              {requesterName.trim() && !employees.includes(requesterName.trim()) && (
                <button
                  type="button"
                  onClick={handleAddRequesterToDutyList}
                  className="text-xs text-amber-700 hover:text-amber-800 font-medium underline flex items-center"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Requester ({requesterName})
                </button>
              )}
            </div>

            {/* Employee tags */}
            <div className="flex flex-wrap gap-2 min-h-[32px] p-2 bg-white rounded-lg border border-slate-200">
              {employees.length === 0 ? (
                <span className="text-xs text-slate-400 italic">
                  No staff added yet. Enter names below or add requester.
                </span>
              ) : (
                employees.map((emp, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-white shadow-xs"
                  >
                    <User className="w-3 h-3 mr-1.5 text-amber-400" />
                    {emp}
                    <button
                      type="button"
                      onClick={() => handleRemoveEmployee(index)}
                      className="ml-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Add Employee Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newEmployeeInput}
                onChange={(e) => setNewEmployeeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEmployee();
                  }
                }}
                placeholder="Enter staff name and press Add..."
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
              />
              <button
                type="button"
                onClick={handleAddEmployee}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 flex items-center transition-colors"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Staff
              </button>
            </div>
            {errors.employees && (
              <p className="text-xs text-rose-600 mt-1">{errors.employees}</p>
            )}
          </div>

          {/* Section 4: Reason or Purpose */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-900">
                  4. Reason or Purpose <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-500">
                  Select a standard duty reason or choose Other
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-2.5">
                Select your primary duty off-site, or select Other if your reason is not in the system.
              </p>

              {/* Pre-defined Reason Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                {PRESET_DUTY_REASONS.map((preset) => {
                  const isSelected = selectedReasonId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedReasonId(preset.id);
                        if (errors.reasonOrPurpose) {
                          setErrors({ ...errors, reasonOrPurpose: '' });
                        }
                        if (preset.id === 'other') {
                          setReasonOrPurpose(specificDetail);
                        } else {
                          const fullText = specificDetail.trim() 
                            ? `${preset.label} - ${specificDetail.trim()}`
                            : preset.label;
                          setReasonOrPurpose(fullText);
                        }
                      }}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2.5 ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 border-amber-600 font-semibold shadow-xs ring-1 ring-amber-500'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {preset.id === 'bank' && <Landmark className="w-4 h-4" />}
                        {preset.id === 'gdt' && <Building2 className="w-4 h-4" />}
                        {preset.id === 'meet_gdt' && <Users className="w-4 h-4" />}
                        {preset.id === 'cfo_tasks' && <Briefcase className="w-4 h-4" />}
                        {preset.id === 'other' && <HelpCircle className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-xs leading-tight">{preset.label}</div>
                        <div className={`text-[10px] mt-0.5 line-clamp-1 ${isSelected ? 'text-slate-900/80' : 'text-slate-500'}`}>
                          {preset.description}
                        </div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 ml-auto shrink-0 text-slate-950 font-bold" />}
                    </button>
                  );
                })}
              </div>

              {/* Specific Details / Custom Input */}
              {selectedReasonId === 'other' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-800 mb-1">
                    Specify Duty Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={reasonOrPurpose}
                    onChange={(e) => {
                      setReasonOrPurpose(e.target.value);
                      setSpecificDetail(e.target.value);
                      if (errors.reasonOrPurpose) setErrors({ ...errors, reasonOrPurpose: '' });
                    }}
                    placeholder="Describe specific tasks, client meeting, vendor visits, field audits, etc..."
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white ${
                      errors.reasonOrPurpose ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Staff could not find their reason in the list, so custom details are specified here.
                  </p>
                </div>
              ) : selectedReasonId ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Specific Tasks / Notes for <span className="font-semibold text-slate-900">{PRESET_DUTY_REASONS.find(p => p.id === selectedReasonId)?.label}</span> (Optional)
                  </label>
                  <input
                    type="text"
                    value={specificDetail}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSpecificDetail(val);
                      const currentPreset = PRESET_DUTY_REASONS.find(p => p.id === selectedReasonId);
                      if (currentPreset) {
                        setReasonOrPurpose(val.trim() ? `${currentPreset.label} (${val.trim()})` : currentPreset.label);
                      }
                    }}
                    placeholder="e.g., ABA Bank Main Branch for payroll / Meeting with Mr. Vichea at GDT Khan Daun Penh"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Summary recorded: <strong className="text-slate-800 font-medium">{reasonOrPurpose || 'None'}</strong></span>
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    rows={2}
                    value={reasonOrPurpose}
                    onChange={(e) => {
                      setReasonOrPurpose(e.target.value);
                      if (errors.reasonOrPurpose) setErrors({ ...errors, reasonOrPurpose: '' });
                    }}
                    placeholder="Click a quick option above, or type custom reason here..."
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white ${
                      errors.reasonOrPurpose ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                  />
                </div>
              )}

              {errors.reasonOrPurpose && (
                <p className="text-xs text-rose-600 mt-1.5">{errors.reasonOrPurpose}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Destination / Location (Optional)
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g., ABA Bank Head Office, GDT Chamkarmon, Ministry of Economy"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>
          </div>

          {/* Section 6, 7, 8: Date and Time of Movement */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center">
              <Clock className="w-4 h-4 mr-2 text-slate-600" />
              6, 7, 8. Schedule & Movement Times
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  6. Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  7. Time of Departure <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  value={timeOfDeparture}
                  onChange={(e) => {
                    setTimeOfDeparture(e.target.value);
                    if (errors.timeOfDeparture) setErrors({ ...errors, timeOfDeparture: '' });
                  }}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white ${
                    errors.timeOfDeparture ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  8. Time of Return
                </label>
                {isReturnPending ? (
                  <div className="px-3 py-2 text-xs bg-amber-100/70 border border-amber-300 text-amber-900 rounded-lg flex items-center justify-between">
                    <span className="font-medium">Pending Return</span>
                    <span className="text-[11px] text-amber-700">Update on return</span>
                  </div>
                ) : (
                  <input
                    type="time"
                    value={timeOfReturn}
                    onChange={(e) => {
                      setTimeOfReturn(e.target.value);
                      if (errors.timeOfReturn) setErrors({ ...errors, timeOfReturn: '' });
                    }}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white ${
                      errors.timeOfReturn ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                    }`}
                  />
                )}
              </div>
            </div>

            {/* Memo Section 4 Checkbox Toggle & End of Day / Direct to Home */}
            <div className="pt-1 space-y-2">
              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isReturnPending}
                  disabled={isDirectToHome}
                  onChange={(e) => {
                    setIsReturnPending(e.target.checked);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-medium text-slate-800">
                    Leave Return Time pending (to be updated upon returning to the office)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Return time must be updated on the same day of return without fail.
                  </p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-amber-50/70 p-2.5 rounded-lg border border-amber-200/70">
                <input
                  type="checkbox"
                  checked={isDirectToHome}
                  onChange={(e) => {
                    setIsDirectToHome(e.target.checked);
                    if (e.target.checked) {
                      setIsReturnPending(false);
                      setTimeOfReturn('17:00');
                    } else {
                      setIsReturnPending(true);
                      setTimeOfReturn('');
                    }
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                    🚗 End of Day / Direct to Home (Will not return to office)
                  </span>
                  <p className="text-[11px] text-amber-800/90">
                    Auto-selects Evening Out scan and marks duty as completed at end of shift for Odoo payroll reconciliation.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Section 9: Missed Fingerprint Scan(s) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center">
                  <Fingerprint className="w-4 h-4 mr-2 text-blue-600" />
                  9. Missed Fingerprint Scan(s)
                </h3>
                <p className="text-xs text-slate-500">
                  Indicate which biometric scans will be missed due to this duty for HR attendance reconciliation.
                </p>
              </div>

              {autoDetectNotice && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-100 text-sky-800 text-[11px] font-semibold rounded-full border border-sky-200 self-start sm:self-auto shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5 text-sky-600 animate-pulse" />
                  <span>{autoDetectNotice}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {STANDARD_FINGERPRINT_SCANS.map((scan) => {
                const isSelected = selectedScans.includes(scan.label);
                return (
                  <button
                    type="button"
                    key={scan.id}
                    onClick={() => toggleScan(scan.label)}
                    className={`text-left p-3 rounded-xl border transition-all flex items-start justify-between ${
                      isSelected
                        ? 'bg-blue-50/80 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-xs font-semibold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                          {scan.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Window: {scan.timeWindow}
                      </p>
                    </div>
                    <div className={`w-4 h-4 rounded flex items-center justify-center border mt-0.5 ${
                      isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-3" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Scan additions */}
            {selectedScans.filter(s => !STANDARD_FINGERPRINT_SCANS.some(scan => scan.label === s)).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {selectedScans
                  .filter(s => !STANDARD_FINGERPRINT_SCANS.some(scan => scan.label === s))
                  .map((custom, idx) => (
                    <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded text-xs bg-blue-100 text-blue-800 border border-blue-200">
                      {custom}
                      <button 
                        type="button" 
                        onClick={() => toggleScan(custom)}
                        className="ml-1 text-blue-600 hover:text-blue-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}

            <div className="pt-1 flex items-center justify-between text-xs">
              {showCustomScan ? (
                <div className="flex items-center space-x-2 w-full mt-1">
                  <input
                    type="text"
                    value={customScanInput}
                    onChange={(e) => setCustomScanInput(e.target.value)}
                    placeholder="Enter custom scan interval e.g. Special Shift (15:00)"
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomScan}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomScan(false)}
                    className="px-2 py-1.5 text-xs text-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCustomScan(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Add another shift or custom scan interval
                </button>
              )}
            </div>
          </div>

          {/* Section 10: Approved By */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center">
                <ShieldCheck className="w-4 h-4 mr-2 text-emerald-600" />
                10. Approved By <span className="text-rose-500 ml-1">*</span>
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200/80 text-slate-700 border border-slate-300/80">
                <Lock className="w-3 h-3 mr-1 text-slate-500" />
                Fixed
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-2.5">
              Designated authority approving this movement. Only Mr. Shawn can approve (fixed as per directive).
            </p>
            <div className="relative">
              <input
                type="text"
                value="Mr. Shawn (General Manager)"
                readOnly
                disabled
                className="w-full px-3.5 py-2.5 text-sm font-semibold border border-slate-300 rounded-lg bg-slate-100/90 text-slate-800 cursor-not-allowed select-none shadow-2xs pr-10"
              />
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4 text-slate-400" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                As designated, only <strong>Mr. Shawn</strong> can approve. This column is permanently fixed and cannot be changed.
              </span>
            </p>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              Submit Duty Outside Request
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
