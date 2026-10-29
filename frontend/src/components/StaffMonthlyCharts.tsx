import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { 
  BarChart3, 
  PieChart as PieIcon, 
  TrendingUp, 
  Clock, 
  Users, 
  Layers, 
  ChevronDown, 
  ChevronUp,
  Sparkles,
  Info
} from 'lucide-react';
import { StaffMonthlySummary, MonthlyCompanyStats, WORKING_HOURS_LABEL } from '../utils/timeCalculations';
import { DutyOutsideRequest } from '../types';

interface StaffMonthlyChartsProps {
  staffSummaries: StaffMonthlySummary[];
  monthlyStats: MonthlyCompanyStats;
  requests: DutyOutsideRequest[];
  onSelectStaff?: (staff: StaffMonthlySummary) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  bank: '#10b981', // emerald
  gdt: '#3b82f6', // blue
  meet_gdt: '#8b5cf6', // purple
  cfo_tasks: '#f59e0b', // amber
  other: '#64748b' // slate
};

const CATEGORY_LABELS: Record<string, string> = {
  bank: 'Go to Bank',
  gdt: 'Go to GDT',
  meet_gdt: 'Meet GDT',
  cfo_tasks: 'CFO Tasks',
  other: 'Other Duties'
};

export const StaffMonthlyCharts: React.FC<StaffMonthlyChartsProps> = ({
  staffSummaries,
  monthlyStats,
  requests,
  onSelectStaff
}) => {
  const [activeChartTab, setActiveChartTab] = useState<'ranking' | 'breakdown' | 'trend' | 'all'>('ranking');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 1. Staff Hours Ranking Data (sorted descending by hours)
  const staffRankingData = useMemo(() => {
    return [...staffSummaries]
      .sort((a, b) => b.totalHoursDecimal - a.totalHoursDecimal)
      .slice(0, 10)
      .map((s) => ({
        name: s.staffName,
        shortName: s.staffName.split(' ')[0],
        hours: Number(s.totalHoursDecimal.toFixed(2)),
        withinHours: Number((s.withinWorkingMinutes / 60).toFixed(2)),
        besideHours: Number((s.besideWorkingMinutes / 60).toFixed(2)),
        formattedHours: s.formattedTotalDuration,
        formattedWithin: s.formattedWithinWorking,
        formattedBeside: s.formattedBesideWorking,
        duties: s.totalDuties,
        position: s.positions[0] || 'Staff',
        department: s.departments[0] || 'General'
      }));
  }, [staffSummaries]);

  // 2. Reason Category Distribution Data
  const reasonPieData = useMemo(() => {
    const rawDist = (monthlyStats.reasonsDistribution || {}) as Record<
      string,
      { count: number; minutes: number; formattedDuration?: string; label?: string }
    >;
    const totalCompanyMinutes = Math.max(1, monthlyStats.totalCompanyMinutes);

    return Object.entries(rawDist).map(([key, data]) => {
      const hours = Number((data.minutes / 60).toFixed(2));
      const percentage = Math.round((data.minutes / totalCompanyMinutes) * 100);
      return {
        key,
        name: CATEGORY_LABELS[key] || data.label || key,
        value: hours,
        minutes: data.minutes,
        count: data.count,
        percentage,
        color: CATEGORY_COLORS[key] || '#94a3b8'
      };
    }).sort((a, b) => b.value - a.value);
  }, [monthlyStats]);

  // 3. Daily Timeline Trend Data
  const dailyTrendData = useMemo(() => {
    const dayMap = new Map<string, { date: string; displayDate: string; hours: number; duties: number }>();

    requests.forEach((req) => {
      const dateStr = req.date; // e.g. "2026-09-08"
      const dateParts = dateStr.split('-');
      const displayDate = dateParts.length === 3 ? `${dateParts[1]}/${dateParts[2]}` : dateStr;

      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, { date: dateStr, displayDate, hours: 0, duties: 0 });
      }

      const entry = dayMap.get(dateStr)!;
      entry.duties += 1;

      // Calculate approximate hours if departed and returned
      if (req.timeOfDeparture && req.timeOfReturn && req.timeOfReturn !== 'Pending') {
        const [dh, dm] = req.timeOfDeparture.split(':').map(Number);
        const [rh, rm] = req.timeOfReturn.split(':').map(Number);
        if (!isNaN(dh) && !isNaN(rh)) {
          const diffMins = Math.max(0, (rh * 60 + rm) - (dh * 60 + dm));
          entry.hours += Number((diffMins / 60).toFixed(2));
        }
      }
    });

    return Array.from(dayMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        hours: Number(d.hours.toFixed(2))
      }));
  }, [requests]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden w-full min-w-0">
      
      {/* Header with Title and Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center justify-between sm:justify-start space-x-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Staff Hours & Duty Movement Visual Analytics
              </h3>
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                Live Charts
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Interactive graphical comparisons of staff duty hours, reason distributions, and daily trends.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="sm:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            title={isCollapsed ? 'Expand Charts' : 'Collapse Charts'}
          >
            {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs w-full sm:w-auto overflow-x-auto">
            <button
              onClick={() => {
                setActiveChartTab('ranking');
                setIsCollapsed(false);
              }}
              className={`flex-1 sm:flex-none flex items-center justify-center px-2.5 sm:px-3 py-1.5 rounded-lg font-semibold transition-all text-xs whitespace-nowrap ${
                activeChartTab === 'ranking'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 mr-1 text-indigo-500" />
              <span>Staff Ranking</span>
            </button>

            <button
              onClick={() => {
                setActiveChartTab('breakdown');
                setIsCollapsed(false);
              }}
              className={`flex-1 sm:flex-none flex items-center justify-center px-2.5 sm:px-3 py-1.5 rounded-lg font-semibold transition-all text-xs whitespace-nowrap ${
                activeChartTab === 'breakdown'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PieIcon className="w-3.5 h-3.5 mr-1 text-emerald-500" />
              <span>Reason Share</span>
            </button>

            <button
              onClick={() => {
                setActiveChartTab('trend');
                setIsCollapsed(false);
              }}
              className={`flex-1 sm:flex-none flex items-center justify-center px-2.5 sm:px-3 py-1.5 rounded-lg font-semibold transition-all text-xs whitespace-nowrap ${
                activeChartTab === 'trend'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 mr-1 text-amber-500" />
              <span>Daily Trend</span>
            </button>

            <button
              onClick={() => {
                setActiveChartTab('all');
                setIsCollapsed(false);
              }}
              className={`hidden lg:flex items-center justify-center px-3 py-1.5 rounded-lg font-semibold transition-all text-xs whitespace-nowrap ${
                activeChartTab === 'all'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 mr-1 text-slate-500" />
              <span>Grid View</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden sm:inline-flex items-center p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title={isCollapsed ? 'Expand Charts' : 'Collapse Charts'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Chart Canvas Area */}
      {!isCollapsed && (
        <div className="p-4 sm:p-6 space-y-6">

          {/* TAB 1: Staff Ranking Bar Chart */}
          {(activeChartTab === 'ranking' || activeChartTab === 'all') && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center">
                    <Users className="w-4 h-4 mr-1.5 text-indigo-600" />
                    Total Hours Outside Office by Staff Member
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Comparing cumulative time spent out of office for each employee in {monthlyStats.monthDisplay}
                  </p>
                </div>

                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 self-start sm:self-auto">
                  <span className="flex items-center">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-600 mr-1" />
                    Within {WORKING_HOURS_LABEL}
                  </span>
                  <span className="flex items-center">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500 mr-1" />
                    Beside Hours (outside working hours)
                  </span>
                </div>
              </div>

              <div className="h-64 sm:h-72 w-full min-w-0 bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={staffRankingData}
                    margin={{ top: 15, right: 15, left: -10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="shortName" 
                      tick={{ fontSize: 11, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                      unit="h"
                    />
                    <Tooltip
                      cursor={{ fill: '#f1f5f9' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1">
                              <p className="font-bold text-amber-400">{d.name}</p>
                              <p className="text-slate-300 text-[11px]">{d.position}</p>
                              <div className="pt-1.5 border-t border-slate-800 space-y-0.5 text-slate-200">
                                <p className="flex justify-between gap-4">
                                  <span>Total Time Outside:</span>
                                  <strong className="text-white">{d.formattedHours} ({d.hours}h)</strong>
                                </p>
                                <p className="flex justify-between gap-4">
                                  <span className="text-indigo-300">Within working hours:</span>
                                  <strong className="text-indigo-200">{d.formattedWithin} ({d.withinHours}h)</strong>
                                </p>
                                <p className="flex justify-between gap-4">
                                  <span className="text-amber-300">Beside hours:</span>
                                  <strong className="text-amber-200">{d.formattedBeside} ({d.besideHours}h)</strong>
                                </p>
                                <p className="flex justify-between gap-4">
                                  <span>Total Trips:</span>
                                  <strong className="text-white">{d.duties} movements</strong>
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar 
                      dataKey="withinHours"
                      stackId="hours"
                      fill="#4f46e5"
                      radius={[0, 0, 0, 0]}
                      maxBarSize={45}
                      name={`Within ${WORKING_HOURS_LABEL}`}
                    />
                    <Bar 
                      dataKey="besideHours"
                      stackId="hours"
                      fill="#f59e0b"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={45}
                      name="Beside Hours"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TAB 2: Duty Reason Share (Donut / Pie Chart) */}
          {(activeChartTab === 'breakdown' || activeChartTab === 'all') && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center">
                    <PieIcon className="w-4 h-4 mr-1.5 text-emerald-600" />
                    Duty Purpose & Reason Breakdown (Hours & Share)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Distribution of staff time across Banking, GDT taxation, CFO tasks, and other operational duties
                  </p>
                </div>

                <span className="text-[11px] text-slate-500">
                  Total: <strong className="text-slate-800">{monthlyStats.formattedCompanyHours}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                {/* Donut Chart */}
                <div className="h-56 sm:h-64 md:col-span-6 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reasonPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {reasonPieData.map((entry) => (
                          <Cell key={`cell-${entry.key}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-xl border border-slate-800 text-xs">
                                <p className="font-bold flex items-center">
                                  <span className="w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: d.color }} />
                                  {d.name}
                                </p>
                                <p className="text-slate-300 mt-1">
                                  Hours: <strong className="text-white">{d.value} hrs</strong> ({d.percentage}%)
                                </p>
                                <p className="text-slate-400 text-[10px]">
                                  Movement Count: {d.count} requests
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Reason Legend List */}
                <div className="md:col-span-6 space-y-2">
                  {reasonPieData.map((item) => (
                    <div 
                      key={item.key}
                      className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/70 text-xs shadow-2xs"
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <span 
                          className="w-3 h-3 rounded-md shrink-0" 
                          style={{ backgroundColor: item.color }} 
                        />
                        <span className="font-semibold text-slate-800 truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({item.count} {item.count === 1 ? 'trip' : 'trips'})
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="font-bold text-slate-900">
                          {item.value}h
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Daily Trend Area Chart */}
          {(activeChartTab === 'trend' || activeChartTab === 'all') && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1.5 text-amber-600" />
                    Daily Movement Frequency & Outside Duty Hours Trend
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Day-by-day duty loads highlighting peak external duty activity across {monthlyStats.monthDisplay}
                  </p>
                </div>

                <div className="flex items-center space-x-3 text-[11px] text-slate-500">
                  <span className="flex items-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-1" />
                    Hours Outside
                  </span>
                  <span className="flex items-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 mr-1" />
                    Duty Requests
                  </span>
                </div>
              </div>

              <div className="h-64 sm:h-72 w-full min-w-0 bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={dailyTrendData}
                    margin={{ top: 15, right: 15, left: -10, bottom: 20 }}
                  >
                    <defs>
                      <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
                      </linearGradient>
                      <linearGradient id="colorDuties" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="displayDate" 
                      tick={{ fontSize: 11, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1">
                              <p className="font-bold text-amber-400">Date: {d.date}</p>
                              <div className="pt-1.5 border-t border-slate-800 space-y-0.5 text-slate-200">
                                <p className="flex justify-between gap-4">
                                  <span>Total Time Outside:</span>
                                  <strong className="text-amber-300">{d.hours} hrs</strong>
                                </p>
                                <p className="flex justify-between gap-4">
                                  <span>Total Movement Trips:</span>
                                  <strong className="text-indigo-300">{d.duties} trips</strong>
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="hours" 
                      stroke="#f59e0b" 
                      strokeWidth={2.5}
                      fillOpacity={1} 
                      fill="url(#colorHours)" 
                      name="Hours Outside"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="duties" 
                      stroke="#6366f1" 
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      fillOpacity={1} 
                      fill="url(#colorDuties)" 
                      name="Duty Trips"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};
