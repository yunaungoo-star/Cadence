import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_TITLE = 'Cadence — Real-Time Task Sync & System Telemetry';
const FOCUS_COUNT_KEY = 'cadence_focus_sessions';

function getTodayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadSessionsToday(): number {
  try {
    const raw = localStorage.getItem(FOCUS_COUNT_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date?: string; count?: number };
    if (parsed.date === getTodayKey() && typeof parsed.count === 'number' && parsed.count >= 0) {
      return parsed.count;
    }
  } catch {
    // ignore storage errors
  }
  return 0;
}

function saveSessionsToday(count: number): void {
  try {
    localStorage.setItem(
      FOCUS_COUNT_KEY,
      JSON.stringify({ date: getTodayKey(), count })
    );
  } catch {
    // ignore storage errors
  }
}

function playCompletionChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.001, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.38);
    });

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 1200);
  } catch {
    // ignore audio restrictions
  }
}

export function formatFocusClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function useFocusTimer() {
  const [durationMinutes, setDurationMinutes] = useState<number>(25);
  const [secondsLeft, setSecondsLeft] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [linkedTaskId, setLinkedTaskId] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [sessionsToday, setSessionsToday] = useState<number>(() => loadSessionsToday());
  const [justCompleted, setJustCompleted] = useState<boolean>(false);

  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          setIsRunning(false);
          setJustCompleted(true);
          setSessionsToday((count) => {
            const next = count + 1;
            saveSessionsToday(next);
            return next;
          });
          if (soundEnabledRef.current) {
            playCompletionChime();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  const formattedTime = useMemo(() => formatFocusClock(secondsLeft), [secondsLeft]);

  useEffect(() => {
    if (isRunning) {
      document.title = `${formattedTime} · Cadence`;
    } else {
      document.title = DEFAULT_TITLE;
    }
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [isRunning, formattedTime]);

  const totalSeconds = durationMinutes * 60;
  const isMidSession = isRunning || (secondsLeft > 0 && secondsLeft < totalSeconds);
  const progressPct =
    totalSeconds > 0
      ? Math.min(100, Math.max(0, Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100)))
      : 0;

  const selectPreset = useCallback((minutes: number) => {
    setIsRunning(false);
    setJustCompleted(false);
    setDurationMinutes(minutes);
    setSecondsLeft(minutes * 60);
  }, []);

  const toggleRun = useCallback(() => {
    setJustCompleted(false);
    setSecondsLeft((prev) => {
      if (prev <= 0) {
        return durationMinutes * 60;
      }
      return prev;
    });
    setIsRunning((prev) => !prev);
  }, [durationMinutes]);

  const reset = useCallback(() => {
    setIsRunning(false);
    setJustCompleted(false);
    setSecondsLeft(durationMinutes * 60);
  }, [durationMinutes]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => !prev);
  }, []);

  return {
    durationMinutes,
    secondsLeft,
    formattedTime,
    isRunning,
    isMidSession,
    progressPct,
    linkedTaskId,
    setLinkedTaskId,
    soundEnabled,
    toggleSound,
    sessionsToday,
    justCompleted,
    selectPreset,
    toggleRun,
    reset,
  };
}
