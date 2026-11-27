import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { formatRelativeTime, formatTimeClock } from '@/src/lib/formatters';
import {
  clearCachedTaskDrafts,
  countCachedTaskDrafts,
  executeDeviceSecurityAudit,
  findStaleDevices,
  type ExecutedSecurityAudit,
} from '@/src/lib/securityScan';
import type {
  ClientDeviceInfo,
  DeviceSession,
  SecurityCheckScope,
  SecurityCheckStatus,
  SecurityScanReport,
  SystemSnapshot,
} from '@/src/types/app';
import type { TelemetryThresholds } from '@/src/hooks/useSystemTelemetry';

interface SecurityScanViewProps {
  userSignedIn: boolean;
  emailVerified: boolean;
  clientDevice: ClientDeviceInfo;
  devices: DeviceSession[];
  currentDeviceId: string;
  snapshot: SystemSnapshot | null;
  thresholds: TelemetryThresholds;
  securityScans: SecurityScanReport[];
  onSignIn: () => Promise<void>;
  onRecordScan: (report: {
    overallStatus: ExecutedSecurityAudit['overallStatus'];
    passedChecks: number;
    warningChecks: number;
    criticalChecks: number;
    totalChecks: number;
    summary: string;
  }) => Promise<void>;
  onDeleteScan: (scanId: string) => Promise<void>;
  onRemoveDevice: (deviceId: string) => Promise<void>;
  onOpenSystemMonitor: () => void;
}

type FindingsFilter = 'all' | 'issues' | 'passed';
type ScopeFilter = 'all' | SecurityCheckScope;

function getStatusDisplay(status: SecurityCheckStatus) {
  if (status === 'critical') {
    return {
      label: 'Critical',
      textClass: 'text-red-600 dark:text-red-400',
      Icon: ShieldAlert,
    };
  }
  if (status === 'warning') {
    return {
      label: 'Attention',
      textClass: 'text-amber-600 dark:text-amber-400',
      Icon: AlertTriangle,
    };
  }
  return {
    label: 'Nominal',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    Icon: CheckCircle2,
  };
}

function getPermissionStateDisplay(state: 'granted' | 'prompt' | 'denied' | 'unsupported') {
  if (state === 'granted') {
    return { label: 'Granted', textClass: 'text-amber-600 dark:text-amber-400' };
  }
  if (state === 'denied') {
    return { label: 'Blocked', textClass: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (state === 'prompt') {
    return { label: 'Ask before use', textClass: 'text-slate-700 dark:text-slate-300' };
  }
  return { label: 'Not exposed', textClass: 'text-slate-400 dark:text-slate-500' };
}

export const SecurityScanView: React.FC<SecurityScanViewProps> = ({
  userSignedIn,
  emailVerified,
  clientDevice,
  devices,
  currentDeviceId,
  snapshot,
  thresholds,
  securityScans,
  onSignIn,
  onRecordScan,
  onDeleteScan,
  onRemoveDevice,
  onOpenSystemMonitor,
}) => {
  const [audit, setAudit] = useState<ExecutedSecurityAudit | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState<string>('');
  const [findingsFilter, setFindingsFilter] = useState<FindingsFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [draftCount, setDraftCount] = useState<number>(() => countCachedTaskDrafts());
  const [revokingStale, setRevokingStale] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const cpuPct = snapshot?.cpu.usagePercent ?? 0;
  const memPct = snapshot?.memory.usedPercent ?? 0;
  const telemetryAlert = cpuPct >= thresholds.cpuWarning || memPct >= thresholds.memWarning;

  const staleDevices = useMemo(
    () => (userSignedIn ? findStaleDevices(devices, currentDeviceId) : []),
    [userSignedIn, devices, currentDeviceId]
  );

  const runScan = useCallback(
    async (persistToAccount: boolean) => {
      setScanning(true);
      setActionNotice(null);
      try {
        const result = await executeDeviceSecurityAudit({
          userSignedIn,
          emailVerified,
          clientDevice,
          devices,
          currentDeviceId,
          cpuPercent: cpuPct,
          memPercent: memPct,
          cpuThreshold: thresholds.cpuWarning,
          memThreshold: thresholds.memWarning,
          onProgress: (stage) => setScanStage(stage),
        });
        setAudit(result);
        setDraftCount(countCachedTaskDrafts());

        if (persistToAccount && userSignedIn && emailVerified) {
          setScanStage('Syncing scan audit report to account');
          await onRecordScan({
            overallStatus: result.overallStatus,
            passedChecks: result.passedChecks,
            warningChecks: result.warningChecks,
            criticalChecks: result.criticalChecks,
            totalChecks: result.totalChecks,
            summary: result.summary,
          });
          setActionNotice('Security scan completed and synced across your devices.');
        } else if (persistToAccount) {
          setActionNotice('Local and host security scan completed.');
        }
      } finally {
        setScanning(false);
        setScanStage('');
      }
    },
    [
      userSignedIn,
      emailVerified,
      clientDevice,
      devices,
      currentDeviceId,
      cpuPct,
      memPct,
      thresholds.cpuWarning,
      thresholds.memWarning,
      onRecordScan,
    ]
  );

  // Run an initial passive posture audit when opening the Security module
  useEffect(() => {
    void runScan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClearDrafts = () => {
    const cleared = clearCachedTaskDrafts();
    setDraftCount(countCachedTaskDrafts());
    setActionNotice(
      cleared > 0
        ? `Removed ${cleared} cached task ${cleared === 1 ? 'draft' : 'drafts'} from local browser storage.`
        : 'No cached task drafts found.'
    );
    void runScan(false);
  };

  const handleRevokeStale = async () => {
    if (staleDevices.length === 0) return;
    setRevokingStale(true);
    try {
      await Promise.all(staleDevices.map((dev) => onRemoveDevice(dev.id)));
      setActionNotice(
        `Removed ${staleDevices.length} inactive or offline device ${staleDevices.length === 1 ? 'session' : 'sessions'}.`
      );
      void runScan(false);
    } finally {
      setRevokingStale(false);
    }
  };

  const filteredChecks = useMemo(() => {
    if (!audit) return [];
    return audit.checks.filter((chk) => {
      if (scopeFilter !== 'all' && chk.scope !== scopeFilter) return false;
      if (findingsFilter === 'issues' && chk.status === 'passed') return false;
      if (findingsFilter === 'passed' && chk.status !== 'passed') return false;
      return true;
    });
  }, [audit, findingsFilter, scopeFilter]);

  const activeSafeguardsCount =
    (typeof window !== 'undefined' && window.isSecureContext ? 1 : 0) +
    (userSignedIn && emailVerified ? 1 : 0) +
    (!telemetryAlert ? 1 : 0) +
    (draftCount === 0 ? 1 : 0);

  const postureText =
    audit?.overallStatus === 'at_risk'
      ? 'Action Required'
      : audit?.overallStatus === 'attention'
        ? 'Attention Needed'
        : audit
          ? 'Protected'
          : 'Scanning...';

  const postureTone =
    audit?.overallStatus === 'at_risk'
      ? 'text-red-600 dark:text-red-400'
      : audit?.overallStatus === 'attention'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-600 dark:text-emerald-400';

  const latestSyncedScan = securityScans[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-display tracking-tight">
            Device Security &amp; Smart Protection
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{clientDevice.deviceName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              {clientDevice.browser} on {clientDevice.platform}
            </span>
            {snapshot && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">Host {snapshot.hostname}</span>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void runScan(true)}
          disabled={scanning}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning Device...' : 'Run Security Scan'}
        </button>
      </div>

      {/* Live Scan Progress or Notice */}
      {(scanning || actionNotice) && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300"
        >
          <div className="flex items-center gap-2.5">
            {scanning ? (
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span>{scanning ? scanStage || 'Evaluating device and host security controls...' : actionNotice}</span>
          </div>
        </div>
      )}

      {/* 4-Column Protection Posture KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Protection Status</span>
            <ShieldCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className={`text-2xl font-semibold font-display ${postureTone}`}>{postureText}</div>
          <div className="mt-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {audit
              ? `${audit.passedChecks} / ${audit.totalChecks} checks nominal`
              : 'Evaluating security posture'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Smart Protections</span>
            <Lock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {activeSafeguardsCount} / 4 Active
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {userSignedIn ? 'Account isolation & telemetry guard' : 'Local transport guard active'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Session Hygiene</span>
            <KeyRound className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {userSignedIn ? `${devices.length} ${devices.length === 1 ? 'Session' : 'Sessions'}` : 'Signed Out'}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {userSignedIn
              ? staleDevices.length > 0
                ? `${staleDevices.length} offline or stale`
                : 'No stale sessions detected'
              : 'Sign in to audit synced devices'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Latest Audit</span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {audit ? formatTimeClock(audit.scannedAt) : '--'}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">
            {latestSyncedScan
              ? `Synced ${formatRelativeTime(latestSyncedScan.createdAt)} · ${latestSyncedScan.deviceName}`
              : 'Local posture snapshot'}
          </div>
        </div>
      </div>

      {/* Smart Protection Information + Browser Sensor Permissions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                Smart Protection Safeguards
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Active runtime protections and one-click hygiene actions for this device and account.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* Safeguard 1: Owner-Isolated Cloud Sync */}
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Zero-Trust Firestore Owner Isolation
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      userSignedIn && emailVerified
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {userSignedIn && emailVerified ? 'Enforced' : 'Sign-in required'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tasks, device sessions, and scan audits are isolated per verified Google account UID with server-timestamp validation.
                </p>
              </div>
              {!userSignedIn && (
                <button
                  type="button"
                  onClick={() => void onSignIn()}
                  className="px-3.5 py-2 min-h-[36px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Sign in with Google
                </button>
              )}
            </div>

            {/* Safeguard 2: Resource Anomaly Shield */}
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Host Resource Anomaly Shield
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      telemetryAlert
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {telemetryAlert ? 'Threshold Alert' : 'Nominal'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {snapshot
                    ? `Live CPU ${cpuPct.toFixed(1)}% (limit ${thresholds.cpuWarning}%) · RAM ${memPct.toFixed(1)}% (limit ${thresholds.memWarning}%)`
                    : 'Waiting for server telemetry stream...'}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenSystemMonitor}
                className="px-3.5 py-2 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Open Telemetry
              </button>
            </div>

            {/* Safeguard 3: Stale Session Hygiene */}
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Stale &amp; Offline Device Guard
                  </span>
                  <span
                    className={`text-xs font-medium font-mono tabular-nums ${
                      staleDevices.length > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {staleDevices.length > 0 ? `${staleDevices.length} inactive` : 'Clean'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {staleDevices.length > 0
                    ? 'Revoke offline or idle device sessions older than 24 hours from your account sync list.'
                    : 'Only active, recently verified sessions are currently registered.'}
                </p>
              </div>
              {staleDevices.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleRevokeStale()}
                  disabled={revokingStale}
                  className="px-3.5 py-2 min-h-[36px] text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {revokingStale ? 'Revoking...' : `Revoke ${staleDevices.length} Stale`}
                </button>
              )}
            </div>

            {/* Safeguard 4: Local Storage Draft Hygiene */}
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Local Draft Privacy Hygiene
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {draftCount} cached {draftCount === 1 ? 'draft' : 'drafts'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Clears unsaved task drafts persisted in unencrypted browser localStorage on shared computers.
                </p>
              </div>
              {draftCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearDrafts}
                  className="px-3.5 py-2 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Clear Cached Drafts
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Browser Sensor & Permission Posture */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              Browser Permission Posture
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live hardware and sensor permissions granted to this origin.
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {(audit?.permissions ?? []).length === 0 ? (
              <div className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
                Querying browser permission states...
              </div>
            ) : (
              audit!.permissions.map((perm) => {
                const display = getPermissionStateDisplay(perm.state);
                return (
                  <div key={perm.name} className="px-5 py-3 flex items-center justify-between gap-4">
                    <span className="text-slate-700 dark:text-slate-300">{perm.label}</span>
                    <span className={`text-xs font-mono font-medium ${display.textClass}`}>
                      {display.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Detailed Diagnostic Checks */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              Security Diagnostic Checks
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Verified client browser and Node.js host checks from the latest audit run.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Scope Filter */}
            <div
              role="group"
              aria-label="Filter findings by scope"
              className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1"
            >
              {(
                [
                  { id: 'all', label: 'All Scopes' },
                  { id: 'device', label: 'Device' },
                  { id: 'host', label: 'Host Server' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScopeFilter(item.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    scopeFilter === item.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div
              role="group"
              aria-label="Filter findings by status"
              className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'issues', label: 'Attention' },
                  { id: 'passed', label: 'Nominal' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFindingsFilter(item.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    findingsFilter === item.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!audit ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Running device and server security checks...
          </div>
        ) : filteredChecks.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No security checks match the selected filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredChecks.map((check) => {
              const st = getStatusDisplay(check.status);
              const StatusIcon = st.Icon;
              return (
                <div
                  key={check.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {check.title}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {check.scope === 'device' ? 'Device' : 'Host Server'} · {check.category}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{check.detail}</p>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 text-xs font-medium shrink-0 ${st.textClass}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    <span>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Cross-Device Security Scan History */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              Cross-Device Scan Audit History
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Immutable security scan logs synced across all devices signed into your account.
            </p>
          </div>
          {userSignedIn && (
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
              {securityScans.length} recorded
            </span>
          )}
        </div>

        {!userSignedIn ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Sign in to sync security scan history across your devices
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Signed-in accounts persist every scan audit cleanly in real time.
            </p>
            <button
              type="button"
              onClick={() => void onSignIn()}
              className="mt-4 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
            >
              Sign in with Google
            </button>
          </div>
        ) : securityScans.length === 0 ? (
          <div className="px-6 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No saved scans yet. Click &ldquo;Run Security Scan&rdquo; above to record an audit report to your account.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {securityScans.slice(0, 12).map((scan) => {
              const toneClass =
                scan.overallStatus === 'at_risk'
                  ? 'text-red-600 dark:text-red-400'
                  : scan.overallStatus === 'attention'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400';
              const statusLabel =
                scan.overallStatus === 'at_risk'
                  ? 'Action Required'
                  : scan.overallStatus === 'attention'
                    ? 'Attention'
                    : 'Protected';

              return (
                <li key={scan.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`font-semibold ${toneClass}`}>{statusLabel}</span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{scan.deviceName}</span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {scan.passedChecks}/{scan.totalChecks} nominal
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {formatRelativeTime(scan.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">{scan.summary}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void onDeleteScan(scan.id)}
                    aria-label={`Delete scan record from ${scan.deviceName}`}
                    className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
