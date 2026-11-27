import { useCallback, useEffect, useRef, useState } from 'react';
import { getClientDeviceInfo } from '@/src/lib/device';
import type { ClientDeviceInfo, SystemHistoryPoint, SystemSnapshot, ThresholdEvent } from '@/src/types/app';

const MAX_HISTORY = 300;
const THRESHOLD_STORAGE_KEY = 'cadence_telemetry_thresholds';

export interface TelemetryThresholds {
  cpuWarning: number;
  memWarning: number;
}

function loadThresholds(): TelemetryThresholds {
  try {
    const raw = localStorage.getItem(THRESHOLD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TelemetryThresholds>;
      return {
        cpuWarning: typeof parsed.cpuWarning === 'number' ? Math.min(99, Math.max(20, parsed.cpuWarning)) : 75,
        memWarning: typeof parsed.memWarning === 'number' ? Math.min(99, Math.max(20, parsed.memWarning)) : 80,
      };
    }
  } catch {
    // ignore storage errors
  }
  return { cpuWarning: 75, memWarning: 80 };
}

export function useSystemTelemetry() {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [history, setHistory] = useState<SystemHistoryPoint[]>([]);
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'paused' | 'error'>('connecting');
  const [isPaused, setIsPaused] = useState(false);
  const [thresholds, setThresholds] = useState<TelemetryThresholds>(loadThresholds);
  const [thresholdEvents, setThresholdEvents] = useState<ThresholdEvent[]>([]);
  const [clientDevice, setClientDevice] = useState<ClientDeviceInfo>(() => getClientDeviceInfo());

  const eventSourceRef = useRef<EventSource | null>(null);
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;
  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;
  const alertStateRef = useRef<{ cpu: boolean; mem: boolean }>({ cpu: false, mem: false });

  const updateThresholds = useCallback((next: TelemetryThresholds) => {
    setThresholds(next);
    try {
      localStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  // Refresh local browser hardware & JS heap telemetry
  useEffect(() => {
    const refreshClient = () => setClientDevice(getClientDeviceInfo());
    const id = window.setInterval(refreshClient, 2000);
    window.addEventListener('online', refreshClient);
    window.addEventListener('offline', refreshClient);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', refreshClient);
      window.removeEventListener('offline', refreshClient);
    };
  }, []);

  // Fetch initial stats history + connect SSE live stream
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      try {
        const res = await fetch('/api/system/stats');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          snapshot: SystemSnapshot;
          history: SystemHistoryPoint[];
        };
        if (!cancelled) {
          setSnapshot(data.snapshot);
          setHistory(data.history.slice(-MAX_HISTORY));
        }
      } catch {
        if (!cancelled) {
          setStreamStatus('error');
        }
      }
    }

    void loadInitial();

    const es = new EventSource('/api/system/stream');
    eventSourceRef.current = es;

    es.onopen = () => {
      if (!cancelled) {
        setStreamStatus(pausedRef.current ? 'paused' : 'live');
      }
    };

    es.onmessage = (event) => {
      if (cancelled || pausedRef.current) return;
      try {
        const next = JSON.parse(event.data) as SystemSnapshot;
        setSnapshot(next);
        setStreamStatus('live');
        setHistory((prev) => {
          const point: SystemHistoryPoint = {
            timestamp: next.timestamp,
            cpuPercent: next.cpu.usagePercent,
            memPercent: next.memory.usedPercent,
            load1m: next.cpu.loadAvg[0],
            eventLoopMeanMs: next.runtime?.eventLoopMeanMs ?? 0,
            heapUsedMB: Number(((next.memory.process.heapUsedBytes ?? 0) / (1024 * 1024)).toFixed(1)),
          };
          const updated = [...prev, point];
          return updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated;
        });

        // Track real threshold crossings
        const limits = thresholdsRef.current;
        const cpuOver = next.cpu.usagePercent >= limits.cpuWarning;
        const memOver = next.memory.usedPercent >= limits.memWarning;
        const newEvents: ThresholdEvent[] = [];

        if (cpuOver !== alertStateRef.current.cpu) {
          alertStateRef.current.cpu = cpuOver;
          newEvents.push({
            id: `cpu-${next.timestamp}`,
            timestamp: next.timestamp,
            metric: 'CPU',
            level: cpuOver ? 'warning' : 'recovered',
            value: next.cpu.usagePercent,
            threshold: limits.cpuWarning,
          });
        }

        if (memOver !== alertStateRef.current.mem) {
          alertStateRef.current.mem = memOver;
          newEvents.push({
            id: `mem-${next.timestamp}`,
            timestamp: next.timestamp,
            metric: 'Memory',
            level: memOver ? 'warning' : 'recovered',
            value: next.memory.usedPercent,
            threshold: limits.memWarning,
          });
        }

        if (newEvents.length > 0) {
          setThresholdEvents((prev) => [...newEvents, ...prev].slice(0, 20));
        }
      } catch {
        // Ignore malformed SSE frame
      }
    };

    es.onerror = () => {
      if (!cancelled) {
        setStreamStatus('error');
      }
    };

    return () => {
      cancelled = true;
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      setStreamStatus(next ? 'paused' : 'live');
      return next;
    });
  }, []);

  const clearThresholdEvents = useCallback(() => {
    setThresholdEvents([]);
  }, []);

  return {
    snapshot,
    history,
    streamStatus,
    isPaused,
    togglePause,
    thresholds,
    updateThresholds,
    thresholdEvents,
    clearThresholdEvents,
    clientDevice,
    refreshClientDevice: () => setClientDevice(getClientDeviceInfo()),
  };
}
