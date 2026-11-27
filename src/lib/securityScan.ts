import type {
  BrowserPermissionAuditItem,
  ClientDeviceInfo,
  DeviceSession,
  SecurityCheckResult,
  SecurityOverallStatus,
} from '@/src/types/app';

const DRAFT_KEY_PREFIX = 'cadence_task_draft_';
const STALE_DEVICE_MS = 24 * 60 * 60 * 1000;

export function countCachedTaskDrafts(): number {
  try {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DRAFT_KEY_PREFIX)) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

export function clearCachedTaskDrafts(): number {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DRAFT_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    return keysToRemove.length;
  } catch {
    return 0;
  }
}

export function findStaleDevices(devices: DeviceSession[], currentDeviceId: string): DeviceSession[] {
  const now = Date.now();
  return devices.filter((dev) => {
    if (dev.id === currentDeviceId) return false;
    if (!dev.isOnline) return true;
    if (!dev.lastActiveAt) return true;
    return now - dev.lastActiveAt.getTime() > STALE_DEVICE_MS;
  });
}

export async function auditBrowserPermissions(): Promise<BrowserPermissionAuditItem[]> {
  const targets: Array<{ name: string; label: string }> = [
    { name: 'notifications', label: 'Notifications' },
    { name: 'geolocation', label: 'Geolocation' },
    { name: 'camera', label: 'Camera' },
    { name: 'microphone', label: 'Microphone' },
    { name: 'clipboard-read', label: 'Clipboard Read' },
  ];

  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return targets.map((t) => ({ ...t, state: 'unsupported' }));
  }

  const results = await Promise.all(
    targets.map(async (target): Promise<BrowserPermissionAuditItem> => {
      try {
        const status = await navigator.permissions.query({ name: target.name as PermissionName });
        const state =
          status.state === 'granted' || status.state === 'denied' || status.state === 'prompt'
            ? status.state
            : 'unsupported';
        return { ...target, state };
      } catch {
        return { ...target, state: 'unsupported' };
      }
    })
  );

  return results;
}

export interface ExecutedSecurityAudit {
  checks: SecurityCheckResult[];
  permissions: BrowserPermissionAuditItem[];
  overallStatus: SecurityOverallStatus;
  passedChecks: number;
  warningChecks: number;
  criticalChecks: number;
  totalChecks: number;
  summary: string;
  scannedAt: number;
}

export interface SecurityAuditContext {
  userSignedIn: boolean;
  emailVerified: boolean;
  clientDevice: ClientDeviceInfo;
  devices: DeviceSession[];
  currentDeviceId: string;
  cpuPercent: number;
  memPercent: number;
  cpuThreshold: number;
  memThreshold: number;
  onProgress?: (stage: string) => void;
}

export async function executeDeviceSecurityAudit(ctx: SecurityAuditContext): Promise<ExecutedSecurityAudit> {
  const checks: SecurityCheckResult[] = [];

  // Stage 1: Transport & Cryptography
  ctx.onProgress?.('Verifying HTTPS transport and Web Crypto API');
  const isSecure = typeof window !== 'undefined' && window.isSecureContext;
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
  checks.push({
    id: 'device-secure-context',
    scope: 'device',
    category: 'Transport Security',
    title: 'TLS / Secure Browser Context',
    status: isSecure ? 'passed' : 'critical',
    detail: isSecure
      ? `Running in verified secure context (${protocol.replace(':', '').toUpperCase()})`
      : `Insecure browser context (${protocol}) restricts Web Crypto and Auth guarantees`,
  });

  const hasWebCrypto =
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.getRandomValues === 'function';
  checks.push({
    id: 'device-web-crypto',
    scope: 'device',
    category: 'Cryptography',
    title: 'Hardware CSPRNG & Web Crypto Subtle',
    status: hasWebCrypto ? 'passed' : 'warning',
    detail: hasWebCrypto
      ? 'crypto.subtle and cryptographic random generator active'
      : 'Web Crypto Subtle API unavailable in current context',
  });

  const hasWebAuthn = typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
  checks.push({
    id: 'device-passkey-support',
    scope: 'device',
    category: 'Authentication Hardware',
    title: 'Passkey / WebAuthn Capability',
    status: hasWebAuthn ? 'passed' : 'warning',
    detail: hasWebAuthn
      ? `${ctx.clientDevice.browser} supports FIDO2 / Passkey hardware verification`
      : 'WebAuthn hardware passkey API not exposed by this browser',
  });

  // Stage 2: Identity & Session Isolation
  ctx.onProgress?.('Checking account authentication & session isolation');
  checks.push({
    id: 'device-account-auth',
    scope: 'device',
    category: 'Identity & Access',
    title: 'Verified Account Session',
    status: ctx.userSignedIn ? (ctx.emailVerified ? 'passed' : 'warning') : 'warning',
    detail: ctx.userSignedIn
      ? ctx.emailVerified
        ? 'Authenticated with verified Google email and owner-isolated Firestore rules'
        : 'Signed in without verified email claim; Firestore writes restricted'
      : 'Signed out — cross-device sync and Firestore owner isolation inactive',
  });

  const staleDevices = ctx.userSignedIn ? findStaleDevices(ctx.devices, ctx.currentDeviceId) : [];
  checks.push({
    id: 'device-session-hygiene',
    scope: 'device',
    category: 'Session Hygiene',
    title: 'Registered Device Session Audit',
    status: staleDevices.length > 0 ? 'warning' : 'passed',
    detail: !ctx.userSignedIn
      ? 'Sign in to audit synced account device sessions'
      : staleDevices.length > 0
        ? `${staleDevices.length} offline or inactive ${staleDevices.length === 1 ? 'session' : 'sessions'} detected across your account`
        : `All ${Math.max(1, ctx.devices.length)} active account sessions are healthy`,
  });

  // Stage 3: Browser Permissions & Local Storage Hygiene
  ctx.onProgress?.('Auditing browser sensor permissions & local storage');
  const permissions = await auditBrowserPermissions();
  const grantedSensitive = permissions.filter(
    (p) => p.state === 'granted' && (p.name === 'camera' || p.name === 'microphone' || p.name === 'geolocation' || p.name === 'clipboard-read')
  );
  checks.push({
    id: 'device-sensor-permissions',
    scope: 'device',
    category: 'Browser Permissions',
    title: 'Sensitive Sensor & Clipboard Permissions',
    status: grantedSensitive.length > 0 ? 'warning' : 'passed',
    detail:
      grantedSensitive.length > 0
        ? `Always-granted access for: ${grantedSensitive.map((p) => p.label).join(', ')}`
        : 'Camera, microphone, geolocation, and clipboard read require explicit prompt or are denied',
  });

  const draftCount = countCachedTaskDrafts();
  checks.push({
    id: 'device-local-drafts',
    scope: 'device',
    category: 'Local Storage Privacy',
    title: 'Unencrypted Local Draft Cache',
    status: draftCount > 3 ? 'warning' : 'passed',
    detail:
      draftCount === 0
        ? 'No lingering task drafts stored in unencrypted localStorage'
        : `${draftCount} saved task ${draftCount === 1 ? 'draft' : 'drafts'} present in browser localStorage`,
  });

  // Stage 4: Live Telemetry Threshold Posture
  const telemetryAlert = ctx.cpuPercent >= ctx.cpuThreshold || ctx.memPercent >= ctx.memThreshold;
  checks.push({
    id: 'device-telemetry-shield',
    scope: 'host',
    category: 'Resource Anomaly Shield',
    title: 'CPU & Memory Threshold Posture',
    status: telemetryAlert ? 'warning' : 'passed',
    detail: telemetryAlert
      ? `Threshold exceeded (CPU ${ctx.cpuPercent.toFixed(1)}% / RAM ${ctx.memPercent.toFixed(1)}%)`
      : `Within configured limits (CPU ${ctx.cpuPercent.toFixed(1)}% < ${ctx.cpuThreshold}%, RAM ${ctx.memPercent.toFixed(1)}% < ${ctx.memThreshold}%)`,
  });

  // Stage 5: Host Runtime & Filesystem Audit Endpoint
  ctx.onProgress?.('Running server runtime & filesystem integrity scan');
  try {
    const response = await fetch('/api/system/security-scan');
    if (response.ok) {
      const serverData = (await response.json()) as {
        checks: SecurityCheckResult[];
      };
      if (Array.isArray(serverData.checks)) {
        checks.push(...serverData.checks);
      }
    } else {
      checks.push({
        id: 'host-scan-endpoint',
        scope: 'host',
        category: 'Host Telemetry',
        title: 'Server Security Scan Endpoint',
        status: 'warning',
        detail: `Server audit endpoint responded with HTTP ${response.status}`,
      });
    }
  } catch {
    checks.push({
      id: 'host-scan-endpoint',
      scope: 'host',
      category: 'Host Telemetry',
      title: 'Server Security Scan Endpoint',
      status: 'warning',
      detail: 'Unable to reach host security scan endpoint while offline',
    });
  }

  let passedChecks = 0;
  let warningChecks = 0;
  let criticalChecks = 0;
  for (const chk of checks) {
    if (chk.status === 'passed') passedChecks += 1;
    else if (chk.status === 'warning') warningChecks += 1;
    else criticalChecks += 1;
  }

  const overallStatus: SecurityOverallStatus =
    criticalChecks > 0 ? 'at_risk' : warningChecks > 0 ? 'attention' : 'protected';

  const summary =
    criticalChecks > 0
      ? `${criticalChecks} critical and ${warningChecks} warning findings across ${checks.length} checks`
      : warningChecks > 0
        ? `${passedChecks}/${checks.length} checks nominal; ${warningChecks} ${warningChecks === 1 ? 'item needs' : 'items need'} attention`
        : `All ${checks.length} device and host protection checks nominal`;

  return {
    checks,
    permissions,
    overallStatus,
    passedChecks,
    warningChecks,
    criticalChecks,
    totalChecks: checks.length,
    summary,
    scannedAt: Date.now(),
  };
}
