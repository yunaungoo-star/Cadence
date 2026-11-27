import React from 'react';
import { Activity, Cpu, HardDrive } from 'lucide-react';
import { formatBytes } from '@/src/lib/formatters';
import type { SystemSnapshot } from '@/src/types/app';
import type { TelemetryThresholds } from '@/src/hooks/useSystemTelemetry';

interface CompactSystemWidgetProps {
  snapshot: SystemSnapshot | null;
  streamStatus: 'connecting' | 'live' | 'paused' | 'error';
  thresholds: TelemetryThresholds;
  onOpenMonitor: () => void;
}

export const CompactSystemWidget: React.FC<CompactSystemWidgetProps> = ({
  snapshot,
  streamStatus,
  thresholds,
  onOpenMonitor,
}) => {
  const cpuPct = snapshot?.cpu.usagePercent ?? 0;
  const memPct = snapshot?.memory.usedPercent ?? 0;

  const cpuBarColor =
    cpuPct >= 90
      ? 'bg-red-600 dark:bg-red-500'
      : cpuPct >= thresholds.cpuWarning
        ? 'bg-amber-500'
        : 'bg-blue-600 dark:bg-blue-500';

  const memBarColor =
    memPct >= 92
      ? 'bg-red-600 dark:bg-red-500'
      : memPct >= thresholds.memWarning
        ? 'bg-amber-500'
        : 'bg-emerald-600 dark:bg-emerald-500';

  const streamLabel =
    streamStatus === 'live'
      ? 'Live'
      : streamStatus === 'paused'
        ? 'Paused'
        : streamStatus === 'error'
          ? 'Reconnecting'
          : 'Connecting';

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
            System Status
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
          {streamStatus === 'live' && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          )}
          {streamLabel}
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <Cpu className="w-3.5 h-3.5" />
              CPU
            </span>
            <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
              {snapshot ? `${cpuPct.toFixed(1)}%` : '--'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${cpuBarColor}`}
              style={{ width: `${Math.min(100, Math.max(0, cpuPct))}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <HardDrive className="w-3.5 h-3.5" />
              Memory
            </span>
            <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
              {snapshot ? `${memPct.toFixed(1)}%` : '--'}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${memBarColor}`}
              style={{ width: `${Math.min(100, Math.max(0, memPct))}%` }}
            />
          </div>
          {snapshot && (
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {formatBytes(snapshot.memory.usedBytes)} / {formatBytes(snapshot.memory.totalBytes)}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenMonitor}
        className="mt-3.5 w-full py-1.5 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap"
      >
        Open System Monitor
      </button>
    </div>
  );
};
