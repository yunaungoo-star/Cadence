import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Filter,
  HardDrive,
  Laptop,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { LiveMetricChart } from '@/src/components/LiveMetricChart';
import type { TelemetryThresholds } from '@/src/hooks/useSystemTelemetry';
import { formatBytes, formatTimeClock, formatUptime } from '@/src/lib/formatters';
import { useLanguage } from '@/src/lib/i18n';
import type {
  ActiveTab,
  ClientDeviceInfo,
  DeviceSession,
  SecurityScanReport,
  SyncConnectionState,
  SystemHistoryPoint,
  SystemSnapshot,
  TaskDraft,
  TaskItem,
  ThresholdEvent,
} from '@/src/types/app';

interface LiveDashboardViewProps {
  snapshot: SystemSnapshot | null;
  history: SystemHistoryPoint[];
  streamStatus: 'connecting' | 'live' | 'paused' | 'error';
  isPaused: boolean;
  onTogglePause: () => void;
  onRefreshNow: () => Promise<void>;
  thresholds: TelemetryThresholds;
  onUpdateThresholds?: (next: TelemetryThresholds) => void;
  thresholdEvents: ThresholdEvent[];
  onClearThresholdEvents: () => void;
  clientDevice: ClientDeviceInfo;
  devices: DeviceSession[];
  tasks: TaskItem[];
  securityScans: SecurityScanReport[];
  syncState: SyncConnectionState;
  userSignedIn: boolean;
  onOpenTab: (tab: ActiveTab) => void;
  onCreateRemediationTask: (draft: TaskDraft) => Promise<void>;
}

type CheckState = 'OK' | 'WARN' | 'CRIT';
type ServiceStateFilter = 'ALL' | 'PROBLEMS' | CheckState | 'UNACKED';
type TimeWindowSeconds = 30 | 60 | 180 | 300;
type ServiceSortMode = 'severity' | 'load';

interface MonitoredServiceCheck {
  id: string;
  host: string;
  service: string;
  state: CheckState;
  metricValue: string;
  perfPercent: number;
  detail: string;
  thresholdSummary: string;
  recommendation: string;
  checkedAt: number;
  targetTab: ActiveTab;
}

interface WidgetVisibility {
  verdict: boolean;
  tactical: boolean;
  matrix: boolean;
  charts: boolean;
  services: boolean;
}

const TIME_WINDOWS: Array<{ value: TimeWindowSeconds; label: string }> = [
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 180, label: '3m' },
  { value: 300, label: '5m' },
];

const SEVERITY_ORDER: Record<CheckState, number> = {
  CRIT: 0,
  WARN: 1,
  OK: 2,
};

function computeTrendDelta(values: number[]): { delta: number; direction: 'rising' | 'cooling' | 'steady' } {
  if (values.length < 6) return { delta: 0, direction: 'steady' };
  const recentSlice = values.slice(-5);
  const baselineSlice = values.slice(Math.max(0, values.length - 35), values.length - 5);
  if (baselineSlice.length === 0) return { delta: 0, direction: 'steady' };
  const recentAvg = recentSlice.reduce((sum, v) => sum + v, 0) / recentSlice.length;
  const baselineAvg = baselineSlice.reduce((sum, v) => sum + v, 0) / baselineSlice.length;
  const delta = recentAvg - baselineAvg;
  if (delta >= 1.5) return { delta, direction: 'rising' };
  if (delta <= -1.5) return { delta, direction: 'cooling' };
  return { delta, direction: 'steady' };
}

function stateToneClasses(state: CheckState): {
  text: string;
  bar: string;
  tile: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  if (state === 'CRIT') {
    return {
      text: 'text-red-600 dark:text-red-400',
      bar: 'bg-red-600 dark:bg-red-500',
      tile: 'border-red-200 dark:border-red-800/80 bg-red-50/40 dark:bg-red-950/20 hover:border-red-400 dark:hover:border-red-600',
      Icon: AlertOctagon,
    };
  }
  if (state === 'WARN') {
    return {
      text: 'text-amber-600 dark:text-amber-400',
      bar: 'bg-amber-500 dark:bg-amber-400',
      tile: 'border-amber-200 dark:border-amber-800/80 bg-amber-50/40 dark:bg-amber-950/20 hover:border-amber-400 dark:hover:border-amber-600',
      Icon: AlertTriangle,
    };
  }
  return {
    text: 'text-emerald-600 dark:text-emerald-400',
    bar: 'bg-emerald-600 dark:bg-emerald-500',
    tile: 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-emerald-400 dark:hover:border-emerald-700',
    Icon: CheckCircle2,
  };
}

interface ResourceArcGaugeProps {
  label: string;
  valueText: string;
  percent: number;
  warnThreshold?: number;
  state: CheckState;
  sublabel: string;
  trendLabel: string;
  trendDirection: 'rising' | 'cooling' | 'steady';
  selected?: boolean;
  onClick?: () => void;
}

const ResourceArcGauge: React.FC<ResourceArcGaugeProps> = ({
  label,
  valueText,
  percent,
  warnThreshold,
  state,
  sublabel,
  trendLabel,
  trendDirection,
  selected = false,
  onClick,
}) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 0.72;
  const arcLength = circumference * arcFraction;
  const filledLength = (clamped / 100) * arcLength;
  const strokeColor =
    state === 'CRIT'
      ? 'stroke-red-600 dark:stroke-red-500'
      : state === 'WARN'
        ? 'stroke-amber-500 dark:stroke-amber-400'
        : 'stroke-emerald-600 dark:stroke-emerald-500';
  const textTone =
    state === 'CRIT'
      ? 'text-red-600 dark:text-red-400'
      : state === 'WARN'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-600 dark:text-emerald-400';

  const warnAngleDeg =
    typeof warnThreshold === 'number'
      ? 140 + (Math.max(0, Math.min(100, warnThreshold)) / 100) * 260
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3.5 flex flex-col items-center text-center transition-colors ${
        selected
          ? 'bg-blue-50/50 dark:bg-blue-950/25'
          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/30'
      }`}
    >
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg viewBox="0 0 90 90" className="w-full h-full" aria-hidden="true">
          <circle
            cx="45"
            cy="45"
            r={radius}
            fill="none"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeDasharray={`${arcLength.toFixed(1)} ${circumference.toFixed(1)}`}
            transform="rotate(140 45 45)"
            className="stroke-slate-100 dark:stroke-slate-800"
          />
          <circle
            cx="45"
            cy="45"
            r={radius}
            fill="none"
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeDasharray={`${filledLength.toFixed(1)} ${circumference.toFixed(1)}`}
            transform="rotate(140 45 45)"
            className={`${strokeColor} transition-all duration-300`}
          />
          {warnAngleDeg !== null && (
            <line
              x1="45"
              y1="8"
              x2="45"
              y2="14"
              strokeWidth="1.5"
              transform={`rotate(${warnAngleDeg + 90} 45 45)`}
              className="stroke-amber-500 dark:stroke-amber-400"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
          <span className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 leading-none">
            {valueText}
          </span>
          <span className={`mt-1 text-[10px] font-mono font-semibold ${textTone}`}>{state}</span>
        </div>
      </div>
      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 -mt-1">{label}</div>
      <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-full">
        {sublabel}
      </div>
      <div
        className={`mt-1 inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums ${
          trendDirection === 'rising'
            ? 'text-amber-600 dark:text-amber-400'
            : trendDirection === 'cooling'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {trendDirection === 'rising' ? (
          <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
        ) : trendDirection === 'cooling' ? (
          <ArrowDownRight className="w-3 h-3" aria-hidden="true" />
        ) : (
          <Minus className="w-3 h-3" aria-hidden="true" />
        )}
        <span>{trendLabel}</span>
      </div>
    </button>
  );
};

export const LiveDashboardView: React.FC<LiveDashboardViewProps> = ({
  snapshot,
  history,
  streamStatus,
  isPaused,
  onTogglePause,
  onRefreshNow,
  thresholds,
  onUpdateThresholds,
  thresholdEvents,
  onClearThresholdEvents,
  clientDevice,
  devices,
  tasks,
  securityScans,
  syncState,
  userSignedIn,
  onOpenTab,
  onCreateRemediationTask,
}) => {
  const { t } = useLanguage();
  const [windowSeconds, setWindowSeconds] = useState<TimeWindowSeconds>(60);
  const [stateFilter, setStateFilter] = useState<ServiceStateFilter>('ALL');
  const [hostFilter, setHostFilter] = useState<string>('ALL');
  const [sortMode, setSortMode] = useState<ServiceSortMode>('severity');
  const [searchQuery, setSearchQuery] = useState('');
  const [rechecking, setRechecking] = useState(false);
  const [ackedIds, setAckedIds] = useState<Record<string, boolean>>({});
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [showWidgetMenu, setShowWidgetMenu] = useState(false);
  const [loggedTaskIds, setLoggedTaskIds] = useState<Record<string, boolean>>({});
  const [loggingTaskId, setLoggingTaskId] = useState<string | null>(null);
  const [dismissedVerdictSig, setDismissedVerdictSig] = useState<string | null>(null);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Record<string, boolean>>({});
  const [dismissedThresholdEventIds, setDismissedThresholdEventIds] = useState<Record<string, boolean>>({});
  const [widgets, setWidgets] = useState<WidgetVisibility>({
    verdict: true,
    tactical: true,
    matrix: true,
    charts: true,
    services: true,
  });

  const handleRecheckAll = async () => {
    setRechecking(true);
    try {
      await onRefreshNow();
    } finally {
      window.setTimeout(() => setRechecking(false), 250);
    }
  };

  const toggleAck = (id: string) => {
    setAckedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateTaskFromCheck = async (check: MonitoredServiceCheck) => {
    if (!userSignedIn) return;
    setLoggingTaskId(check.id);
    try {
      await onCreateRemediationTask({
        title: `[${check.state}] ${check.service} on ${check.host}`,
        description: `${check.detail}\n${check.recommendation}\nObserved reading: ${check.metricValue} (${formatTimeClock(check.checkedAt)})`,
        status: 'todo',
        priority: check.state === 'CRIT' ? 'urgent' : 'high',
        category: 'Operations',
        dueDate: '',
      });
      setLoggedTaskIds((prev) => ({ ...prev, [check.id]: true }));
    } finally {
      setLoggingTaskId(null);
    }
  };

  const nowTs = snapshot?.timestamp ?? Date.now();
  const hostName = snapshot?.hostname || 'localhost';

  const cpuPct = snapshot?.cpu.usagePercent ?? 0;
  const memPct = snapshot?.memory.usedPercent ?? 0;
  const loopMean = snapshot?.runtime?.eventLoopMeanMs ?? 0;
  const loopP99 = snapshot?.runtime?.eventLoopP99Ms ?? 0;
  const diskPct = snapshot?.disk?.usedPercent ?? 0;
  const heapUsed = snapshot?.memory.process.heapUsedBytes ?? 0;
  const heapLimit = snapshot?.memory.process.heapLimitBytes ?? 1;
  const heapPct = Math.min(100, (heapUsed / Math.max(1, heapLimit)) * 100);
  const externalInterfaces = (snapshot?.networkInterfaces ?? []).filter((iface) => !iface.internal);

  const cpuState: CheckState = cpuPct >= 92 ? 'CRIT' : cpuPct >= thresholds.cpuWarning ? 'WARN' : 'OK';
  const memState: CheckState = memPct >= 94 ? 'CRIT' : memPct >= thresholds.memWarning ? 'WARN' : 'OK';
  const loopState: CheckState = loopMean >= 80 ? 'CRIT' : loopMean >= 25 ? 'WARN' : 'OK';
  const diskState: CheckState = diskPct >= 92 ? 'CRIT' : diskPct >= 80 ? 'WARN' : 'OK';

  // Live 30s trend velocity calculations from actual history
  const cpuTrend = useMemo(
    () => computeTrendDelta(history.map((h) => h.cpuPercent)),
    [history]
  );
  const memTrend = useMemo(
    () => computeTrendDelta(history.map((h) => h.memPercent)),
    [history]
  );
  const loopTrend = useMemo(
    () => computeTrendDelta(history.map((h) => h.eventLoopMeanMs)),
    [history]
  );

  const formatTrendShort = (trend: { delta: number; direction: 'rising' | 'cooling' | 'steady' }, unit = '%') => {
    if (trend.direction === 'steady') return t.dashboard.trendSteady;
    const sign = trend.delta > 0 ? '+' : '';
    return `${sign}${trend.delta.toFixed(1)}${unit}`;
  };

  const serviceChecks = useMemo<MonitoredServiceCheck[]>(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const activeTasks = tasks.filter((item) => !item.archived && item.status !== 'done');
    const overdueTasks = activeTasks.filter((item) => item.dueDate && item.dueDate < todayIso);
    const latestScan = securityScans[0] ?? null;
    const cpuHeadroom = thresholds.cpuWarning - cpuPct;
    const memHeadroom = thresholds.memWarning - memPct;

    const checks: MonitoredServiceCheck[] = [
      {
        id: 'svc-cpu',
        host: hostName,
        service: 'CPU Utilization',
        state: cpuState,
        metricValue: `${cpuPct.toFixed(1)}%`,
        perfPercent: cpuPct,
        detail: snapshot
          ? `${snapshot.cpu.coreCount} cores · Load ${snapshot.cpu.loadAvg.map((v) => v.toFixed(2)).join(' / ')}`
          : 'Awaiting host sample',
        thresholdSummary: `Warn ${thresholds.cpuWarning}% · Crit 92% · ${
          cpuHeadroom >= 0
            ? `${cpuHeadroom.toFixed(1)}% ${t.dashboard.headroomSuffix}`
            : `${Math.abs(cpuHeadroom).toFixed(1)}% ${t.dashboard.aboveLimitSuffix}`
        }`,
        recommendation:
          cpuState === 'OK'
            ? 'Processor headroom is healthy across active cores.'
            : 'Inspect Per-Core Processor Breakdown in System Monitor or log an investigation task.',
        checkedAt: nowTs,
        targetTab: 'system',
      },
      {
        id: 'svc-mem',
        host: hostName,
        service: 'Memory Allocation',
        state: memState,
        metricValue: `${memPct.toFixed(1)}%`,
        perfPercent: memPct,
        detail: snapshot
          ? `${formatBytes(snapshot.memory.usedBytes)} used of ${formatBytes(snapshot.memory.totalBytes)}`
          : 'Awaiting memory reading',
        thresholdSummary: `Warn ${thresholds.memWarning}% · Crit 94% · ${
          memHeadroom >= 0
            ? `${memHeadroom.toFixed(1)}% ${t.dashboard.headroomSuffix}`
            : `${Math.abs(memHeadroom).toFixed(1)}% ${t.dashboard.aboveLimitSuffix}`
        }`,
        recommendation:
          memState === 'OK'
            ? 'Physical RAM allocation and page cache distribution are balanced.'
            : 'Review Memory Distribution and V8 Heap telemetry for active allocations.',
        checkedAt: nowTs,
        targetTab: 'system',
      },
      {
        id: 'svc-loop',
        host: hostName,
        service: 'Node.js Event Loop',
        state: loopState,
        metricValue: `${loopMean.toFixed(2)} ms`,
        perfPercent: Math.min(100, (loopMean / 80) * 100),
        detail: `Mean ${loopMean.toFixed(2)} ms · P99 ${loopP99.toFixed(2)} ms`,
        thresholdSummary: 'Warn 25.0 ms · Crit 80.0 ms',
        recommendation:
          loopState === 'OK'
            ? 'Server event loop is responsive with minimal blocking latency.'
            : 'Elevated event loop lag detected; inspect synchronous server workloads.',
        checkedAt: nowTs,
        targetTab: 'system',
      },
      {
        id: 'svc-heap',
        host: hostName,
        service: 'V8 Runtime Heap',
        state: heapPct >= 90 ? 'CRIT' : heapPct >= 75 ? 'WARN' : 'OK',
        metricValue: `${formatBytes(heapUsed)}`,
        perfPercent: heapPct,
        detail: `${heapPct.toFixed(1)}% of ${formatBytes(heapLimit)} heap ceiling`,
        thresholdSummary: 'Warn 75% · Crit 90% of V8 ceiling',
        recommendation:
          heapPct < 75
            ? 'Node.js garbage collection and heap utilization remain compact.'
            : 'Heap usage is elevated; monitor process RSS and heap trend in System Monitor.',
        checkedAt: nowTs,
        targetTab: 'system',
      },
      {
        id: 'svc-disk',
        host: hostName,
        service: `Filesystem ${snapshot?.disk?.mount ?? '/'}`,
        state: snapshot?.disk ? diskState : 'OK',
        metricValue: snapshot?.disk ? `${diskPct.toFixed(1)}%` : 'N/A',
        perfPercent: snapshot?.disk ? diskPct : 0,
        detail: snapshot?.disk
          ? `${formatBytes(snapshot.disk.freeBytes)} free · ${formatBytes(snapshot.disk.usedBytes)} used`
          : 'Disk probe unavailable on host',
        thresholdSummary: 'Warn 80% · Crit 92% capacity',
        recommendation:
          !snapshot?.disk || diskState === 'OK'
            ? 'Sufficient disk capacity available on root mount.'
            : 'Free disk capacity is tightening; clean temporary build or log artifacts.',
        checkedAt: nowTs,
        targetTab: 'system',
      },
      {
        id: 'svc-net',
        host: hostName,
        service: 'Network Interfaces',
        state: externalInterfaces.length > 0 ? 'OK' : 'WARN',
        metricValue: `${externalInterfaces.length} active`,
        perfPercent: externalInterfaces.length > 0 ? 100 : 25,
        detail:
          externalInterfaces.length > 0
            ? externalInterfaces.map((n) => `${n.name} (${n.address})`).slice(0, 2).join(', ')
            : 'Loopback interface only',
        thresholdSummary: 'Requires >= 1 non-internal IP interface',
        recommendation:
          externalInterfaces.length > 0
            ? 'Host network adapters are online and reachable.'
            : 'Only loopback interface detected; verify host network routing.',
        checkedAt: nowTs,
        targetTab: 'system',
      },
      {
        id: 'svc-workstation',
        host: clientDevice.deviceName,
        service: 'Workstation Transport',
        state: clientDevice.online ? (streamStatus === 'error' ? 'WARN' : 'OK') : 'CRIT',
        metricValue: clientDevice.online ? 'Online' : 'Offline',
        perfPercent: clientDevice.online ? (streamStatus === 'error' ? 55 : 100) : 0,
        detail: `${clientDevice.browser} on ${clientDevice.platform} · ${clientDevice.cpuCores} threads`,
        thresholdSummary: 'Requires active browser network & SSE telemetry stream',
        recommendation:
          clientDevice.online && streamStatus !== 'error'
            ? 'Local workstation session and live SSE connection are healthy.'
            : 'Verify network connectivity or click Recheck Now to restore live telemetry.',
        checkedAt: nowTs,
        targetTab: 'devices',
      },
      {
        id: 'svc-security',
        host: clientDevice.deviceName,
        service: 'Security Posture',
        state:
          latestScan?.overallStatus === 'at_risk'
            ? 'CRIT'
            : latestScan?.overallStatus === 'attention' || !window.isSecureContext
              ? 'WARN'
              : 'OK',
        metricValue: latestScan
          ? `${latestScan.passedChecks}/${latestScan.totalChecks} pass`
          : window.isSecureContext
            ? 'TLS Active'
            : 'Insecure',
        perfPercent: latestScan
          ? Math.round((latestScan.passedChecks / Math.max(1, latestScan.totalChecks)) * 100)
          : window.isSecureContext
            ? 100
            : 40,
        detail: latestScan
          ? latestScan.summary
          : window.isSecureContext
            ? 'HTTPS transport & WebCrypto verified'
            : 'Run audit scan for full posture report',
        thresholdSummary: latestScan
          ? `${latestScan.passedChecks} passed · ${latestScan.warningChecks} warning · ${latestScan.criticalChecks} critical`
          : 'Requires HTTPS secure context & audit checks',
        recommendation:
          latestScan?.overallStatus === 'at_risk' || latestScan?.overallStatus === 'attention'
            ? 'Open the Security tab to inspect flagged permissions or session hygiene items.'
            : 'Transport security, WebCrypto readiness, and device isolation look clean.',
        checkedAt: latestScan?.createdAt?.getTime() ?? nowTs,
        targetTab: 'security',
      },
      {
        id: 'svc-tasks-sla',
        host: 'Cloud Sync',
        service: 'Task SLA & Replication',
        state: syncState === 'offline' ? 'CRIT' : overdueTasks.length > 0 ? 'WARN' : 'OK',
        metricValue: overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : `${activeTasks.length} active`,
        perfPercent:
          activeTasks.length === 0
            ? 100
            : Math.max(10, Math.round(((activeTasks.length - overdueTasks.length) / activeTasks.length) * 100)),
        detail:
          syncState === 'offline'
            ? 'Offline mode · Local edits queued'
            : overdueTasks.length > 0
              ? `${overdueTasks.length} overdue tasks require attention`
              : `${activeTasks.length} active tasks synchronized cleanly`,
        thresholdSummary: '0 overdue tasks · Real-time Firestore sync',
        recommendation:
          overdueTasks.length > 0
            ? 'Open Tasks and use Schedule Focus to clear or reschedule overdue items.'
            : syncState === 'offline'
              ? 'Connection offline; pending edits will auto-reconcile once reconnected.'
              : 'All synced tasks are on schedule across linked devices.',
        checkedAt: nowTs,
        targetTab: 'tasks',
      },
    ];

    return checks;
  }, [
    clientDevice,
    cpuPct,
    cpuState,
    diskPct,
    diskState,
    externalInterfaces,
    heapLimit,
    heapPct,
    heapUsed,
    hostName,
    loopMean,
    loopP99,
    loopState,
    memPct,
    memState,
    nowTs,
    securityScans,
    snapshot,
    streamStatus,
    syncState,
    t.dashboard.aboveLimitSuffix,
    t.dashboard.headroomSuffix,
    tasks,
    thresholds.cpuWarning,
    thresholds.memWarning,
  ]);

  const sortedMatrixChecks = useMemo(() => {
    return [...serviceChecks].sort((a, b) => SEVERITY_ORDER[a.state] - SEVERITY_ORDER[b.state]);
  }, [serviceChecks]);

  const hostOptions = useMemo(() => {
    const unique = Array.from(new Set(serviceChecks.map((c) => c.host)));
    return unique;
  }, [serviceChecks]);

  const tacticalSummary = useMemo(() => {
    const ok = serviceChecks.filter((c) => c.state === 'OK').length;
    const warn = serviceChecks.filter((c) => c.state === 'WARN').length;
    const crit = serviceChecks.filter((c) => c.state === 'CRIT').length;
    const unacked = serviceChecks.filter((c) => c.state !== 'OK' && !ackedIds[c.id]).length;

    const registeredOtherDevices = devices.filter((d) => d.id !== clientDevice.deviceId);
    const offlineDevices = registeredOtherDevices.filter((d) => !d.isOnline).length + (clientDevice.online ? 0 : 1);
    const hostWarn = cpuState !== 'OK' || memState !== 'OK' ? 1 : 0;
    const totalHosts = 2 + registeredOtherDevices.length;
    const hostsUp = Math.max(0, totalHosts - offlineDevices - hostWarn);

    return {
      totalHosts,
      hostsUp,
      hostWarn,
      offlineDevices,
      totalServices: serviceChecks.length,
      ok,
      warn,
      crit,
      unacked,
    };
  }, [ackedIds, clientDevice, cpuState, devices, memState, serviceChecks]);

  const filteredChecks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = serviceChecks.filter((check) => {
      if (hostFilter !== 'ALL' && check.host !== hostFilter) return false;
      if (stateFilter === 'PROBLEMS' && check.state === 'OK') return false;
      if (stateFilter === 'OK' && check.state !== 'OK') return false;
      if (stateFilter === 'WARN' && check.state !== 'WARN') return false;
      if (stateFilter === 'CRIT' && check.state !== 'CRIT') return false;
      if (stateFilter === 'UNACKED' && (check.state === 'OK' || ackedIds[check.id])) return false;
      if (!q) return true;
      return (
        check.service.toLowerCase().includes(q) ||
        check.host.toLowerCase().includes(q) ||
        check.detail.toLowerCase().includes(q)
      );
    });

    return list.sort((a, b) => {
      if (sortMode === 'load') {
        return b.perfPercent - a.perfPercent;
      }
      const sevDiff = SEVERITY_ORDER[a.state] - SEVERITY_ORDER[b.state];
      if (sevDiff !== 0) return sevDiff;
      return b.perfPercent - a.perfPercent;
    });
  }, [ackedIds, hostFilter, searchQuery, serviceChecks, sortMode, stateFilter]);

  const problemChecks = useMemo(
    () => sortedMatrixChecks.filter((check) => check.state !== 'OK'),
    [sortedMatrixChecks]
  );

  const activeInspectedCheck = useMemo(() => {
    if (selectedCheckId) {
      return serviceChecks.find((c) => c.id === selectedCheckId) ?? null;
    }
    return null;
  }, [selectedCheckId, serviceChecks]);

  const overallVerdict = useMemo(() => {
    const topProblem = problemChecks[0] ?? null;
    if (tacticalSummary.crit > 0 && topProblem) {
      return {
        tone: 'critical' as const,
        title: `${t.dashboard.verdictCritical} · ${tacticalSummary.crit} ${t.dashboard.critCol}`,
        summary: `${topProblem.service} (${topProblem.host}): ${topProblem.detail}`,
        ctaLabel: t.dashboard.inspectBtn,
        ctaAction: () => {
          setSelectedCheckId(topProblem.id);
          setStateFilter('PROBLEMS');
        },
      };
    }
    if (tacticalSummary.warn > 0 && topProblem) {
      return {
        tone: 'warning' as const,
        title: `${t.dashboard.verdictWarning} · ${tacticalSummary.warn} ${t.dashboard.warnCol}`,
        summary: `${topProblem.service} (${topProblem.host}): ${topProblem.detail}`,
        ctaLabel: t.dashboard.inspectBtn,
        ctaAction: () => {
          setSelectedCheckId(topProblem.id);
          setStateFilter('PROBLEMS');
        },
      };
    }
    const cpuHeadroom = Math.max(0, thresholds.cpuWarning - cpuPct);
    return {
      tone: 'nominal' as const,
      title: `${t.dashboard.verdictNominal} · ${tacticalSummary.ok}/${tacticalSummary.totalServices} ${t.dashboard.okCol}`,
      summary: `${t.dashboard.verdictNominalDesc} (${cpuHeadroom.toFixed(0)}% ${t.dashboard.headroomSuffix})`,
      ctaLabel: t.dashboard.openMonitorBtn,
      ctaAction: () => onOpenTab('system'),
    };
  }, [
    cpuPct,
    onOpenTab,
    problemChecks,
    t.dashboard.critCol,
    t.dashboard.headroomSuffix,
    t.dashboard.inspectBtn,
    t.dashboard.okCol,
    t.dashboard.openMonitorBtn,
    t.dashboard.verdictCritical,
    t.dashboard.verdictNominal,
    t.dashboard.verdictNominalDesc,
    t.dashboard.verdictWarning,
    t.dashboard.warnCol,
    tacticalSummary.crit,
    tacticalSummary.ok,
    tacticalSummary.totalServices,
    tacticalSummary.warn,
    thresholds.cpuWarning,
  ]);

  const windowedHistory = useMemo(() => {
    if (history.length === 0) return [];
    const latestTs = history[history.length - 1].timestamp;
    const cutoff = latestTs - windowSeconds * 1000;
    const filtered = history.filter((pt) => pt.timestamp >= cutoff);
    return filtered.length > 0 ? filtered : history.slice(-windowSeconds);
  }, [history, windowSeconds]);

  const cpuSeries = useMemo(
    () => windowedHistory.map((pt) => ({ timestamp: pt.timestamp, value: pt.cpuPercent })),
    [windowedHistory]
  );
  const memSeries = useMemo(
    () => windowedHistory.map((pt) => ({ timestamp: pt.timestamp, value: pt.memPercent })),
    [windowedHistory]
  );

  const streamTone =
    streamStatus === 'live'
      ? 'text-emerald-600 dark:text-emerald-400'
      : streamStatus === 'paused'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  const streamLabel =
    streamStatus === 'live'
      ? t.system.liveStream
      : streamStatus === 'paused'
        ? t.system.streamPaused
        : streamStatus === 'error'
          ? t.system.reconnectingStream
          : t.system.connectingStream;

  return (
    <div className="space-y-5">
      {/* Command Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-display tracking-tight">
            {t.dashboard.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span className={`inline-flex items-center gap-1.5 font-sans font-medium ${streamTone}`}>
              <span
                className={`w-2 h-2 rounded-full ${
                  streamStatus === 'live'
                    ? 'bg-emerald-500'
                    : streamStatus === 'paused'
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                aria-hidden="true"
              />
              {streamLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span>{hostName}</span>
            {snapshot && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {t.dashboard.uptimePrefix} {formatUptime(snapshot.uptimeSeconds)}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {t.dashboard.lastCheckPrefix} {formatTimeClock(snapshot.timestamp)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Live Dashboard Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Chart time range"
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {TIME_WINDOWS.map((win) => (
              <button
                key={win.value}
                type="button"
                onClick={() => setWindowSeconds(win.value)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap ${
                  windowSeconds === win.value
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {win.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setStateFilter((prev) => (prev === 'PROBLEMS' ? 'ALL' : 'PROBLEMS'))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              stateFilter === 'PROBLEMS'
                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{t.dashboard.problemsOnly}</span>
            <span className="font-mono tabular-nums text-[11px]">
              ({tacticalSummary.warn + tacticalSummary.crit})
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleRecheckAll()}
            disabled={rechecking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.985] disabled:opacity-60 rounded-lg transition-all whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rechecking ? 'animate-spin' : ''}`} />
            <span>{rechecking ? t.dashboard.rechecking : t.dashboard.recheckAll}</span>
          </button>

          <button
            type="button"
            onClick={onTogglePause}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              isPaused
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? t.system.resumeStream : t.system.pauseStream}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              aria-expanded={showWidgetMenu}
              onClick={() => setShowWidgetMenu((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                showWidgetMenu
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{t.dashboard.customizeWidgets}</span>
            </button>

            {showWidgetMenu && (
              <div className="cadence-panel-enter absolute right-0 mt-2 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 shadow-lg z-20 space-y-1">
                {(
                  [
                    { key: 'verdict', label: t.dashboard.widgetVerdict },
                    { key: 'tactical', label: t.dashboard.widgetTactical },
                    { key: 'matrix', label: t.dashboard.widgetMatrix },
                    { key: 'charts', label: t.dashboard.widgetCharts },
                    { key: 'services', label: t.dashboard.widgetServices },
                  ] as const
                ).map((item) => {
                  const enabled = widgets[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        if (item.key === 'verdict' && !widgets.verdict) {
                          setDismissedVerdictSig(null);
                        }
                        setWidgets((prev) => ({
                          ...prev,
                          [item.key]: !prev[item.key],
                        }));
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <span>{item.label}</span>
                      {enabled && (item.key !== 'verdict' || dismissedVerdictSig !== `${overallVerdict.tone}:${overallVerdict.title}`) ? (
                        <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 0. Smart Operational Verdict Strip */}
      {widgets.verdict && dismissedVerdictSig !== `${overallVerdict.tone}:${overallVerdict.title}` && (
        <section
          aria-label={t.dashboard.widgetVerdict}
          className={`bg-white dark:bg-slate-900 border rounded-xl px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${
            overallVerdict.tone === 'critical'
              ? 'border-red-300 dark:border-red-800/80'
              : overallVerdict.tone === 'warning'
                ? 'border-amber-300 dark:border-amber-800/80'
                : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-start gap-3 min-w-0">
            {overallVerdict.tone === 'critical' ? (
              <AlertOctagon className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            ) : overallVerdict.tone === 'warning' ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                {overallVerdict.title}
              </div>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{overallVerdict.summary}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span>
                  CPU {formatTrendShort(cpuTrend)} ({t.dashboard.vsAvg30s})
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  RAM {formatTrendShort(memTrend)} ({t.dashboard.vsAvg30s})
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Loop {loopMean.toFixed(1)}ms
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={overallVerdict.ctaAction}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span>{overallVerdict.ctaLabel}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDismissedVerdictSig(`${overallVerdict.tone}:${overallVerdict.title}`)}
              aria-label="Close notification"
              title="Close notification"
              className="p-2 min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* 1. Checkmk Tactical Overview Matrix */}
      {widgets.tactical && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Tactical Host Overview */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-display">
                  {t.dashboard.tacticalHostsTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onOpenTab('devices')}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>{t.dashboard.openDevicesBtn}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800">
              <button
                type="button"
                onClick={() => {
                  setHostFilter('ALL');
                  setStateFilter('ALL');
                }}
                className="p-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{t.dashboard.totalCol}</div>
                <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {tacticalSummary.totalHosts}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStateFilter('OK')}
                className="p-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {t.dashboard.upCol}
                </div>
                <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {tacticalSummary.hostsUp}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStateFilter('WARN')}
                className="p-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  {t.dashboard.warnCol}
                </div>
                <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  {tacticalSummary.hostWarn}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onOpenTab('devices')}
                className="p-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {t.dashboard.offlineCol}
                </div>
                <div
                  className={`mt-1 text-xl font-semibold font-mono tabular-nums ${
                    tacticalSummary.offlineDevices > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {tacticalSummary.offlineDevices}
                </div>
              </button>
            </div>
          </section>

          {/* Tactical Service Overview */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-display">
                  {t.dashboard.tacticalServicesTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onOpenTab('system')}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <span>{t.dashboard.openMonitorBtn}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-5 divide-x divide-slate-100 dark:divide-slate-800">
              {(
                [
                  {
                    filter: 'ALL',
                    label: t.dashboard.totalCol,
                    count: tacticalSummary.totalServices,
                    tone: 'text-slate-900 dark:text-slate-100',
                    labelTone: 'text-slate-500 dark:text-slate-400',
                  },
                  {
                    filter: 'OK',
                    label: t.dashboard.okCol,
                    count: tacticalSummary.ok,
                    tone: 'text-emerald-600 dark:text-emerald-400',
                    labelTone: 'text-emerald-600 dark:text-emerald-400',
                  },
                  {
                    filter: 'WARN',
                    label: t.dashboard.warnCol,
                    count: tacticalSummary.warn,
                    tone: 'text-amber-600 dark:text-amber-400',
                    labelTone: 'text-amber-600 dark:text-amber-400',
                  },
                  {
                    filter: 'CRIT',
                    label: t.dashboard.critCol,
                    count: tacticalSummary.crit,
                    tone: 'text-red-600 dark:text-red-400',
                    labelTone: 'text-red-600 dark:text-red-400',
                  },
                  {
                    filter: 'UNACKED',
                    label: t.dashboard.unackedCol,
                    count: tacticalSummary.unacked,
                    tone:
                      tacticalSummary.unacked > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-900 dark:text-slate-100',
                    labelTone: 'text-slate-500 dark:text-slate-400',
                  },
                ] as const
              ).map((cell) => {
                const active = stateFilter === cell.filter;
                return (
                  <button
                    key={cell.filter}
                    type="button"
                    onClick={() =>
                      setStateFilter((prev) =>
                        prev === cell.filter && cell.filter !== 'ALL' ? 'ALL' : cell.filter
                      )
                    }
                    className={`p-3.5 text-left transition-colors ${
                      active
                        ? 'bg-blue-50/60 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className={`text-[11px] font-medium truncate ${cell.labelTone}`}>{cell.label}</div>
                    <div className={`mt-1 text-xl font-semibold font-mono tabular-nums ${cell.tone}`}>
                      {cell.count}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* 2. Host & Service State Matrix + SVG Radial Gauges */}
      {widgets.matrix && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Checkmk-style Service State Grid (sorted CRIT -> WARN -> OK) */}
          <section className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                  {t.dashboard.stateMatrixTitle}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t.dashboard.stateMatrixDesc}
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                {tacticalSummary.ok}/{tacticalSummary.totalServices} {t.dashboard.okCol}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {sortedMatrixChecks.map((check) => {
                const style = stateToneClasses(check.state);
                const StateIcon = style.Icon;
                const isSelected = selectedCheckId === check.id;
                return (
                  <button
                    key={check.id}
                    type="button"
                    onClick={() =>
                      setSelectedCheckId((prev) => (prev === check.id ? null : check.id))
                    }
                    className={`text-left border rounded-lg p-3 transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.99] ${
                      isSelected
                        ? 'border-blue-600 dark:border-blue-400 bg-blue-50/40 dark:bg-blue-950/25'
                        : style.tile
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold ${style.text}`}>
                        <StateIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{check.state}</span>
                      </span>
                      <span className="text-xs font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 truncate">
                        {check.metricValue}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {check.service}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {check.host}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Real-Time Resource Arc Gauges + Quick Alert Guards */}
          <section className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                  {t.dashboard.gaugesTitle}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t.dashboard.gaugesDesc}
                </p>
              </div>
              {snapshot && (
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                  {snapshot.activeTelemetryClients} {t.dashboard.clientsOnlineSuffix}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800 flex-1 items-stretch">
              <ResourceArcGauge
                label={t.dashboard.cpuGaugeLabel}
                valueText={`${cpuPct.toFixed(0)}%`}
                percent={cpuPct}
                warnThreshold={thresholds.cpuWarning}
                state={cpuState}
                sublabel={snapshot ? `${snapshot.cpu.coreCount} cores` : '—'}
                trendLabel={formatTrendShort(cpuTrend, '%')}
                trendDirection={cpuTrend.direction}
                selected={selectedCheckId === 'svc-cpu'}
                onClick={() => setSelectedCheckId((prev) => (prev === 'svc-cpu' ? null : 'svc-cpu'))}
              />
              <ResourceArcGauge
                label={t.dashboard.memGaugeLabel}
                valueText={`${memPct.toFixed(0)}%`}
                percent={memPct}
                warnThreshold={thresholds.memWarning}
                state={memState}
                sublabel={snapshot ? formatBytes(snapshot.memory.usedBytes) : '—'}
                trendLabel={formatTrendShort(memTrend, '%')}
                trendDirection={memTrend.direction}
                selected={selectedCheckId === 'svc-mem'}
                onClick={() => setSelectedCheckId((prev) => (prev === 'svc-mem' ? null : 'svc-mem'))}
              />
              <ResourceArcGauge
                label={t.dashboard.loopGaugeLabel}
                valueText={`${loopMean.toFixed(1)}ms`}
                percent={Math.min(100, (loopMean / 80) * 100)}
                warnThreshold={31}
                state={loopState}
                sublabel={`P99 ${loopP99.toFixed(1)}ms`}
                trendLabel={formatTrendShort(loopTrend, 'ms')}
                trendDirection={loopTrend.direction}
                selected={selectedCheckId === 'svc-loop'}
                onClick={() => setSelectedCheckId((prev) => (prev === 'svc-loop' ? null : 'svc-loop'))}
              />
              <ResourceArcGauge
                label={t.dashboard.diskGaugeLabel}
                valueText={snapshot?.disk ? `${diskPct.toFixed(0)}%` : 'N/A'}
                percent={snapshot?.disk ? diskPct : 0}
                warnThreshold={80}
                state={snapshot?.disk ? diskState : 'OK'}
                sublabel={snapshot?.disk ? formatBytes(snapshot.disk.freeBytes) : '—'}
                trendLabel={snapshot?.disk ? `${(100 - diskPct).toFixed(0)}% free` : '—'}
                trendDirection="steady"
                selected={selectedCheckId === 'svc-disk'}
                onClick={() => setSelectedCheckId((prev) => (prev === 'svc-disk' ? null : 'svc-disk'))}
              />
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              {onUpdateThresholds ? (
                <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
                  <span className="font-sans font-medium text-slate-600 dark:text-slate-300">
                    {t.dashboard.alertLimitsQuick}:
                  </span>
                  <label className="inline-flex items-center gap-1.5">
                    <span>CPU</span>
                    <input
                      type="number"
                      min={20}
                      max={95}
                      value={thresholds.cpuWarning}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) {
                          onUpdateThresholds({
                            ...thresholds,
                            cpuWarning: Math.min(95, Math.max(20, val)),
                          });
                        }
                      }}
                      className="w-12 px-1.5 py-0.5 text-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <span>%</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <span>RAM</span>
                    <input
                      type="number"
                      min={20}
                      max={95}
                      value={thresholds.memWarning}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) {
                          onUpdateThresholds({
                            ...thresholds,
                            memWarning: Math.min(95, Math.max(20, val)),
                          });
                        }
                      }}
                      className="w-12 px-1.5 py-0.5 text-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <span>%</span>
                  </label>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 font-mono tabular-nums">
                  <Cpu className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span>{snapshot?.cpu.model || clientDevice.platform}</span>
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => onOpenTab('security')}
                  className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{t.dashboard.openSecurityBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenTab('system')}
                  className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>{t.dashboard.openMonitorBtn}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Contextual Smart Check Diagnostics Panel */}
      {activeInspectedCheck && (
        <section
          aria-label={t.dashboard.inspectorTitle}
          className="cadence-panel-enter bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800/80 rounded-xl p-5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-blue-600 dark:text-blue-400">{t.dashboard.inspectorTitle}</span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                <span className={`font-mono font-semibold ${stateToneClasses(activeInspectedCheck.state).text}`}>
                  {activeInspectedCheck.state}
                </span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                <span className="font-mono text-slate-500 dark:text-slate-400">{activeInspectedCheck.host}</span>
              </div>
              <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                {activeInspectedCheck.service} —{' '}
                <span className="font-mono tabular-nums">{activeInspectedCheck.metricValue}</span>
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {activeInspectedCheck.state !== 'OK' && (
                <button
                  type="button"
                  onClick={() => toggleAck(activeInspectedCheck.id)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                    ackedIds[activeInspectedCheck.id]
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {ackedIds[activeInspectedCheck.id] ? t.dashboard.acknowledgedTag : t.dashboard.acknowledgeBtn}
                  </span>
                </button>
              )}

              {userSignedIn && (
                <button
                  type="button"
                  disabled={loggingTaskId === activeInspectedCheck.id || Boolean(loggedTaskIds[activeInspectedCheck.id])}
                  onClick={() => void handleCreateTaskFromCheck(activeInspectedCheck)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{loggedTaskIds[activeInspectedCheck.id] ? t.devices.saved : t.dashboard.createTaskBtn}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenTab(activeInspectedCheck.targetTab)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <span>{t.dashboard.openDetailTab}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setSelectedCheckId(null)}
                aria-label="Close diagnostics"
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <div className="text-slate-500 dark:text-slate-400 mb-0.5">{t.dashboard.colDetail}</div>
              <div className="text-slate-900 dark:text-slate-100">{activeInspectedCheck.detail}</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400 mb-0.5">{t.dashboard.thresholdLabel}</div>
              <div className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {activeInspectedCheck.thresholdSummary}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400 mb-0.5">{t.dashboard.recommendationLabel}</div>
              <div className="text-slate-900 dark:text-slate-100">{activeInspectedCheck.recommendation}</div>
            </div>
          </div>
        </section>
      )}

      {/* 3. Live Multi-Chart Telemetry Strip */}
      {widgets.charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <LiveMetricChart
            title={t.dashboard.cpuChartTitle}
            subtitle={snapshot ? `${snapshot.cpu.coreCount} cores · ${hostName}` : hostName}
            currentValue={cpuPct}
            unit="%"
            valueDecimals={1}
            maxValue={100}
            points={cpuSeries}
            threshold={thresholds.cpuWarning}
            accentColor="#2563EB"
            statusLabel={
              cpuState === 'CRIT'
                ? t.system.critical
                : cpuState === 'WARN'
                  ? t.system.elevated
                  : t.system.nominal
            }
            statusTone={cpuState === 'CRIT' ? 'critical' : cpuState === 'WARN' ? 'elevated' : 'nominal'}
          />

          <LiveMetricChart
            title={t.dashboard.memChartTitle}
            subtitle={
              snapshot
                ? `${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(snapshot.memory.totalBytes)}`
                : hostName
            }
            currentValue={memPct}
            unit="%"
            valueDecimals={1}
            maxValue={100}
            points={memSeries}
            threshold={thresholds.memWarning}
            accentColor="#059669"
            statusLabel={
              memState === 'CRIT'
                ? t.system.critical
                : memState === 'WARN'
                  ? t.system.elevated
                  : t.system.nominal
            }
            statusTone={memState === 'CRIT' ? 'critical' : memState === 'WARN' ? 'elevated' : 'nominal'}
          />
        </div>
      )}

      {/* 4. Monitored Services Table + Checkmk Event Console */}
      {widgets.services && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Service Checks Table */}
          <section className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                    {t.dashboard.servicesTableTitle}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t.dashboard.servicesTableDesc}
                  </p>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.dashboard.searchChecksPlaceholder}
                    aria-label={t.dashboard.searchChecksPlaceholder}
                    className="w-full pl-8 pr-3 py-1.5 min-h-[36px] text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label="Filter by host"
                  className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <button
                    type="button"
                    onClick={() => setHostFilter('ALL')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      hostFilter === 'ALL'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {t.dashboard.allHostsFilter}
                  </button>
                  {hostOptions.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHostFilter(h)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap max-w-[140px] truncate ${
                        hostFilter === h
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Sort service checks"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as ServiceSortMode)}
                  className="px-2.5 py-1.5 text-[11px] font-medium bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="severity">{t.dashboard.smartSortSeverity}</option>
                  <option value="load">{t.dashboard.smartSortLoad}</option>
                </select>
              </div>
            </div>

            {filteredChecks.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                <p>{t.dashboard.noMatchingChecks}</p>
                <button
                  type="button"
                  onClick={() => {
                    setStateFilter('ALL');
                    setHostFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="mt-2 font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t.dashboard.allStates}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                      <th className="py-2.5 pl-4 pr-2 whitespace-nowrap">{t.dashboard.colState}</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">{t.dashboard.colService}</th>
                      <th className="py-2.5 px-2 hidden sm:table-cell">{t.dashboard.colDetail}</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">{t.dashboard.colMeter}</th>
                      <th className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap">{t.dashboard.colAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {filteredChecks.map((check) => {
                      const style = stateToneClasses(check.state);
                      const StateIcon = style.Icon;
                      const isAcked = Boolean(ackedIds[check.id]);
                      const isSelected = selectedCheckId === check.id;

                      return (
                        <tr
                          key={check.id}
                          onClick={() => setSelectedCheckId((prev) => (prev === check.id ? null : check.id))}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50/50 dark:bg-blue-950/25'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/30'
                          }`}
                        >
                          <td className="py-2.5 pl-4 pr-2 whitespace-nowrap align-top">
                            <span className={`inline-flex items-center gap-1 font-mono font-semibold ${style.text}`}>
                              <StateIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>{check.state}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-2 align-top">
                            <div className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {check.service}
                              {isAcked && (
                                <span className="ml-1.5 text-[11px] font-mono text-blue-600 dark:text-blue-400">
                                  · {t.dashboard.ackedLabel}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[150px]">
                              {check.host}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-slate-600 dark:text-slate-300 hidden sm:table-cell align-top">
                            <div className="line-clamp-2 max-w-xs">{check.detail}</div>
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap align-top">
                            <div className="w-24">
                              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-200 mb-1">
                                <span>{check.metricValue}</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${style.bar}`}
                                  style={{ width: `${Math.max(4, Math.min(100, check.perfPercent))}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td
                            className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1.5">
                              {check.state !== 'OK' && (
                                <button
                                  type="button"
                                  onClick={() => toggleAck(check.id)}
                                  className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                                    isAcked
                                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {isAcked ? t.dashboard.ackedLabel : t.dashboard.ackBtn}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onOpenTab(check.targetTab)}
                                className="px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {t.dashboard.inspectBtn}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Event Console & Alerts */}
          <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                  {t.dashboard.eventConsoleTitle}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t.dashboard.eventConsoleDesc}
                </p>
              </div>
              {thresholdEvents.length > 0 && (
                <button
                  type="button"
                  onClick={onClearThresholdEvents}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.system.clearBtn}</span>
                </button>
              )}
            </div>

            {problemChecks.filter((c) => !dismissedAlertIds[c.id]).length === 0 &&
            thresholdEvents.filter((e) => !dismissedThresholdEventIds[e.id]).length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle2
                  className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2"
                  aria-hidden="true"
                />
                <p className="text-xs text-slate-600 dark:text-slate-300">{t.dashboard.noActiveEvents}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[380px] overflow-y-auto">
                {problemChecks
                  .filter((c) => !dismissedAlertIds[c.id])
                  .map((check) => {
                    const style = stateToneClasses(check.state);
                    const StateIcon = style.Icon;
                    const isAcked = Boolean(ackedIds[check.id]);
                    const isLogged = Boolean(loggedTaskIds[check.id]);

                    return (
                      <li key={`evt-${check.id}`} className="px-5 py-3.5 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs">
                              <StateIcon className={`w-3.5 h-3.5 shrink-0 ${style.text}`} aria-hidden="true" />
                              <span className={`font-mono font-semibold ${style.text}`}>{check.state}</span>
                              <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                                {check.service}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{check.detail}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-mono tabular-nums text-slate-400">
                              {formatTimeClock(check.checkedAt)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setDismissedAlertIds((prev) => ({ ...prev, [check.id]: true }))}
                              aria-label={`Close ${check.service} notification`}
                              title="Close notification"
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => toggleAck(check.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border rounded-md transition-colors ${
                              isAcked
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            <span>{isAcked ? t.dashboard.acknowledgedTag : t.dashboard.acknowledgeBtn}</span>
                          </button>

                          {userSignedIn && (
                            <button
                              type="button"
                              disabled={loggingTaskId === check.id || isLogged}
                              onClick={() => void handleCreateTaskFromCheck(check)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 rounded-md transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              <span>{isLogged ? t.devices.saved : t.dashboard.createTaskBtn}</span>
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}

                {thresholdEvents
                  .filter((e) => !dismissedThresholdEventIds[e.id])
                  .map((evt) => (
                    <li key={evt.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`font-mono font-semibold shrink-0 ${
                            evt.level === 'warning'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {evt.level === 'warning' ? 'WARN' : 'OK'}
                        </span>
                        <span className="text-slate-700 dark:text-slate-200 truncate">
                          {evt.metric} {evt.value.toFixed(1)}% (limit {evt.threshold}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono tabular-nums text-[11px] text-slate-400">
                          {formatTimeClock(evt.timestamp)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDismissedThresholdEventIds((prev) => ({ ...prev, [evt.id]: true }))
                          }
                          aria-label="Close notification"
                          title="Close notification"
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 truncate">
                <Laptop className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{clientDevice.deviceName}</span>
              </span>
              <span className="font-mono tabular-nums shrink-0">
                {tacticalSummary.hostsUp}/{tacticalSummary.totalHosts} {t.dashboard.upCol}
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
