import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  Cpu,
  HardDrive,
  Laptop,
  MemoryStick,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type { TelemetryThresholds } from '@/src/hooks/useSystemTelemetry';
import { formatBytes, formatUptime } from '@/src/lib/formatters';
import type { ClientDeviceInfo, SystemSnapshot, TaskDraft } from '@/src/types/app';

interface HardwareToolsPanelProps {
  snapshot: SystemSnapshot | null;
  streamStatus: 'connecting' | 'live' | 'paused' | 'error';
  isPaused: boolean;
  thresholds: TelemetryThresholds;
  clientDevice: ClientDeviceInfo;
  onTogglePause: () => void;
  onUpdateThresholds: (next: TelemetryThresholds) => void;
  onCreateTask: (draft: TaskDraft) => Promise<void>;
  onOpenSystemMonitor?: () => void;
  onClose: () => void;
}

interface LocalStorageStats {
  quotaUsageBytes: number | null;
  quotaTotalBytes: number | null;
  draftCount: number;
  draftBytes: number;
}

function readLocalDraftStats(): { draftCount: number; draftBytes: number } {
  let draftCount = 0;
  let draftBytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('cadence_task_draft_')) continue;
      draftCount++;
      const val = localStorage.getItem(key) ?? '';
      draftBytes += (key.length + val.length) * 2;
    }
  } catch {
    // ignore storage access errors
  }
  return { draftCount, draftBytes };
}

function getTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const HardwareToolsPanel: React.FC<HardwareToolsPanelProps> = ({
  snapshot,
  streamStatus,
  isPaused,
  thresholds,
  clientDevice,
  onTogglePause,
  onUpdateThresholds,
  onCreateTask,
  onOpenSystemMonitor,
  onClose,
}) => {
  const [storageStats, setStorageStats] = useState<LocalStorageStats>(() => ({
    quotaUsageBytes: null,
    quotaTotalBytes: null,
    ...readLocalDraftStats(),
  }));
  const [busyTemplate, setBusyTemplate] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [copiedSnapshot, setCopiedSnapshot] = useState(false);

  const refreshStorageStats = useCallback(async () => {
    const localDrafts = readLocalDraftStats();
    let quotaUsageBytes: number | null = null;
    let quotaTotalBytes: number | null = null;
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        quotaUsageBytes = typeof est.usage === 'number' ? est.usage : null;
        quotaTotalBytes = typeof est.quota === 'number' ? est.quota : null;
      }
    } catch {
      // ignore storage estimate errors
    }
    setStorageStats({
      quotaUsageBytes,
      quotaTotalBytes,
      ...localDrafts,
    });
  }, []);

  useEffect(() => {
    void refreshStorageStats();
  }, [refreshStorageStats]);

  const cpuPct = snapshot?.cpu.usagePercent ?? null;
  const memPct = snapshot?.memory.usedPercent ?? null;
  const cpuWarn = cpuPct !== null && cpuPct >= thresholds.cpuWarning;
  const memWarn = memPct !== null && memPct >= thresholds.memWarning;

  const displaySpec = useMemo(() => {
    if (typeof window === 'undefined') return 'Standard display';
    const dpr = window.devicePixelRatio ? `${window.devicePixelRatio.toFixed(1).replace(/\.0$/, '')}x` : '1x';
    return `${window.screen.width}×${window.screen.height} @ ${dpr}`;
  }, []);

  const showTemporaryNotice = (message: string) => {
    setActionNotice(message);
    window.setTimeout(() => {
      setActionNotice((curr) => (curr === message ? null : curr));
    }, 4000);
  };

  const handleClearCachedDrafts = () => {
    let removed = 0;
    try {
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cadence_task_draft_')) {
          keysToDelete.push(key);
        }
      }
      for (const k of keysToDelete) {
        localStorage.removeItem(k);
        removed++;
      }
    } catch {
      // ignore storage errors
    }
    void refreshStorageStats();
    showTemporaryNotice(
      removed > 0 ? `Cleared ${removed} cached local task ${removed === 1 ? 'draft' : 'drafts'}.` : 'No cached drafts to clear.'
    );
  };

  const handleCopyDiagnostic = async () => {
    const lines = [
      `Cadence Hardware Snapshot (${new Date().toISOString()})`,
      `Host: ${snapshot ? `${snapshot.hostname} (${snapshot.platform}/${snapshot.arch}, Node ${snapshot.nodeVersion})` : 'Connecting...'}`,
      snapshot
        ? `Host CPU: ${snapshot.cpu.usagePercent.toFixed(1)}% across ${snapshot.cpu.coreCount} cores · Load ${snapshot.cpu.loadAvg.map((n) => n.toFixed(2)).join(' / ')} · Event loop p99 ${snapshot.runtime.eventLoopP99Ms.toFixed(2)} ms`
        : 'Host CPU: Unavailable',
      snapshot
        ? `Host Memory: ${snapshot.memory.usedPercent.toFixed(1)}% (${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(snapshot.memory.totalBytes)}) · RSS ${formatBytes(snapshot.memory.process.rssBytes)}`
        : 'Host Memory: Unavailable',
      snapshot?.disk
        ? `Host Disk (${snapshot.disk.mount}): ${snapshot.disk.usedPercent.toFixed(1)}% used (${formatBytes(snapshot.disk.freeBytes)} free)`
        : 'Host Disk: Unavailable',
      `Client Workstation: ${clientDevice.deviceName} · ${clientDevice.platform} · ${clientDevice.browser} · ${clientDevice.cpuCores} logical cores · ${clientDevice.memoryGB > 0 ? `${clientDevice.memoryGB} GB RAM` : 'RAM undisclosed'} · Screen ${displaySpec}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSnapshot(true);
      window.setTimeout(() => setCopiedSnapshot(false), 2500);
    } catch {
      showTemporaryNotice('Clipboard write blocked by browser permissions.');
    }
  };

  const createHardwareTask = async (
    templateId: string,
    draft: TaskDraft,
    confirmationText: string
  ) => {
    setBusyTemplate(templateId);
    try {
      await onCreateTask(draft);
      showTemporaryNotice(confirmationText);
    } finally {
      setBusyTemplate(null);
    }
  };

  const todayIso = getTodayIso();

  const handleCreateCpuTask = () => {
    const cpuLabel = snapshot ? `${snapshot.cpu.usagePercent.toFixed(1)}%` : 'live';
    const loadLabel = snapshot ? snapshot.cpu.loadAvg[0].toFixed(2) : 'n/a';
    const desc = snapshot
      ? [
          `Host: ${snapshot.hostname} (${snapshot.platform}/${snapshot.arch})`,
          `CPU Usage: ${snapshot.cpu.usagePercent.toFixed(1)}% (User ${snapshot.cpu.userPercent.toFixed(1)}% · Sys ${snapshot.cpu.sysPercent.toFixed(1)}%) across ${snapshot.cpu.coreCount} cores`,
          `Load Avg (1m/5m/15m): ${snapshot.cpu.loadAvg.map((v) => v.toFixed(2)).join(' / ')}`,
          `Event Loop Latency: mean ${snapshot.runtime.eventLoopMeanMs.toFixed(2)} ms · p99 ${snapshot.runtime.eventLoopP99Ms.toFixed(2)} ms`,
          `Configured Alert Threshold: ${thresholds.cpuWarning}%`,
        ].join('\n')
      : 'Review host CPU utilization and load average spikes.';

    void createHardwareTask(
      'cpu',
      {
        title: `Investigate CPU & load (${cpuLabel} · load ${loadLabel})`,
        description: desc,
        status: 'todo',
        priority: cpuWarn ? 'urgent' : 'high',
        category: 'Operations',
        dueDate: todayIso,
      },
      'Logged CPU investigation task in Operations.'
    );
  };

  const handleCreateMemoryTask = () => {
    const memLabel = snapshot ? `${snapshot.memory.usedPercent.toFixed(1)}%` : 'live';
    const desc = snapshot
      ? [
          `Host RAM: ${snapshot.memory.usedPercent.toFixed(1)}% used (${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(snapshot.memory.totalBytes)})`,
          `Available RAM: ${formatBytes(snapshot.memory.availableBytes)} · Cached: ${formatBytes(snapshot.memory.cachedBytes)}`,
          `Node Process RSS: ${formatBytes(snapshot.memory.process.rssBytes)} · V8 Heap: ${formatBytes(snapshot.memory.process.heapUsedBytes)} / ${formatBytes(snapshot.memory.process.heapTotalBytes)}`,
          clientDevice.jsHeapUsedBytes !== null
            ? `Browser JS Heap: ${formatBytes(clientDevice.jsHeapUsedBytes)}${clientDevice.jsHeapLimitBytes ? ` / ${formatBytes(clientDevice.jsHeapLimitBytes)}` : ''}`
            : 'Browser JS Heap: Not exposed by current browser',
          `Configured Memory Threshold: ${thresholds.memWarning}%`,
        ].join('\n')
      : 'Audit host RAM, Node heap, and browser memory consumption.';

    void createHardwareTask(
      'memory',
      {
        title: `Audit system memory & heap (${memLabel} used)`,
        description: desc,
        status: 'todo',
        priority: memWarn ? 'urgent' : 'high',
        category: 'Engineering',
        dueDate: todayIso,
      },
      'Logged memory audit task in Engineering.'
    );
  };

  const handleCreateDiskTask = () => {
    const disk = snapshot?.disk;
    const diskLabel = disk ? `${disk.usedPercent.toFixed(1)}% used` : 'storage';
    const desc = [
      disk
        ? `Host Filesystem (${disk.mount}): ${disk.usedPercent.toFixed(1)}% used (${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}, ${formatBytes(disk.freeBytes)} free)`
        : 'Host Filesystem: Telemetry pending',
      storageStats.quotaUsageBytes !== null && storageStats.quotaTotalBytes !== null
        ? `Browser Origin Storage: ${formatBytes(storageStats.quotaUsageBytes)} / ${formatBytes(storageStats.quotaTotalBytes)}`
        : 'Browser Origin Storage: Quota details unavailable',
      `Cached Local Task Drafts: ${storageStats.draftCount} (${formatBytes(storageStats.draftBytes)})`,
    ].join('\n');

    void createHardwareTask(
      'disk',
      {
        title: `Inspect storage & disk headroom (${diskLabel})`,
        description: desc,
        status: 'todo',
        priority: disk && disk.usedPercent >= 78 ? 'high' : 'medium',
        category: 'Operations',
        dueDate: todayIso,
      },
      'Logged storage audit task in Operations.'
    );
  };

  const handleCreateWorkstationTask = () => {
    const desc = [
      `Device: ${clientDevice.deviceName} (${clientDevice.platform} · ${clientDevice.browser})`,
      `Hardware: ${clientDevice.cpuCores} logical CPU cores · ${clientDevice.memoryGB > 0 ? `${clientDevice.memoryGB} GB device RAM` : 'Device RAM private'}`,
      `Display: ${displaySpec}`,
      `Connectivity: ${clientDevice.online ? 'Online' : 'Offline'}`,
      snapshot ? `Connected Host Uptime: ${formatUptime(snapshot.uptimeSeconds)}` : 'Connected Host: Pending',
    ].join('\n');

    void createHardwareTask(
      'workstation',
      {
        title: `Hardware readiness check (${clientDevice.deviceName})`,
        description: desc,
        status: 'todo',
        priority: 'medium',
        category: 'General',
        dueDate: todayIso,
      },
      'Logged workstation hardware check in General.'
    );
  };

  return (
    <section
      aria-label="System hardware tools"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Panel Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              System Hardware Tools
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {snapshot
                ? `${snapshot.hostname} · ${snapshot.platform}/${snapshot.arch} · uptime ${formatUptime(snapshot.uptimeSeconds)}`
                : 'Connecting to live hardware telemetry...'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleCopyDiagnostic()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            {copiedSnapshot ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSnapshot ? 'Copied Snapshot' : 'Copy Snapshot'}</span>
          </button>

          <button
            type="button"
            onClick={onTogglePause}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? 'Resume Feed' : 'Pause Feed'}</span>
          </button>

          {onOpenSystemMonitor && (
            <button
              type="button"
              onClick={onOpenSystemMonitor}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Full Monitor</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close hardware tools"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live Hardware Readout Grid (Flat 1px Hairline Dividers, No Nested Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800">
        {/* Host CPU */}
        <div className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Host CPU</span>
            </span>
            <span className="font-mono tabular-nums">
              {snapshot ? `${snapshot.cpu.coreCount} cores` : streamStatus}
            </span>
          </div>
          <div
            className={`text-lg font-semibold font-mono tabular-nums ${
              cpuWarn ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {cpuPct !== null ? `${cpuPct.toFixed(1)}%` : '--'}
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${cpuWarn ? 'bg-red-600' : 'bg-blue-600'}`}
              style={{ width: `${Math.min(100, cpuPct ?? 0)}%` }}
            />
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {snapshot
              ? `Load ${snapshot.cpu.loadAvg[0].toFixed(2)} · p99 ${snapshot.runtime.eventLoopP99Ms.toFixed(1)} ms`
              : 'Waiting for sample'}
          </div>
        </div>

        {/* Host Memory */}
        <div className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <MemoryStick className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Host Memory</span>
            </span>
            <span className="font-mono tabular-nums">
              {snapshot ? formatBytes(snapshot.memory.totalBytes) : '--'}
            </span>
          </div>
          <div
            className={`text-lg font-semibold font-mono tabular-nums ${
              memWarn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {memPct !== null ? `${memPct.toFixed(1)}%` : '--'}
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${memWarn ? 'bg-amber-600' : 'bg-emerald-600'}`}
              style={{ width: `${Math.min(100, memPct ?? 0)}%` }}
            />
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {snapshot
              ? `${formatBytes(snapshot.memory.availableBytes)} free · RSS ${formatBytes(snapshot.memory.process.rssBytes)}`
              : 'Waiting for sample'}
          </div>
        </div>

        {/* Host Disk & Local Storage */}
        <div className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Disk &amp; Draft Cache</span>
            </span>
            <button
              type="button"
              onClick={() => void refreshStorageStats()}
              aria-label="Refresh storage inspection"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {snapshot?.disk ? `${snapshot.disk.usedPercent.toFixed(1)}%` : '--'}
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                (snapshot?.disk?.usedPercent ?? 0) >= 85 ? 'bg-amber-600' : 'bg-slate-500 dark:bg-slate-400'
              }`}
              style={{ width: `${Math.min(100, snapshot?.disk?.usedPercent ?? 0)}%` }}
            />
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {snapshot?.disk
              ? `${formatBytes(snapshot.disk.freeBytes)} free · ${storageStats.draftCount} ${storageStats.draftCount === 1 ? 'draft' : 'drafts'}`
              : `${storageStats.draftCount} local drafts`}
          </div>
        </div>

        {/* Local Workstation Hardware */}
        <div className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5" aria-hidden="true" />
              <span>This Workstation</span>
            </span>
            <span className="font-mono tabular-nums">{clientDevice.cpuCores} threads</span>
          </div>
          <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 truncate">
            {clientDevice.memoryGB > 0 ? `${clientDevice.memoryGB} GB RAM` : clientDevice.platform}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
            {displaySpec}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
            {clientDevice.jsHeapUsedBytes !== null
              ? `JS Heap ${formatBytes(clientDevice.jsHeapUsedBytes)}`
              : `${clientDevice.browser} · ${clientDevice.online ? 'Online' : 'Offline'}`}
          </div>
        </div>
      </div>

      {/* Actionable Hardware-to-Task Tools + Live Threshold & Cache Utilities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        {/* Left: One-Click Hardware Maintenance Task Actions */}
        <div className="lg:col-span-7 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-display">
                Log Hardware Snapshot as Actionable Task
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Creates a synced task pre-filled with real-time hardware readings for follow-up.
              </p>
            </div>
            {actionNotice && (
              <span role="status" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {actionNotice}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyTemplate !== null}
              onClick={handleCreateCpuTask}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{busyTemplate === 'cpu' ? 'Logging...' : 'CPU Spike Task'}</span>
            </button>

            <button
              type="button"
              disabled={busyTemplate !== null}
              onClick={handleCreateMemoryTask}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{busyTemplate === 'memory' ? 'Logging...' : 'Memory Audit Task'}</span>
            </button>

            <button
              type="button"
              disabled={busyTemplate !== null}
              onClick={handleCreateDiskTask}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{busyTemplate === 'disk' ? 'Logging...' : 'Storage Audit Task'}</span>
            </button>

            <button
              type="button"
              disabled={busyTemplate !== null}
              onClick={handleCreateWorkstationTask}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{busyTemplate === 'workstation' ? 'Logging...' : 'Workstation Check'}</span>
            </button>
          </div>
        </div>

        {/* Right: Quick Alert Thresholds & Local Draft Storage Control */}
        <div className="lg:col-span-5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-display">
              Alert Guards &amp; Local Cache
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {storageStats.quotaUsageBytes !== null && storageStats.quotaTotalBytes !== null
                ? `Origin ${formatBytes(storageStats.quotaUsageBytes)} / ${formatBytes(storageStats.quotaTotalBytes)}`
                : 'Origin storage ready'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                <span>CPU Alert</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {thresholds.cpuWarning}%
                </span>
              </span>
              <input
                type="range"
                min={20}
                max={99}
                value={thresholds.cpuWarning}
                onChange={(e) =>
                  onUpdateThresholds({
                    ...thresholds,
                    cpuWarning: Number(e.target.value),
                  })
                }
                aria-label="CPU warning threshold percentage"
                className="w-full accent-blue-600 cursor-pointer"
              />
            </label>

            <label className="space-y-1">
              <span className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                <span>Memory Alert</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {thresholds.memWarning}%
                </span>
              </span>
              <input
                type="range"
                min={20}
                max={99}
                value={thresholds.memWarning}
                onChange={(e) =>
                  onUpdateThresholds({
                    ...thresholds,
                    memWarning: Number(e.target.value),
                  })
                }
                aria-label="Memory warning threshold percentage"
                className="w-full accent-blue-600 cursor-pointer"
              />
            </label>
          </div>

          <div className="pt-1 flex items-center justify-between gap-2 text-xs">
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {storageStats.draftCount} saved {storageStats.draftCount === 1 ? 'draft' : 'drafts'} ({formatBytes(storageStats.draftBytes)})
            </span>
            <button
              type="button"
              disabled={storageStats.draftCount === 0}
              onClick={handleClearCachedDrafts}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Draft Cache</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
