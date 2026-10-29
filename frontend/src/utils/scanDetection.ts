import { STANDARD_FINGERPRINT_SCANS } from '../types';

/**
 * Parses time string (e.g. "08:30", "2:00pm", "14:00", "5pm", "17:30") to minutes from midnight (0 - 1439).
 */
export function parseTimeToMinutesOfDay(timeStr: string): number | null {
  if (!timeStr) return null;
  const clean = timeStr.trim().toLowerCase();
  
  // Special keywords
  if (clean.includes('direct to home') || clean.includes('end of work') || clean.includes('end of shift')) {
    return 17 * 60; // 17:00 default for end of day
  }

  const isPM = clean.includes('pm');
  const isAM = clean.includes('am');
  const numericOnly = clean.replace(/[ap]m/, '').trim();
  const parts = numericOnly.split(':');
  
  if (parts.length === 0 || isNaN(parseInt(parts[0], 10))) return null;

  let hours = parseInt(parts[0], 10);
  const minutes = parts.length > 1 ? (parseInt(parts[1], 10) || 0) : 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

export interface AutoDetectedScansResult {
  scans: string[];
  isFullDay: boolean;
  isDirectToHome: boolean;
  explanation: string;
}

/**
 * Intelligently detects which fingerprint scans are missed based on departure time and return time.
 * Standard Scan Windows:
 * 1. Morning In: 08:00 – 08:30 (Minutes 480 – 510)
 * 2. Lunch Out:  12:00 – 12:30 (Minutes 720 – 750)
 * 3. Lunch In:   13:00 – 13:30 (Minutes 780 – 810)
 * 4. Evening Out:17:00 – 17:30 (Minutes 1020 – 1050)
 */
export function autoDetectMissedScans(
  departureTime: string,
  returnTime: string | null,
  isPendingReturn: boolean = false,
  isDirectToHome: boolean = false
): AutoDetectedScansResult {
  const depMinutes = parseTimeToMinutesOfDay(departureTime);

  // If no departure time is entered yet, return empty
  if (depMinutes === null) {
    return {
      scans: [],
      isFullDay: false,
      isDirectToHome: false,
      explanation: ''
    };
  }

  let retMinutes = returnTime ? parseTimeToMinutesOfDay(returnTime) : null;

  // If marked Direct to Home or contains keywords
  const directHome = isDirectToHome || (returnTime ? returnTime.toLowerCase().includes('home') : false);
  if (directHome && retMinutes === null) {
    retMinutes = 17 * 60; // 17:00
  }

  // If pending, assume duty extends at least through midday/afternoon until return
  if (isPendingReturn && retMinutes === null) {
    // If leaving before 12:00, expect at least lunch out/in
    if (depMinutes <= 12 * 60) {
      retMinutes = 14 * 60; // assume at least 14:00
    }
  }

  const effectiveEnd = retMinutes !== null ? retMinutes : depMinutes + 120; // default 2-hour span if undetermined

  const detectedScans: string[] = [];

  // Check 1: Morning In (08:00 - 08:30)
  // If employee leaves at or before 08:30, or was already out offsite at 08:00
  if (depMinutes <= 8 * 60 + 30) {
    detectedScans.push('Morning In (Check-In)');
  }

  // Check 2: Lunch Out (12:00 - 12:30)
  // Employee missed lunch out if departed at/before 12:30 AND was still away after 12:00
  if (depMinutes <= 12 * 60 + 30 && effectiveEnd >= 12 * 60) {
    detectedScans.push('Lunch Out (Check-Out)');
  }

  // Check 3: Lunch In (13:00 - 13:30)
  // Employee missed lunch in if departed at/before 13:00 AND returned after 13:00
  if (depMinutes < 13 * 60 + 30 && effectiveEnd >= 13 * 60) {
    detectedScans.push('Lunch In (Check-In)');
  }

  // Check 4: Evening Out (17:00 - 17:30)
  // Only flagged when a confirmed return time extends past 17:00 or when going Direct to Home.
  // Never inferred from a speculative end time (e.g. unknown/pending return).
  if (directHome || (retMinutes !== null && retMinutes >= 17 * 60)) {
    detectedScans.push('Evening Out (Check-Out)');
  }

  // Full day check: if covers morning in through evening out
  const isFullDay = 
    depMinutes <= 8 * 60 + 30 && 
    (effectiveEnd >= 17 * 60 || directHome) && 
    detectedScans.length >= 4;

  let explanation = '';
  if (isFullDay) {
    explanation = 'Full day off-site duty detected (All 4 scans excused for Odoo)';
  } else if (detectedScans.length > 0) {
    explanation = `Auto-detected ${detectedScans.length} scan window${detectedScans.length > 1 ? 's' : ''} based on your hours`;
  }

  return {
    scans: detectedScans,
    isFullDay,
    isDirectToHome: directHome,
    explanation
  };
}
