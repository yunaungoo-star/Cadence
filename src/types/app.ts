export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskItem {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  dueDate: string;
  archived: boolean;
  updatedByDevice: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface TaskDraft {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  dueDate: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface DeviceSession {
  id: string;
  ownerId: string;
  deviceName: string;
  platform: string;
  browser: string;
  cpuCores: number;
  memoryGB: number;
  isOnline: boolean;
  createdAt: Date | null;
  lastActiveAt: Date | null;
}

export interface CoreCpuSample {
  core: number;
  model: string;
  speedMHz: number;
  usagePercent: number;
  userPercent: number;
  sysPercent: number;
  idlePercent: number;
}

export interface NetworkInterfaceSummary {
  name: string;
  address: string;
  family: string;
  internal: boolean;
}

export interface DiskSummary {
  mount: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}

export interface SystemSnapshot {
  timestamp: number;
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  nodeVersion: string;
  pid: number;
  uptimeSeconds: number;
  processUptimeSeconds: number;
  cpu: {
    model: string;
    coreCount: number;
    usagePercent: number;
    userPercent: number;
    sysPercent: number;
    loadAvg: [number, number, number];
    cores: CoreCpuSample[];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    availableBytes: number;
    cachedBytes: number;
    usedPercent: number;
    cgroupLimitBytes: number | null;
    cgroupUsedBytes: number | null;
    process: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      heapLimitBytes: number;
      externalBytes: number;
      arrayBuffersBytes: number;
    };
  };
  runtime: {
    eventLoopMeanMs: number;
    eventLoopP99Ms: number;
    eventLoopMaxMs: number;
    voluntaryContextSwitches: number;
    involuntaryContextSwitches: number;
  };
  disk: DiskSummary | null;
  networkInterfaces: NetworkInterfaceSummary[];
  activeTelemetryClients: number;
}

export interface SystemHistoryPoint {
  timestamp: number;
  cpuPercent: number;
  memPercent: number;
  load1m: number;
  eventLoopMeanMs: number;
  heapUsedMB: number;
}

export interface ClientDeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: string;
  browser: string;
  cpuCores: number;
  memoryGB: number;
  online: boolean;
  jsHeapUsedBytes: number | null;
  jsHeapLimitBytes: number | null;
}

export interface ThresholdEvent {
  id: string;
  timestamp: number;
  metric: 'CPU' | 'Memory';
  level: 'warning' | 'recovered';
  value: number;
  threshold: number;
}

export type SecurityCheckStatus = 'passed' | 'warning' | 'critical';
export type SecurityCheckScope = 'device' | 'host';
export type SecurityOverallStatus = 'protected' | 'attention' | 'at_risk';

export interface SecurityCheckResult {
  id: string;
  scope: SecurityCheckScope;
  category: string;
  title: string;
  status: SecurityCheckStatus;
  detail: string;
}

export interface BrowserPermissionAuditItem {
  name: string;
  label: string;
  state: 'granted' | 'prompt' | 'denied' | 'unsupported';
}

export interface SecurityScanReport {
  id: string;
  ownerId: string;
  deviceId: string;
  deviceName: string;
  overallStatus: SecurityOverallStatus;
  passedChecks: number;
  warningChecks: number;
  criticalChecks: number;
  totalChecks: number;
  summary: string;
  createdAt: Date | null;
}

export type SyncConnectionState = 'synced' | 'syncing' | 'offline' | 'signed_out';
export type ActiveTab = 'tasks' | 'dashboard' | 'system' | 'devices' | 'security' | 'activity';
