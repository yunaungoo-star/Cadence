import type { ClientDeviceInfo } from '@/src/types/app';
import { BLUEPRINT_LIMITS, sanitizeDeviceName } from '@/src/lib/validation';

const DEVICE_ID_KEY = 'cadence_device_id';
const DEVICE_NAME_KEY = 'cadence_device_name';

export function detectPlatform(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const uaPlatform = nav.userAgentData?.platform;
  if (uaPlatform) {
    return uaPlatform.slice(0, BLUEPRINT_LIMITS.DEVICE_PLATFORM_MAX_LEN);
  }
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown OS';
}

export function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  return 'Web Browser';
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && BLUEPRINT_LIMITS.ID_PATTERN.test(existing) && existing.length <= BLUEPRINT_LIMITS.ID_MAX_LEN) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `dev_${crypto.randomUUID()}`
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return `dev_session_${Date.now()}`;
  }
}

export function getSavedDeviceName(): string {
  const fallback = sanitizeDeviceName(`${detectBrowser()} on ${detectPlatform()}`);
  try {
    const saved = localStorage.getItem(DEVICE_NAME_KEY);
    if (saved && saved.trim().length > 0) {
      return sanitizeDeviceName(saved);
    }
    localStorage.setItem(DEVICE_NAME_KEY, fallback);
    return fallback;
  } catch {
    return fallback;
  }
}

export function setSavedDeviceName(name: string): string {
  const clean = sanitizeDeviceName(name);
  try {
    localStorage.setItem(DEVICE_NAME_KEY, clean);
  } catch {
    // Ignore storage quota errors
  }
  return clean;
}

export function getClientDeviceInfo(): ClientDeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  };

  return {
    deviceId: getOrCreateDeviceId(),
    deviceName: getSavedDeviceName(),
    platform: detectPlatform().slice(0, BLUEPRINT_LIMITS.DEVICE_PLATFORM_MAX_LEN),
    browser: detectBrowser().slice(0, BLUEPRINT_LIMITS.DEVICE_BROWSER_MAX_LEN),
    cpuCores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 0,
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0,
    online: navigator.onLine,
    jsHeapUsedBytes: perf.memory ? perf.memory.usedJSHeapSize : null,
    jsHeapLimitBytes: perf.memory ? perf.memory.jsHeapSizeLimit : null,
  };
}
