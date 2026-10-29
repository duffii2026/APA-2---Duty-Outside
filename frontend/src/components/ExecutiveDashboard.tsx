import React from 'react';
import {
  Activity, ArrowRight, BellRing, CalendarDays, CheckCircle2, Clock3,
  FileText, Fingerprint, Plus, Send, ShieldCheck, Users, UserCog,
} from 'lucide-react';
import type { DutyOutsideRequest } from '../types';

type ExecutiveRole = 'hr' | 'manager' | 'admin';

interface ExecutiveDashboardProps {
  userName: string;
  role: ExecutiveRole;
  requests: DutyOutsideRequest[];
  onOpenRegister: () => void;
  onOpenAnalytics: () => void;
  onOpenAccounts: () => void;
  onOpenTelegram: () => void;
  onNewRequest: () => void;
  onMarkReturn: (request: DutyOutsideRequest) => void;
  onViewRequest: (request: DutyOutsideRequest) => void;
}

const ROLE_COPY: Record<ExecutiveRole, { title: string; description: string; focus: string }> = {
  hr: {
    title: 'People & attendance overview',
    description: 'Review staff movements, return updates, and monthly duty hours.',
    focus: 'HR WORKSPACE',
  },
  manager: {
    title: 'Duty operations overview',
    description: 'Keep today’s external duties moving and close outstanding return records.',
    focus: 'MANAGER WORKSPACE',
  },
  admin: {
    title: 'APA 2 - Duty Outside control center',
    description: 'Monitor activity and manage portal accounts and system integrations.',
    focus: 'ADMIN WORKSPACE',
  },
};

const todayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const metricCard = (label: string, value: number, detail: string, icon: React.ReactNode, tone: string) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}>{icon}</div>
    </div>
  </div>
);

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  userName, role, requests, onOpenRegister, onOpenAnalytics, onOpenAccounts,
  onOpenTelegram, onNewRequest, onMarkReturn, onViewRequest,
}) => {
  const copy = ROLE_COPY[role];
  const active = requests.filter((request) => request.status === 'active');
  const incomplete = requests.filter((request) => request.status === 'incomplete');
  const returnedToday = requests.filter((request) => request.status === 'returned' && request.date === todayString());
  const openScans = requests.filter((request) => request.status !== 'returned' && request.missedFingerprintScans?.length);
  const recent = [...requests].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);

  const actions = role === 'admin'
    ? [
        { label: 'Manage staff accounts', detail: 'Create, reset, or deactivate portal logins', icon: <UserCog className="w-4 h-4" />, onClick: onOpenAccounts, tone: 'text-emerald-700 bg-emerald-50' },
        { label: 'Telegram integration', detail: 'Review bot connection and notification settings', icon: <Send className="w-4 h-4" />, onClick: onOpenTelegram, tone: 'text-sky-700 bg-sky-50' },
        { label: 'Monthly staff analytics', detail: 'Review duty hours, trips, and scan records', icon: <Users className="w-4 h-4" />, onClick: onOpenAnalytics, tone: 'text-indigo-700 bg-indigo-50' },
      ]
    : role === 'hr'
      ? [
          { label: 'Review monthly hours', detail: 'Open staff duty and attendance summaries', icon: <CalendarDays className="w-4 h-4" />, onClick: onOpenAnalytics, tone: 'text-indigo-700 bg-indigo-50' },
          { label: 'Manage staff accounts', detail: 'Provision or update staff portal logins', icon: <UserCog className="w-4 h-4" />, onClick: onOpenAccounts, tone: 'text-emerald-700 bg-emerald-50' },
          { label: 'Open movement register', detail: 'Search and review duty outside records', icon: <FileText className="w-4 h-4" />, onClick: onOpenRegister, tone: 'text-amber-700 bg-amber-50' },
        ]
      : [
          { label: 'Open movement register', detail: 'Review current external duties and records', icon: <FileText className="w-4 h-4" />, onClick: onOpenRegister, tone: 'text-amber-700 bg-amber-50' },
          { label: 'Review scan exceptions', detail: 'Check records with missed fingerprint scans', icon: <Fingerprint className="w-4 h-4" />, onClick: onOpenRegister, tone: 'text-rose-700 bg-rose-50' },
          { label: 'Monthly staff analytics', detail: 'Review hours and duty patterns by staff', icon: <Users className="w-4 h-4" />, onClick: onOpenAnalytics, tone: 'text-indigo-700 bg-indigo-50' },
        ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-5 sm:p-7">
        <div className="absolute -right-12 -top-20 w-64 h-64 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-amber-300">
              <ShieldCheck className="w-3 h-3" /> {copy.focus}
            </span>
            <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight">{copy.title}</h1>
            <p className="mt-1 text-sm text-slate-300">{copy.description}</p>
            <p className="mt-4 text-xs text-slate-400">Welcome, <span className="font-semibold text-white">{userName}</span></p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button onClick={onOpenRegister} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-sm font-semibold transition-colors">
              <FileText className="w-4 h-4" /> Movement register
            </button>
            <button onClick={onNewRequest} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-bold transition-colors">
              <Plus className="w-4 h-4" /> New submission
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {metricCard('Currently outside', active.length, 'Active duty records', <Activity className="w-5 h-5" />, 'bg-amber-50 text-amber-700')}
        {metricCard('Needs return update', incomplete.length, 'Outstanding same-day records', <BellRing className="w-5 h-5" />, incomplete.length ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500')}
        {metricCard('Returned today', returnedToday.length, 'Completed duty records', <CheckCircle2 className="w-5 h-5" />, 'bg-emerald-50 text-emerald-700')}
        {metricCard('Scan exceptions', openScans.length, 'Open records with missed scans', <Fingerprint className="w-5 h-5" />, 'bg-indigo-50 text-indigo-700')}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <section className="xl:col-span-3 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent duty activity</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Latest submissions and return updates</p>
            </div>
            <button onClick={onOpenRegister} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900">View register <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
          {recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No duty records to show yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((request) => (
                <li key={request.id}>
                  <button onClick={() => onViewRequest(request)} className="w-full text-left flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{request.requesterName} <span className="font-normal text-slate-500">· {request.reasonOrPurpose}</span></p>
                      <p className="mt-1 text-[10px] text-slate-500">{request.id} · {request.date} · {request.timeOfDeparture}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold capitalize ${request.status === 'active' ? 'bg-amber-50 text-amber-700' : request.status === 'incomplete' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {request.status === 'active' ? <Clock3 className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}{request.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="xl:col-span-2 space-y-3">
          {incomplete.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <div className="flex items-start gap-2.5">
                <BellRing className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xs font-bold text-rose-950">Return updates need attention</h2>
                  <p className="mt-1 text-[11px] text-rose-800">{incomplete.length} record{incomplete.length === 1 ? '' : 's'} still need a return time.</p>
                  <button onClick={() => onMarkReturn(incomplete[0])} className="mt-3 text-[11px] font-bold text-rose-800 underline underline-offset-2">Update next return</button>
                </div>
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Role shortcuts</h2>
            <div className="space-y-1.5">
              {actions.map((action) => (
                <button key={action.label} onClick={action.onClick} className="w-full flex items-center gap-3 rounded-xl p-2.5 text-left hover:bg-slate-50 transition-colors">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${action.tone}`}>{action.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-800">{action.label}</span>
                    <span className="block mt-0.5 text-[10px] text-slate-500">{action.detail}</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
