import { Landmark, Building2, Users, Briefcase, HelpCircle } from 'lucide-react';

export interface DutyCategoryMeta {
  id: 'bank' | 'gdt' | 'meet_gdt' | 'cfo_tasks' | 'other';
  label: string;
  shortLabel: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  iconName: string;
}

export const DUTY_CATEGORIES: Record<string, DutyCategoryMeta> = {
  bank: {
    id: 'bank',
    label: 'Go to bank',
    shortLabel: 'Bank',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-800',
    borderClass: 'border-emerald-200',
    iconName: 'Landmark'
  },
  meet_gdt: {
    id: 'meet_gdt',
    label: 'Go to meet GDT',
    shortLabel: 'Meet GDT',
    bgClass: 'bg-purple-50',
    textClass: 'text-purple-800',
    borderClass: 'border-purple-200',
    iconName: 'Users'
  },
  gdt: {
    id: 'gdt',
    label: 'Go to GDT',
    shortLabel: 'GDT',
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-800',
    borderClass: 'border-blue-200',
    iconName: 'Building2'
  },
  cfo_tasks: {
    id: 'cfo_tasks',
    label: 'Doing CFO tasks',
    shortLabel: 'CFO Tasks',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-800',
    borderClass: 'border-amber-200',
    iconName: 'Briefcase'
  },
  other: {
    id: 'other',
    label: 'Other',
    shortLabel: 'Other Reason',
    bgClass: 'bg-slate-50',
    textClass: 'text-slate-800',
    borderClass: 'border-slate-200',
    iconName: 'HelpCircle'
  }
};

export function detectDutyCategory(reasonText: string): DutyCategoryMeta {
  const lower = (reasonText || '').toLowerCase();
  
  if (lower.includes('meet gdt') || lower.includes('meeting with gdt') || lower.includes('meet tax') || lower.includes('meeting gdt')) {
    return DUTY_CATEGORIES.meet_gdt;
  }
  if (lower.includes('bank') || lower.includes('cheque') || lower.includes('deposit')) {
    return DUTY_CATEGORIES.bank;
  }
  if (lower.includes('gdt') || lower.includes('taxation') || lower.includes('tax department')) {
    return DUTY_CATEGORIES.gdt;
  }
  if (lower.includes('cfo') || lower.includes('chief financial')) {
    return DUTY_CATEGORIES.cfo_tasks;
  }
  return DUTY_CATEGORIES.other;
}
