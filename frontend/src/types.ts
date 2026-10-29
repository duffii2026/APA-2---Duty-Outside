export type SubmissionTiming = 'advance' | 'on_time' | 'retroactive';

export type DisciplinaryNoticeLevel = 
  | 'clean'           // 0 strikes
  | 'first_notice'    // 1st strike: Friendly Reminder
  | 'second_notice'   // 2nd strike: Supervisor / HOD Notice
  | 'verbal_warning'  // 3rd strike: Official Verbal Warning & Absence Risk
  | 'written_warning';// 4th+ strike: Formal Written Warning Letter

export interface DutyOutsideRequest {
  id: string; // e.g. "DOR-2026-0042" (year is dynamic)
  requesterName: string;
  employeesOnDuty: string[]; // List of all staff involved
  position: string; // Requester's position
  department?: string; // Optional department
  reasonOrPurpose: string; // Detailed purpose
  destination?: string; // Duty location/client
  otherTeamsInvolved?: string; // Other team(s) involved if applicable
  date: string; // YYYY-MM-DD
  timeOfDeparture: string; // HH:MM (24h or formatted)
  timeOfReturn: string | null; // null if pending, or HH:MM
  isReturnPending: boolean;
  missedFingerprintScans: string[]; // array of scan names
  approvedBy: string; // Supervisor / HOD name
  status: 'active' | 'returned' | 'incomplete';
  returnNotes?: string;
  /** Where the record was filed from. 'public' = the no-login staff tab. */
  source?: 'web' | 'telegram' | 'public';
  isDirectToHome?: boolean;
  isWaivedByGM?: boolean;
  gmWaiverNote?: string;
  gmWaiverDate?: string;
  submissionTiming?: SubmissionTiming;
  isRetroactive?: boolean;
  lateSubmissionReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ScanOption = {
  id: string;
  label: string;
  timeWindow: string;
  description: string;
};

export const STANDARD_FINGERPRINT_SCANS: ScanOption[] = [
  {
    id: 'morning_in',
    label: 'Morning In (Check-In)',
    timeWindow: '08:00 – 08:30',
    description: 'Standard office morning entry scan'
  },
  {
    id: 'lunch_out',
    label: 'Lunch Out (Check-Out)',
    timeWindow: '12:00 – 12:30',
    description: 'Midday departure scan'
  },
  {
    id: 'lunch_in',
    label: 'Lunch In (Check-In)',
    timeWindow: '13:00 – 13:30',
    description: 'Midday return scan'
  },
  {
    id: 'evening_out',
    label: 'Evening Out (Check-Out)',
    timeWindow: '17:00 – 17:30',
    description: 'End of work day departure scan'
  }
];

export interface DutyReasonOption {
  id: string;
  label: string;
  description: string;
}

export const PRESET_DUTY_REASONS: DutyReasonOption[] = [
  {
    id: 'bank',
    label: 'Go to bank',
    description: 'Cheque deposits, cash transactions, bank statements, withdrawals'
  },
  {
    id: 'gdt',
    label: 'Go to GDT',
    description: 'General Department of Taxation submission, document drop-off, stamps'
  },
  {
    id: 'meet_gdt',
    label: 'Go to meet GDT',
    description: 'Official meeting, tax audit discussion, clarification with GDT tax officers'
  },
  {
    id: 'cfo_tasks',
    label: 'Doing CFO tasks',
    description: 'Executive financial errands, urgent approvals, document signings'
  },
  {
    id: 'other',
    label: 'Other',
    description: 'Specify other custom duty purpose not listed above'
  }
];

export const OFFICIAL_MEMO_META = {
  docNumber: 'APA-MEMO_09-2026_05',
  organization: 'APA GROUP',
  office: 'Office of the General Manager',
  signatory: 'Mr. Shawn',
  signatoryTitle: 'General Manager',
  classification: 'This memorandum is classified as INTERNAL and intended solely for APA staff. Unauthorised distribution is prohibited.',
  confidentialityNotice: 'APA — Confidential. For internal use only.'
};

// Position options from Staff up to CEO, plus a free-text "Other" option.
export const POSITION_OPTIONS: string[] = [
  'Staff',
  'Senior Staff',
  'Supervisor',
  'Assistant Manager',
  'Manager',
  'Senior Manager',
  'Department Head',
  'Director',
  'General Manager',
  'Vice President',
  'CEO',
  'Other',
];

export const POSITION_OTHER = 'Other';

export const FIXED_OFFICIAL_APPROVER = 'Mr. Shawn (General Manager)';

export const MEMO_SUBMISSION_REQUIREMENTS = [
  { itemNumber: 1, label: "Requester's Name", notes: '' },
  { itemNumber: 2, label: 'Employee(s) on Duty', notes: 'list all staff involved' },
  { itemNumber: 3, label: 'Position', notes: '' },
  { itemNumber: 4, label: 'Reason or Purpose', notes: 'provide clear details' },
  { itemNumber: 5, label: 'Other Team(s) Involved', notes: 'if applicable' },
  { itemNumber: 6, label: 'Date', notes: '' },
  { itemNumber: 7, label: 'Time of Departure', notes: '' },
  { itemNumber: 8, label: 'Time of Return', notes: 'may be updated upon returning to office, same day' },
  { itemNumber: 9, label: 'Missed Fingerprint Scan(s)', notes: 'indicate which scans will be missed' },
  { itemNumber: 10, label: 'Approved By', notes: '' }
];

export const MEMO_SECTIONS = [
  {
    num: '1',
    title: 'Purpose & Tracking Nature',
    content: 'Effective immediately, all APA staff are required to submit a Duty Outside Request through the Duty Outside Request System before leaving the office for any external duty assignment. This is an operational tracking mechanism — not an approval gate — to ensure management has full visibility of staff on external duty at all times without delaying urgent assignments. The system is available to all staff via web portal and Telegram bot assistant.'
  },
  {
    num: '2',
    title: 'Submission Requirements & Advance Bookings',
    content: 'Each request must be submitted with the 10 standard items:\n1. Requester\'s Name\n2. Employee(s) on Duty — list all staff involved (one person may submit for a team)\n3. Position\n4. Reason or Purpose — bank, GDT, meet GDT, CFO tasks, or other\n5. Other Team(s) Involved — if applicable\n6. Date — today or a future date for advance bookings\n7. Time of Departure\n8. Time of Return — confirmed time, pending, or direct to home\n9. Missed Fingerprint Scan(s) — indicated for Odoo attendance reconciliation\n10. Approved By — default: Mr. Shawn (General Manager)\n\nAdvance Bookings: Staff may submit requests in advance for upcoming dates. When submitted in advance, the record remains scheduled until the duty date.'
  },
  {
    num: '3',
    title: 'Return Time Policy: Operational Necessity, Pending Return & Direct to Home',
    content: '• Operational Need (No Arbitrary Duration Cap): Duties outside are authorized based on task requirements (e.g. multi-hour bank queues, GDT tax audits, or CFO assignments). There is no artificial 2-hour cap.\n• Known Return Time: If your schedule is known in advance, enter your confirmed return time at submission. You do not need to update upon returning unless delayed.\n• Pending Return Time: If return duration is uncertain, select "Pending". You must confirm the actual return time before 6:00 PM (end of working day) upon returning to the office, or via Telegram bot (/return [HH:MM]). Ongoing duties during active office hours are not treated as overdue strikes.\n• Direct to Home: If an afternoon duty concludes your work day and you do not return to the office, select "Direct to Home" to excuse the evening checkout scan (17:00).'
  },
  {
    num: '4',
    title: 'Compliance, 48-Hour Emergency Grace Period & 3-Strike Disciplinary Framework',
    content: 'Submission prior to departure is mandatory for all staff without exception.\n\n• 48-Hour Emergency Grace Period & Weekend Rollover: In unavoidable emergency cases where a duty could not be pre-logged, staff must submit a retroactive request with a valid written explanation within 48 hours. For duties occurring on Friday afternoon, the deadline is extended to Monday at 10:00 AM.\n\n• Emergency Exemption vs. Strike:\n  - Valid Emergency (< 48h): If logged within 48 hours with a verified written justification, an official attendance exemption is granted (0 strikes), and biometric scans are excused in Odoo.\n  - Overdue Submissions (> 48h) or Unexcused Absences: Triggers the progressive disciplinary framework.\n\n• Progressive Disciplinary Measures (3-Strike Rule):\n  - 1st Occurrence: Friendly HR Reminder & Recorded Note.\n  - 2nd Occurrence: Formal Notice to Staff with official copy to Head of Department (HOD).\n  - 3rd Occurrence: Official Verbal Warning placed on HR record. Missed time without approved request treated as Unauthorised Absence with payroll salary deduction in Odoo.\n  - Continued Violations (4th+): Formal Written Disciplinary Warning Letter signed by the General Manager.'
  },
  {
    num: '5',
    title: 'Executive Discretion & GM Strike Waiver',
    content: 'The General Manager (Mr. Shawn) reserves full executive discretion to review, excuse, or waive recorded strikes in exceptional circumstances (e.g., verified medical emergencies, hospitalization, severe transportation disruptions, or technical system outages). When waived, the duty record is officially marked "Excused by GM" with attendance preserved in Odoo.'
  }
];
