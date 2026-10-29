import React from 'react';
import { Landmark, Building2, Users, Briefcase, HelpCircle } from 'lucide-react';
import { detectDutyCategory } from '../utils/dutyReasons';

interface DutyReasonBadgeProps {
  reason: string;
  showIcon?: boolean;
  short?: boolean;
  className?: string;
}

export const DutyReasonBadge: React.FC<DutyReasonBadgeProps> = ({
  reason,
  showIcon = true,
  short = false,
  className = ''
}) => {
  const meta = detectDutyCategory(reason);

  const renderIcon = () => {
    switch (meta.id) {
      case 'bank':
        return <Landmark className="w-3 h-3 mr-1 text-emerald-600 shrink-0" />;
      case 'gdt':
        return <Building2 className="w-3 h-3 mr-1 text-blue-600 shrink-0" />;
      case 'meet_gdt':
        return <Users className="w-3 h-3 mr-1 text-purple-600 shrink-0" />;
      case 'cfo_tasks':
        return <Briefcase className="w-3 h-3 mr-1 text-amber-600 shrink-0" />;
      case 'other':
      default:
        return <HelpCircle className="w-3 h-3 mr-1 text-slate-500 shrink-0" />;
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${meta.bgClass} ${meta.textClass} ${meta.borderClass} ${className}`}
      title={`Category: ${meta.label}`}
    >
      {showIcon && renderIcon()}
      <span>{short ? meta.shortLabel : meta.label}</span>
    </span>
  );
};
