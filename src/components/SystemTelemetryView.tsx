import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  Network,
  Pause,
  Play,
  Server,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { LiveMetricChart } from '@/src/components/LiveMetricChart';
import { formatBytes, formatTimeClock, formatUptime } from '@/src/lib/formatters';
import { useLanguage, type TranslationSet } from '@/src/lib/i18n';
import type {
  ClientDeviceInfo,
  SystemHistoryPoint,
  SystemSnapshot,
  ThresholdEvent,
} from '@/src/types/app';
import type { TelemetryThresholds } from '@/src/hooks/useSystemTelemetry';

interface SystemTelemetryViewProps {
  snapshot: SystemSnapshot | null;
  history: SystemHistoryPoint[];
  streamStatus: 'connecting' | 'live' | 'paused' | 'error';
  isPaused: boolean;
  onTogglePause: () => void;
  thresholds: TelemetryThresholds;
  onUpdateThresholds: (next: TelemetryThresholds) => void;
  thresholdEvents: ThresholdEvent[];
  onClearThresholdEvents: () => void;
  clientDevice: ClientDeviceInfo;
}

type TimeWindowSeconds = 30 | 60 | 180 | 300;
type RuntimeChartMode = 'eventLoop' | 'heap' | 'load';
type CoreSortMode = 'index' | 'load';

const TIME_WINDOWS: Array<{ value: TimeWindowSeconds; label: string }> = [
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 180, label: '3m' },
  { value: 300, label: '5m' },
];

function getMetricStatus(
  value: number,
  warnThreshold: number,
  critThreshold: number,
  t: TranslationSet
): {
  label: string;
  tone: 'nominal' | 'elevated' | 'critical';
} {
  if (value >= critThreshold) return { label: t.system.critical, tone: 'critical' };
  if (value >= warnThreshold) return { label: t.system.elevated, tone: 'elevated' };
  return { label: t.system.nominal, tone: 'nominal' };
}

export const SystemTelemetryView: React.FC<SystemTelemetryViewProps> = ({
  snapshot,
  history,
  streamStatus,
  isPaused,
  onTogglePause,
  thresholds,
  onUpdateThresholds,
  thresholdEvents,
  onClearThresholdEvents,
  clientDevice,
}) => {
  const { t } = useLanguage();
  const [windowSeconds, setWindowSeconds] = useState<TimeWindowSeconds>(60);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeChartMode>('eventLoop');
  const [coreSort, setCoreSort] = useState<CoreSortMode>('index');

  const cpuPct = snapshot?.cpu.usagePercent ?? 0;
  const memPct = snapshot?.memory.usedPercent ?? 0;
  const elMeanMs = snapshot?.runtime?.eventLoopMeanMs ?? 0;
  const elP99Ms = snapshot?.runtime?.eventLoopP99Ms ?? 0;
  const elMaxMs = snapshot?.runtime?.eventLoopMaxMs ?? 0;
  const heapUsedMB = snapshot ? Number((snapshot.memory.process.heapUsedBytes / (1024 * 1024)).toFixed(1)) : 0;
  const load1m = snapshot?.cpu.loadAvg[0] ?? 0;

  const cpuStatus = getMetricStatus(cpuPct, thresholds.cpuWarning, 92, t);
  const memStatus = getMetricStatus(memPct, thresholds.memWarning, 94, t);
  const eventLoopStatus = getMetricStatus(elMeanMs, 25, 80, t);
  const loadStatus = getMetricStatus(load1m, Math.max(1, (snapshot?.cpu.coreCount ?? 2) * 0.85), Math.max(2, (snapshot?.cpu.coreCount ?? 2) * 1.5), t);

  const windowedHistory = useMemo(() => {
    if (history.length === 0) return [];
    const latestTs = history[history.length - 1].timestamp;
    const cutoff = latestTs - windowSeconds * 1000;
    const filtered = history.filter((pt) => pt.timestamp >= cutoff);
    return filtered.length > 0 ? filtered : history.slice(-windowSeconds);
  }, [history, windowSeconds]);

  const windowLabel = TIME_WINDOWS.find((w) => w.value === windowSeconds)?.label ?? `${windowSeconds}s`;

  const cpuSeries = useMemo(
    () => windowedHistory.map((h) => ({ timestamp: h.timestamp, value: h.cpuPercent })),
    [windowedHistory]
  );
  const memSeries = useMemo(
    () => windowedHistory.map((h) => ({ timestamp: h.timestamp, value: h.memPercent })),
    [windowedHistory]
  );

  const runtimeSeries = useMemo(() => {
    if (runtimeMode === 'eventLoop') {
      return windowedHistory.map((h) => ({ timestamp: h.timestamp, value: h.eventLoopMeanMs }));
    }
    if (runtimeMode === 'heap') {
      return windowedHistory.map((h) => ({ timestamp: h.timestamp, value: h.heapUsedMB }));
    }
    return windowedHistory.map((h) => ({ timestamp: h.timestamp, value: h.load1m }));
  }, [windowedHistory, runtimeMode]);

  const sortedCores = useMemo(() => {
    if (!snapshot) return [];
    const copy = [...snapshot.cpu.cores];
    if (coreSort === 'load') {
      copy.sort((a, b) => b.usagePercent - a.usagePercent || a.core - b.core);
    } else {
      copy.sort((a, b) => a.core - b.core);
    }
    return copy;
  }, [snapshot, coreSort]);

  const peakCoreIndex = useMemo(() => {
    if (!snapshot || snapshot.cpu.cores.length === 0) return null;
    let best = snapshot.cpu.cores[0];
    for (const core of snapshot.cpu.cores) {
      if (core.usagePercent > best.usagePercent) best = core;
    }
    return best.usagePercent > 0 ? best.core : null;
  }, [snapshot]);

  const memorySegments = useMemo(() => {
    if (!snapshot || snapshot.memory.totalBytes <= 0) {
      return {
        totalBytes: 0,
        activeBytes: 0,
        cacheBytes: 0,
        freeBytes: 0,
        activePct: 0,
        cachePct: 0,
        freePct: 0,
      };
    }
    const totalBytes = snapshot.memory.totalBytes;
    const activeBytes = Math.min(totalBytes, Math.max(0, snapshot.memory.usedBytes));
    const cacheBytes = Math.min(
      Math.max(0, totalBytes - activeBytes),
      Math.max(0, snapshot.memory.cachedBytes)
    );
    const freeBytes = Math.max(0, totalBytes - activeBytes - cacheBytes);
    return {
      totalBytes,
      activeBytes,
      cacheBytes,
      freeBytes,
      activePct: (activeBytes / totalBytes) * 100,
      cachePct: (cacheBytes / totalBytes) * 100,
      freePct: (freeBytes / totalBytes) * 100,
    };
  }, [snapshot]);

  const handleExportSnapshot = () => {
    if (!snapshot) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      windowSeconds,
      snapshot,
      history: windowedHistory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cadence-telemetry-${snapshot.hostname}-${snapshot.timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const streamText =
    streamStatus === 'live'
      ? t.system.liveStream
      : streamStatus === 'paused'
        ? t.system.streamPaused
        : streamStatus === 'error'
          ? t.system.reconnectingStream
          : t.system.connectingStream;

  const runtimeChartConfig =
    runtimeMode === 'eventLoop'
      ? {
          title: 'Node.js Event Loop Latency',
          subtitle: `Mean event loop turn delay across ${windowLabel} window`,
          currentValue: elMeanMs,
          unit: 'ms',
          valueDecimals: 2,
          accentColor: '#7c3aed',
          statusLabel: eventLoopStatus.label,
          statusTone: eventLoopStatus.tone,
        }
      : runtimeMode === 'heap'
        ? {
            title: 'V8 Heap Allocation Trend',
            subtitle: `Active server JS heap usage across ${windowLabel} window`,
            currentValue: heapUsedMB,
            unit: 'MB',
            valueDecimals: 1,
            accentColor: '#0891b2',
            statusLabel: snapshot
              ? `${((snapshot.memory.process.heapUsedBytes / Math.max(1, snapshot.memory.process.heapLimitBytes)) * 100).toFixed(1)}%`
              : t.system.nominal,
            statusTone: 'nominal' as const,
          }
        : {
            title: 'Host 1-Minute Load Average',
            subtitle: `Runnable thread queue depth across ${windowLabel} window`,
            currentValue: load1m,
            unit: '',
            valueDecimals: 2,
            accentColor: '#d97706',
            statusLabel: loadStatus.label,
            statusTone: loadStatus.tone,
          };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-display tracking-tight">
            {t.system.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
              {streamStatus === 'live' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
              )}
              {streamText}
            </span>
            {snapshot && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{snapshot.hostname}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">
                  {snapshot.platform} {snapshot.arch}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">PID {snapshot.pid}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {snapshot.activeTelemetryClients} active {snapshot.activeTelemetryClients === 1 ? 'viewer' : 'viewers'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Time window selector */}
          <div
            role="group"
            aria-label="Telemetry time window"
            className="inline-flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1"
          >
            {TIME_WINDOWS.map((win) => {
              const active = windowSeconds === win.value;
              return (
                <button
                  key={win.value}
                  type="button"
                  onClick={() => setWindowSeconds(win.value)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {win.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleExportSnapshot}
            disabled={!snapshot}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            {t.system.exportJson}
          </button>

          <button
            type="button"
            onClick={onTogglePause}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isPaused ? t.system.resumeStream : t.system.pauseStream}
          </button>
        </div>
      </div>

      {/* Alert Banner when thresholds exceeded */}
      {snapshot && (cpuPct >= thresholds.cpuWarning || memPct >= thresholds.memWarning) && (
        <div
          role="status"
          className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-xl text-sm text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Threshold alert:{' '}
              {cpuPct >= thresholds.cpuWarning && `CPU at ${cpuPct.toFixed(1)}% (limit ${thresholds.cpuWarning}%)`}
              {cpuPct >= thresholds.cpuWarning && memPct >= thresholds.memWarning && ' · '}
              {memPct >= thresholds.memWarning && `Memory at ${memPct.toFixed(1)}% (limit ${thresholds.memWarning}%)`}
            </span>
          </div>
        </div>
      )}

      {/* 4-Column Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{t.system.cpuUtilization}</span>
            <Cpu className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {snapshot ? `${cpuPct.toFixed(1)}%` : '--'}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span
              className={
                cpuStatus.tone === 'critical'
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : cpuStatus.tone === 'elevated'
                    ? 'text-amber-600 dark:text-amber-400 font-medium'
                    : 'text-emerald-600 dark:text-emerald-400 font-medium'
              }
            >
              {cpuStatus.label}
            </span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {snapshot
                ? `${snapshot.cpu.userPercent.toFixed(1)}% usr · ${snapshot.cpu.sysPercent.toFixed(1)}% sys`
                : '--'}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{t.system.systemMemory}</span>
            <HardDrive className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {snapshot ? `${memPct.toFixed(1)}%` : '--'}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs gap-2">
            <span
              className={
                memStatus.tone === 'critical'
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : memStatus.tone === 'elevated'
                    ? 'text-amber-600 dark:text-amber-400 font-medium'
                    : 'text-emerald-600 dark:text-emerald-400 font-medium'
              }
            >
              {memStatus.label}
            </span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              {snapshot
                ? `${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(snapshot.memory.totalBytes)}`
                : '--'}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{t.system.eventLoopLag}</span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {snapshot ? `${elMeanMs.toFixed(2)} ms` : '--'}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs gap-2">
            <span
              className={
                eventLoopStatus.tone === 'critical'
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : eventLoopStatus.tone === 'elevated'
                    ? 'text-amber-600 dark:text-amber-400 font-medium'
                    : 'text-emerald-600 dark:text-emerald-400 font-medium'
              }
            >
              {eventLoopStatus.label}
            </span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
              {snapshot ? `p99 ${elP99Ms.toFixed(1)}ms · max ${elMaxMs.toFixed(1)}ms` : '--'}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{t.system.loadAvgUptime}</span>
            <Server className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 truncate">
            {snapshot
              ? `${snapshot.cpu.loadAvg[0].toFixed(2)} · ${snapshot.cpu.loadAvg[1].toFixed(2)} · ${snapshot.cpu.loadAvg[2].toFixed(2)}`
              : '--'}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs gap-2 text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>{snapshot ? `Host ${formatUptime(snapshot.uptimeSeconds)}` : '--'}</span>
            <span>{snapshot ? `Node ${formatUptime(snapshot.processUptimeSeconds)}` : '--'}</span>
          </div>
        </div>
      </div>

      {/* Host Physical Memory Proportional Allocation Bar */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              {t.system.memoryDistributionTitle}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t.system.memoryDistributionDesc}
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
            {snapshot
              ? `${formatBytes(snapshot.memory.availableBytes)} available of ${formatBytes(snapshot.memory.totalBytes)}`
              : '--'}
          </div>
        </div>

        <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
          <div
            className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
            style={{ width: `${memorySegments.activePct}%` }}
            title={`Active Used: ${formatBytes(memorySegments.activeBytes)}`}
          />
          <div
            className="h-full bg-sky-500 dark:bg-sky-400 transition-all duration-300"
            style={{ width: `${memorySegments.cachePct}%` }}
            title={`Page Cache & Buffers: ${formatBytes(memorySegments.cacheBytes)}`}
          />
          <div
            className="h-full bg-slate-200 dark:bg-slate-700 transition-all duration-300"
            style={{ width: `${memorySegments.freePct}%` }}
            title={`Unallocated Free: ${formatBytes(memorySegments.freeBytes)}`}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-500 shrink-0" />
            Active Used: <strong className="text-slate-900 dark:text-slate-100">{formatBytes(memorySegments.activeBytes)}</strong> ({memorySegments.activePct.toFixed(1)}%)
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 dark:bg-sky-400 shrink-0" />
            Cache &amp; Buffers: <strong className="text-slate-900 dark:text-slate-100">{formatBytes(memorySegments.cacheBytes)}</strong> ({memorySegments.cachePct.toFixed(1)}%)
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-700 shrink-0" />
            Unallocated Free: <strong className="text-slate-900 dark:text-slate-100">{formatBytes(memorySegments.freeBytes)}</strong> ({memorySegments.freePct.toFixed(1)}%)
          </span>
        </div>
      </section>

      {/* Primary Live Time-Series Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiveMetricChart
          title={t.system.cpuUtilization}
          subtitle={`Aggregate processor load across all logical cores (${windowLabel} window)`}
          currentValue={cpuPct}
          points={cpuSeries}
          threshold={thresholds.cpuWarning}
          accentColor="#2563eb"
          statusLabel={cpuStatus.label}
          statusTone={cpuStatus.tone}
        />

        <LiveMetricChart
          title={t.system.memoryAllocationTitle}
          subtitle={`Active physical memory consumption vs total host capacity (${windowLabel} window)`}
          currentValue={memPct}
          points={memSeries}
          threshold={thresholds.memWarning}
          accentColor="#059669"
          statusLabel={memStatus.label}
          statusTone={memStatus.tone}
        />
      </div>

      {/* Runtime & V8 Heap Chart + Alert Thresholds & Live Event Log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LiveMetricChart
            title={runtimeChartConfig.title}
            subtitle={runtimeChartConfig.subtitle}
            currentValue={runtimeChartConfig.currentValue}
            unit={runtimeChartConfig.unit}
            valueDecimals={runtimeChartConfig.valueDecimals}
            maxValue="auto"
            points={runtimeSeries}
            accentColor={runtimeChartConfig.accentColor}
            statusLabel={runtimeChartConfig.statusLabel}
            statusTone={runtimeChartConfig.statusTone}
            headerActions={
              <div
                role="group"
                aria-label="Runtime telemetry metric"
                className="inline-flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-lg p-0.5"
              >
                {(
                  [
                    { id: 'eventLoop', label: 'Event Loop (ms)' },
                    { id: 'heap', label: 'V8 Heap (MB)' },
                    { id: 'load', label: '1m Load Avg' },
                  ] as const
                ).map((mode) => {
                  const active = runtimeMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setRuntimeMode(mode.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            }
          />
        </div>

        {/* Alert Thresholds & Live Crossing Log */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SlidersHorizontal className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                {t.system.alertThresholdsTitle}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {t.system.alertThresholdsDesc}
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="cpu-threshold-range" className="font-medium text-slate-700 dark:text-slate-300">
                    {t.system.cpuWarningLimit}
                  </label>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {thresholds.cpuWarning}%
                  </span>
                </div>
                <input
                  id="cpu-threshold-range"
                  type="range"
                  min={25}
                  max={95}
                  step={5}
                  value={thresholds.cpuWarning}
                  onChange={(e) =>
                    onUpdateThresholds({ ...thresholds, cpuWarning: Number(e.target.value) })
                  }
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="mem-threshold-range" className="font-medium text-slate-700 dark:text-slate-300">
                    {t.system.memWarningLimit}
                  </label>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {thresholds.memWarning}%
                  </span>
                </div>
                <input
                  id="mem-threshold-range"
                  type="range"
                  min={30}
                  max={95}
                  step={5}
                  value={thresholds.memWarning}
                  onChange={(e) =>
                    onUpdateThresholds({ ...thresholds, memWarning: Number(e.target.value) })
                  }
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.system.recentCrossings}
              </span>
              {thresholdEvents.length > 0 && (
                <button
                  type="button"
                  onClick={onClearThresholdEvents}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <Trash2 className="w-3 h-3" />
                  {t.system.clearBtn}
                </button>
              )}
            </div>

            {thresholdEvents.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>{t.system.noCrossings}</span>
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {thresholdEvents.slice(0, 6).map((evt) => (
                  <li
                    key={evt.id}
                    className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span
                        className={
                          evt.level === 'warning'
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        }
                      >
                        {evt.level === 'warning' ? 'WARN' : 'OK'}
                      </span>
                      <span className="truncate">
                        {evt.metric} {evt.value.toFixed(1)}% (limit {evt.threshold}%)
                      </span>
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 shrink-0">
                      {formatTimeClock(evt.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Per-Core CPU Utilization + Storage & Network */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                {t.system.perCoreTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {snapshot
                  ? snapshot.cpu.model && snapshot.cpu.model.toLowerCase() !== 'unknown'
                    ? snapshot.cpu.model
                    : `Virtual Processor (${snapshot.arch})`
                  : 'Detecting processor architecture...'}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-blue-600 dark:bg-blue-500" />
                  User
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-amber-500 dark:bg-amber-400" />
                  System
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCoreSort((prev) => (prev === 'index' ? 'load' : 'index'))}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap"
              >
                <ArrowDownUp className="w-3 h-3" />
                {coreSort === 'index' ? t.system.sortByPeak : t.system.sortByCore}
              </button>
            </div>
          </div>

          {!snapshot ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {sortedCores.map((core) => {
                const userW = Math.min(100, Math.max(0, core.userPercent));
                const sysW = Math.min(Math.max(0, 100 - userW), Math.max(0, core.sysPercent));
                const isPeak = peakCoreIndex === core.core && sortedCores.length > 1;
                return (
                  <div key={core.core}>
                    <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                      <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <span>Core {core.core}</span>
                        {core.speedMHz > 0 && (
                          <span className="text-slate-400 dark:text-slate-500">{core.speedMHz} MHz</span>
                        )}
                        {isPeak && (
                          <span className="text-[10px] font-sans font-medium px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                            Peak
                          </span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        <span className="text-slate-500 dark:text-slate-400 mr-2 text-[11px]">
                          {core.userPercent.toFixed(0)}u/{core.sysPercent.toFixed(0)}s
                        </span>
                        <strong className="font-semibold">{core.usagePercent.toFixed(1)}%</strong>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                      <div
                        className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
                        style={{ width: `${userW}%` }}
                      />
                      <div
                        className="h-full bg-amber-500 dark:bg-amber-400 transition-all duration-300"
                        style={{ width: `${sysW}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Storage & Network Interfaces */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Network className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                {t.system.storageNetworkTitle}
              </h2>
            </div>

            {snapshot?.disk ? (
              <div className="pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Root Filesystem ({snapshot.disk.mount})
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {snapshot.disk.usedPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      snapshot.disk.usedPercent >= 90
                        ? 'bg-red-600 dark:bg-red-500'
                        : snapshot.disk.usedPercent >= 75
                          ? 'bg-amber-500'
                          : 'bg-emerald-600 dark:bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, snapshot.disk.usedPercent))}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>Used {formatBytes(snapshot.disk.usedBytes)}</span>
                  <span>Free {formatBytes(snapshot.disk.freeBytes)}</span>
                </div>
              </div>
            ) : (
              <div className="pb-4 mb-4 border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                Root filesystem metrics unavailable in current runtime.
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Active Interfaces
              </div>
              {snapshot && snapshot.networkInterfaces.length > 0 ? (
                <ul className="space-y-2 text-xs">
                  {snapshot.networkInterfaces.map((iface, idx) => (
                    <li
                      key={`${iface.name}-${iface.address}-${idx}`}
                      className="flex items-center justify-between gap-2 font-mono tabular-nums"
                    >
                      <span className="text-slate-600 dark:text-slate-400 truncate">
                        {iface.name}{' '}
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          ({iface.internal ? 'loopback' : iface.family})
                        </span>
                      </span>
                      <span className="text-slate-900 dark:text-slate-100 shrink-0">{iface.address}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">No active network interfaces reported.</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Memory/V8 Breakdown & Client vs Server Specs Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              {t.system.v8HeapTitle}
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">Server RSS / Heap Used</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {snapshot
                  ? `${formatBytes(snapshot.memory.process.rssBytes)} / ${formatBytes(snapshot.memory.process.heapUsedBytes)}`
                  : '--'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">V8 Heap Allocated / Limit</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {snapshot
                  ? `${formatBytes(snapshot.memory.process.heapTotalBytes)} / ${formatBytes(snapshot.memory.process.heapLimitBytes)}`
                  : '--'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">External / ArrayBuffers</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {snapshot
                  ? `${formatBytes(snapshot.memory.process.externalBytes)} / ${formatBytes(snapshot.memory.process.arrayBuffersBytes)}`
                  : '--'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">Context Switches (vol / invol)</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {snapshot
                  ? `${snapshot.runtime.voluntaryContextSwitches.toLocaleString()} / ${snapshot.runtime.involuntaryContextSwitches.toLocaleString()}`
                  : '--'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">Event Loop Delay (mean / p99 / max)</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {snapshot
                  ? `${snapshot.runtime.eventLoopMeanMs.toFixed(2)} / ${snapshot.runtime.eventLoopP99Ms.toFixed(2)} / ${snapshot.runtime.eventLoopMaxMs.toFixed(2)} ms`
                  : '--'}
              </span>
            </div>
            {snapshot?.memory.cgroupLimitBytes !== null && snapshot?.memory.cgroupLimitBytes !== undefined && (
              <div className="px-5 py-3 flex items-center justify-between gap-4">
                <span className="text-slate-600 dark:text-slate-400">Container Memory Limit (cgroup)</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {snapshot.memory.cgroupUsedBytes !== null
                    ? `${formatBytes(snapshot.memory.cgroupUsedBytes)} / ${formatBytes(snapshot.memory.cgroupLimitBytes)}`
                    : formatBytes(snapshot.memory.cgroupLimitBytes)}
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              {t.system.hostEnvTitle}
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">Server OS &amp; Kernel</span>
              <span className="font-mono text-slate-900 dark:text-slate-100 truncate">
                {snapshot ? `${snapshot.platform} ${snapshot.release} (${snapshot.arch})` : '--'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">Node.js Runtime &amp; PID</span>
              <span className="font-mono text-slate-900 dark:text-slate-100">
                {snapshot ? `${snapshot.nodeVersion} · PID ${snapshot.pid}` : '--'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">This Client Device</span>
              <span className="text-slate-900 dark:text-slate-100 truncate">
                {clientDevice.deviceName} · {clientDevice.browser} on {clientDevice.platform}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">Client Logical Cores / RAM</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {clientDevice.cpuCores > 0 ? `${clientDevice.cpuCores} cores` : 'Unavailable'} ·{' '}
                {clientDevice.memoryGB > 0 ? `${clientDevice.memoryGB} GB` : 'Undisclosed'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">Browser JS Heap</span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {clientDevice.jsHeapUsedBytes !== null && clientDevice.jsHeapLimitBytes !== null
                  ? `${formatBytes(clientDevice.jsHeapUsedBytes)} / ${formatBytes(clientDevice.jsHeapLimitBytes)}`
                  : 'Not exposed by browser'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
