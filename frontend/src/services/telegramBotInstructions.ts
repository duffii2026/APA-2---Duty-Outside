/**
 * Official Telegram Bot Instructions & Formats
 */

export const TELEGRAM_DUTY_INSTRUCTION_MESSAGE = `📋 <b>APA DUTY OUTSIDE — SUBMISSION GUIDE & TEMPLATE</b>

To request permission for duty outside the office, please copy, fill out, and send this exact format into this group:

<code>Duty Outside Request
1. Requester: [Your Full Name]
2. Staff on Duty: [Your Name, or Name of all staff going]
3. Position: [Your Job Title / Position]
4. Reason: [Select one approved reason below]
5. Other Teams: [e.g. Accounting, Operations, or None]
6. Date: ${new Date().toISOString().split('T')[0]}
7. Departure: [e.g. 10:30 AM or 14:00]
8. Return: [e.g. 12:30 PM, Pending, or Direct to Home]
9. Missed Scans: [Select from scan list below, or None]
10. Approved By: Mr. Shawn (General Manager)</code>

───────────────
🏢 <b>APPROVED REASON CHOICES (Item 4):</b>
• <b>Go to bank</b> (Cheque deposits, cash transactions, bank statements)
• <b>Go to GDT</b> (Tax filings, document submissions at tax branches)
• <b>Go to meet GDT</b> (Official meetings, audit queries, discussions)
• <b>Doing CFO tasks</b> (Urgent financial assignments, executive errands)
• <b>Other: [specify]</b> (Client visits, site inspections, purchasing)

───────────────
⏰ <b>BIOMETRIC SCANS GUIDE (Item 9 - For Odoo Attendance):</b>
<i>(Indicate which scheduled scans you will miss so HR can excuse them in Odoo)</i>
• <b>Morning In</b> → If out between 08:00 – 08:30 AM
• <b>Lunch Out</b> → If out between 12:00 – 12:30 PM
• <b>Lunch In</b> → If returning after 13:00 – 13:30 PM
• <b>Evening Out</b> → If leaving after 16:30 or going <b>Direct to Home</b>
• <b>Full Day</b> → All 4 scans (if away the entire day 08:00 – 17:00)
• <b>None</b> → If trip is in-between scan hours (e.g. 09:30 – 11:30)

───────────────
🚗 <b>HOW TO REPORT YOUR RETURN / COMPLETION:</b>
Once you get back to the office or finish your duty, reply to your message with:
• <code>Returned at 12:45</code> <i>(if back in office)</i>
• <code>Duty completed at 17:15. Direct to home.</code> <i>(if end of day)</i>

<i>⚡ The system will automatically log your return, reconcile your hours, and alert Mr. Shawn.</i>`;

/**
 * Checks if incoming text from Telegram is asking for help or instructions
 */
export function isHelpOrInstructionInquiry(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();

  // Common commands
  if (
    lower === '/help' ||
    lower === '/start' ||
    lower === '/template' ||
    lower === '/format' ||
    lower === '/instruction' ||
    lower === '/instructions' ||
    lower === '/duty'
  ) {
    return true;
  }

  // Natural language query patterns
  const helpPatterns = [
    'how to fill',
    'how to request',
    'how to use',
    'how to do',
    'instruction',
    'give me instruction',
    'give instruction',
    'send instruction',
    'template',
    'form format',
    'duty format',
    'duty template',
    'help me fill',
    'what to fill',
    'format please',
    'template please',
    'help please',
    'pls give me the instruction',
    'please give me the instruction',
    'របៀបបំពេញ', // Khmer: How to fill
    'ទម្រង់សុំចេញក្រៅ' // Khmer: Duty outside form
  ];

  return helpPatterns.some(pattern => lower.includes(pattern));
}
