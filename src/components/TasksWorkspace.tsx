import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  CalendarClock,
  Check,
  CheckSquare,
  Circle,
  Clock,
  Columns3,
  Cpu,
  Edit3,
  LayoutList,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { HardwareToolsPanel } from '@/src/components/HardwareToolsPanel';
import { TasksGuidePanel, type TasksGuideTab } from '@/src/components/TasksGuidePanel';
import type { TelemetryThresholds } from '@/src/hooks/useSystemTelemetry';
import { formatRelativeTime } from '@/src/lib/formatters';
import { BLUEPRINT_LIMITS, validateTaskTitle } from '@/src/lib/validation';
import type {
  ClientDeviceInfo,
  SecurityOverallStatus,
  SyncConnectionState,
  SystemSnapshot,
  TaskDraft,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '@/src/types/app';

interface TasksWorkspaceProps {
  userSignedIn: boolean;
  authReady: boolean;
  tasks: TaskItem[];
  loadingTasks: boolean;
  syncState: SyncConnectionState;
  lastSyncedAt: Date | null;
  categories: string[];
  onlineDeviceCount?: number;
  totalDeviceCount?: number;
  latestScanStatus?: SecurityOverallStatus | null;
  snapshot?: SystemSnapshot | null;
  telemetryStreamStatus?: 'connecting' | 'live' | 'paused' | 'error';
  telemetryPaused?: boolean;
  telemetryThresholds?: TelemetryThresholds;
  clientDevice?: ClientDeviceInfo;
  onSignIn: () => Promise<void>;
  onCreateTask: (draft: TaskDraft) => Promise<void>;
  onUpdateStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onToggleArchive: (taskId: string, archived: boolean) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onOpenEditor: (task: TaskItem | null) => void;
  onOpenDevices?: () => void;
  onOpenSecurity?: () => void;
  onToggleTelemetryPause?: () => void;
  onUpdateTelemetryThresholds?: (next: TelemetryThresholds) => void;
  onOpenSystemMonitor?: () => void;
}

type ViewMode = 'list' | 'board';
type SmartFocus = 'all' | 'due_soon' | 'high_priority';
type SortOption = 'updated' | 'due' | 'priority' | 'created_desc' | 'created_asc';

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const PRIORITY_CHIP: Record<
  TaskPriority,
  {
    text: string;
    chipClassName: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  urgent: {
    text: 'Urgent',
    chipClassName:
      'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/80',
    Icon: AlertOctagon,
  },
  high: {
    text: 'High',
    chipClassName:
      'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/80',
    Icon: ArrowUp,
  },
  medium: {
    text: 'Medium',
    chipClassName:
      'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/80',
    Icon: Minus,
  },
  low: {
    text: 'Low',
    chipClassName:
      'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    Icon: ArrowDown,
  },
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

function toLocalIsoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDueDateMeta(
  dueDate: string,
  status: TaskStatus,
  todayIso: string
): { label: string; toneClass: string; isOverdue: boolean; isDueSoon: boolean } | null {
  if (!dueDate) return null;
  if (status === 'done') {
    return {
      label: `Due ${dueDate}`,
      toneClass: 'text-slate-400 dark:text-slate-500',
      isOverdue: false,
      isDueSoon: false,
    };
  }

  const todayMs = Date.parse(`${todayIso}T00:00:00`);
  const dueMs = Date.parse(`${dueDate}T00:00:00`);
  if (!Number.isFinite(todayMs) || !Number.isFinite(dueMs)) {
    return {
      label: `Due ${dueDate}`,
      toneClass: 'text-slate-500 dark:text-slate-400',
      isOverdue: false,
      isDueSoon: false,
    };
  }

  const diffDays = Math.round((dueMs - todayMs) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      label: `Overdue ${overdueDays}d (${dueDate})`,
      toneClass: 'text-red-600 dark:text-red-400 font-medium',
      isOverdue: true,
      isDueSoon: true,
    };
  }
  if (diffDays === 0) {
    return {
      label: `Due today (${dueDate})`,
      toneClass: 'text-amber-600 dark:text-amber-400 font-medium',
      isOverdue: false,
      isDueSoon: true,
    };
  }
  if (diffDays === 1) {
    return {
      label: `Due tomorrow (${dueDate})`,
      toneClass: 'text-blue-600 dark:text-blue-400 font-medium',
      isOverdue: false,
      isDueSoon: true,
    };
  }
  if (diffDays <= 3) {
    return {
      label: `Due in ${diffDays}d (${dueDate})`,
      toneClass: 'text-slate-700 dark:text-slate-300',
      isOverdue: false,
      isDueSoon: true,
    };
  }
  return {
    label: `Due ${dueDate}`,
    toneClass: 'text-slate-500 dark:text-slate-400',
    isOverdue: false,
    isDueSoon: false,
  };
}

export const TasksWorkspace: React.FC<TasksWorkspaceProps> = ({
  userSignedIn,
  authReady,
  tasks,
  loadingTasks,
  syncState,
  lastSyncedAt,
  categories,
  onlineDeviceCount = 1,
  totalDeviceCount = 1,
  latestScanStatus = null,
  snapshot = null,
  telemetryStreamStatus = 'connecting',
  telemetryPaused = false,
  telemetryThresholds = { cpuWarning: 75, memWarning: 80 },
  clientDevice,
  onSignIn,
  onCreateTask,
  onUpdateStatus,
  onToggleArchive,
  onDeleteTask,
  onOpenEditor,
  onOpenDevices,
  onOpenSecurity,
  onToggleTelemetryPause,
  onUpdateTelemetryThresholds,
  onOpenSystemMonitor,
}) => {
  const [quickTitle, setQuickTitle] = useState('');
  const [quickNotes, setQuickNotes] = useState('');
  const [showQuickNotes, setShowQuickNotes] = useState(false);
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('medium');
  const [quickCategory, setQuickCategory] = useState('General');
  const [quickDueDate, setQuickDueDate] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [submittingQuick, setSubmittingQuick] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [smartFocus, setSmartFocus] = useState<SmartFocus>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [undoArchiveTask, setUndoArchiveTask] = useState<{ id: string; title: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [guideTab, setGuideTab] = useState<TasksGuideTab>('creating');
  const [showHardwareTools, setShowHardwareTools] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const quickTitleInputRef = useRef<HTMLInputElement | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const todayIso = toLocalIsoDate(0);
  const tomorrowIso = toLocalIsoDate(1);

  const openGuideAt = (tab: TasksGuideTab) => {
    setGuideTab(tab);
    setShowGuide(true);
  };

  const handleFocusAddTask = () => {
    setShowGuide(false);
    window.setTimeout(() => {
      quickTitleInputRef.current?.focus();
      quickTitleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  // Keyboard shortcut: "/" focuses search when not typing in an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const counts = useMemo(() => {
    let activeTotal = 0;
    let todo = 0;
    let inProgress = 0;
    let done = 0;
    let archived = 0;
    let overdue = 0;
    let dueSoon = 0;
    let highPriority = 0;

    for (const t of tasks) {
      if (t.archived) {
        archived++;
        continue;
      }
      activeTotal++;
      if (t.status === 'todo') todo++;
      else if (t.status === 'in_progress') inProgress++;
      else if (t.status === 'done') done++;

      if (t.status !== 'done' && (t.priority === 'urgent' || t.priority === 'high')) {
        highPriority++;
      }
      const dueMeta = getDueDateMeta(t.dueDate, t.status, todayIso);
      if (dueMeta?.isOverdue) overdue++;
      if (dueMeta?.isDueSoon) dueSoon++;
    }

    const completionPct = activeTotal > 0 ? Math.round((done / activeTotal) * 100) : 0;
    return {
      total: activeTotal,
      todo,
      inProgress,
      done,
      archived,
      overdue,
      dueSoon,
      highPriority,
      completionPct,
    };
  }, [tasks, todayIso]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.normalize('NFC').trim().toLowerCase();
    const list = tasks.filter((task) => {
      if (task.archived) return false;
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && task.category !== categoryFilter) return false;
      if (smartFocus === 'due_soon') {
        const meta = getDueDateMeta(task.dueDate, task.status, todayIso);
        if (!meta?.isDueSoon) return false;
      } else if (smartFocus === 'high_priority') {
        if (task.status === 'done' || (task.priority !== 'urgent' && task.priority !== 'high')) {
          return false;
        }
      }
      if (q) {
        const match =
          task.title.normalize('NFC').toLowerCase().includes(q) ||
          task.description.normalize('NFC').toLowerCase().includes(q) ||
          task.category.normalize('NFC').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'priority') {
        const diff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
        if (diff !== 0) return diff;
      }
      if (sortBy === 'due') {
        if (a.dueDate && b.dueDate) {
          const cmp = a.dueDate.localeCompare(b.dueDate);
          if (cmp !== 0) return cmp;
        } else if (a.dueDate) {
          return -1;
        } else if (b.dueDate) {
          return 1;
        }
      }
      if (sortBy === 'created_desc') {
        const ca = a.createdAt ? a.createdAt.getTime() : Date.now();
        const cb = b.createdAt ? b.createdAt.getTime() : Date.now();
        if (cb !== ca) return cb - ca;
      }
      if (sortBy === 'created_asc') {
        const ca = a.createdAt ? a.createdAt.getTime() : Date.now();
        const cb = b.createdAt ? b.createdAt.getTime() : Date.now();
        if (ca !== cb) return ca - cb;
      }
      const ta = a.updatedAt ? a.updatedAt.getTime() : Date.now();
      const tb = b.updatedAt ? b.updatedAt.getTime() : Date.now();
      return tb - ta;
    });

    return list;
  }, [tasks, searchQuery, statusFilter, priorityFilter, categoryFilter, smartFocus, sortBy, todayIso]);

  const activeVisibleIds = useMemo(() => new Set(filteredTasks.map((t) => t.id)), [filteredTasks]);
  const validSelectedIds = useMemo(
    () => selectedIds.filter((id) => activeVisibleIds.has(id)),
    [selectedIds, activeVisibleIds]
  );

  const toggleSelectTask = (taskId: string) => {
    setSelectedIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
  };

  const handleToggleAllVisible = () => {
    if (validSelectedIds.length === filteredTasks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTasks.map((t) => t.id));
    }
  };

  const handleArchiveWithUndo = async (task: TaskItem) => {
    await onToggleArchive(task.id, true);
    setUndoArchiveTask({ id: task.id, title: task.title });
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoArchiveTask(null);
    }, 6000);
  };

  const handleUndoArchive = async () => {
    if (!undoArchiveTask) return;
    const target = undoArchiveTask;
    setUndoArchiveTask(null);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    await onToggleArchive(target.id, false);
  };

  const handleBulkStatus = async (nextStatus: TaskStatus) => {
    if (validSelectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(validSelectedIds.map((id) => onUpdateStatus(id, nextStatus)));
      setSelectedIds([]);
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkArchive = async () => {
    if (validSelectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(validSelectedIds.map((id) => onToggleArchive(id, true)));
      setSelectedIds([]);
      setSelectMode(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateTaskTitle(quickTitle);
    if (err) {
      setQuickError(err);
      return;
    }
    setSubmittingQuick(true);
    setQuickError(null);
    try {
      await onCreateTask({
        title: quickTitle,
        description: quickNotes,
        status: 'todo',
        priority: quickPriority,
        category: quickCategory || 'General',
        dueDate: quickDueDate,
      });
      setQuickTitle('');
      setQuickNotes('');
      setShowQuickNotes(false);
      setQuickDueDate('');
    } finally {
      setSubmittingQuick(false);
    }
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSmartFocus('all');
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
  };

  if (!authReady) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!userSignedIn) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 max-w-3xl">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-display tracking-tight text-balance">
            Real-time cross-device task synchronization
          </h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            Sign in with your Google account to create, organize, and complete tasks that sync immediately across every
            desktop, tablet, and phone linked to your account—backed by owner-isolated Firestore security rules and live
            hardware telemetry.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => void onSignIn()}
              className="px-5 py-2.5 min-h-[44px] text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Sign in with Google
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Verified Google Identity · Real-time Firestore persistence · Draft recovery
            </span>
          </div>
        </div>
      </div>
    );
  }

  const syncSummary =
    syncState === 'synced'
      ? `Verified sync${lastSyncedAt ? ` · ${formatRelativeTime(lastSyncedAt)}` : ''}`
      : syncState === 'syncing'
        ? 'Syncing changes...'
        : 'Offline · Queuing local edits';

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    smartFocus !== 'all' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    categoryFilter !== 'all';

  return (
    <div className="space-y-5">
      {/* Header & Verified Sync Context */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-display tracking-tight">
            Synchronized Tasks
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>{counts.total} active</span>
            <span aria-hidden="true">·</span>
            <span>{counts.done} completed</span>
            {counts.archived > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{counts.archived} archived</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="inline-flex items-center gap-2">
            {syncState === 'synced' && <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />}
            {syncState === 'syncing' && <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />}
            {syncState === 'offline' && <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />}
            <span>{syncSummary}</span>
          </div>

          {onOpenSecurity && (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <button
                type="button"
                onClick={onOpenSecurity}
                className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {latestScanStatus === 'at_risk'
                    ? 'Security alert'
                    : latestScanStatus === 'attention'
                      ? 'Security review'
                      : 'Owner-isolated'}
                </span>
              </button>
            </>
          )}

          {clientDevice && onToggleTelemetryPause && onUpdateTelemetryThresholds && (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <button
                type="button"
                aria-expanded={showHardwareTools}
                onClick={() => setShowHardwareTools((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  showHardwareTools
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Cpu
                  className={`w-3.5 h-3.5 ${
                    snapshot &&
                    (snapshot.cpu.usagePercent >= telemetryThresholds.cpuWarning ||
                      snapshot.memory.usedPercent >= telemetryThresholds.memWarning)
                      ? 'text-amber-600 dark:text-amber-400'
                      : ''
                  }`}
                />
                <span>Hardware Tools</span>
                {snapshot && (
                  <span className="hidden sm:inline font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                    · {snapshot.cpu.usagePercent.toFixed(0)}% CPU / {snapshot.memory.usedPercent.toFixed(0)}% RAM
                  </span>
                )}
              </button>
            </>
          )}

          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
          <button
            type="button"
            aria-expanded={showGuide}
            onClick={() => setShowGuide((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              showGuide
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{showGuide ? 'Hide Guide' : 'User Guide'}</span>
          </button>
        </div>
      </div>

      {/* System Hardware Tools Panel */}
      {showHardwareTools && clientDevice && onToggleTelemetryPause && onUpdateTelemetryThresholds && (
        <HardwareToolsPanel
          snapshot={snapshot}
          streamStatus={telemetryStreamStatus}
          isPaused={telemetryPaused}
          thresholds={telemetryThresholds}
          clientDevice={clientDevice}
          onTogglePause={onToggleTelemetryPause}
          onUpdateThresholds={onUpdateTelemetryThresholds}
          onCreateTask={onCreateTask}
          onOpenSystemMonitor={onOpenSystemMonitor}
          onClose={() => setShowHardwareTools(false)}
        />
      )}

      {/* Interactive End-User Guide */}
      {showGuide && (
        <TasksGuidePanel
          activeTab={guideTab}
          onSelectTab={setGuideTab}
          onClose={() => setShowGuide(false)}
          onFocusAddTask={handleFocusAddTask}
          onOpenNewTaskModal={() => onOpenEditor(null)}
        />
      )}

      {/* 4-Column Trusted Workspace Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
            <span>Completion Progress</span>
            <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
              {counts.completionPct}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-2">
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
              style={{ width: `${counts.completionPct}%` }}
            />
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {counts.done} of {counts.total} active done
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Active Workload</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {counts.inProgress} in progress
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {counts.todo} queued · {counts.highPriority} urgent/high
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSmartFocus((prev) => (prev === 'due_soon' ? 'all' : 'due_soon'))}
          className={`text-left bg-white dark:bg-slate-900 border rounded-xl p-4 transition-colors ${
            smartFocus === 'due_soon'
              ? 'border-blue-600 dark:border-blue-500'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Schedule Focus</span>
            <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div
            className={`text-xl font-semibold font-mono tabular-nums ${
              counts.overdue > 0
                ? 'text-red-600 dark:text-red-400'
                : counts.dueSoon > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {counts.overdue > 0
              ? `${counts.overdue} overdue`
              : counts.dueSoon > 0
                ? `${counts.dueSoon} due soon`
                : 'On schedule'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {smartFocus === 'due_soon' ? 'Filtering due soon · Click to clear' : 'Click to focus upcoming due dates'}
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenDevices}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-4 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Device Sync Trust</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {onlineDeviceCount} {onlineDeviceCount === 1 ? 'device' : 'devices'} live
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {totalDeviceCount} registered · Encrypted cloud sync
          </div>
        </button>
      </div>

      {/* Real-Time Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tasks by title, notes, or list..."
          aria-label="Search tasks by title or description"
          className="w-full pl-10 pr-14 py-2.5 min-h-[44px] text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <span
            aria-hidden="true"
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
          >
            /
          </span>
        )}
      </div>

      {/* Inline Quick-Add Composer */}
      <form
        onSubmit={handleQuickAdd}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <input
            ref={quickTitleInputRef}
            type="text"
            maxLength={BLUEPRINT_LIMITS.TASK_TITLE_MAX_LEN}
            value={quickTitle}
            onChange={(e) => {
              setQuickTitle(e.target.value);
              if (quickError) setQuickError(null);
            }}
            placeholder="Add a task synced across your devices..."
            aria-label="New task title"
            className="flex-1 min-w-0 px-3.5 py-2 min-h-[40px] text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              aria-label="Priority"
              value={quickPriority}
              onChange={(e) => setQuickPriority(e.target.value as TaskPriority)}
              className="px-3 py-2 min-h-[40px] text-xs font-medium bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
              <option value="urgent">Urgent</option>
            </select>

            <input
              type="text"
              aria-label="Workspace list"
              maxLength={BLUEPRINT_LIMITS.TASK_CATEGORY_MAX_LEN}
              value={quickCategory}
              onChange={(e) => setQuickCategory(e.target.value)}
              placeholder="List"
              className="w-28 px-3 py-2 min-h-[40px] text-xs bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />

            <input
              type="date"
              aria-label="Due date"
              value={quickDueDate}
              onChange={(e) => setQuickDueDate(e.target.value)}
              className="px-3 py-2 min-h-[40px] text-xs font-mono bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />

            <button
              type="button"
              onClick={() => setShowQuickNotes((prev) => !prev)}
              className={`px-3 py-2 min-h-[40px] text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                showQuickNotes
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {showQuickNotes ? 'Hide Notes' : 'Add Notes'}
            </button>

            <button
              type="submit"
              disabled={submittingQuick}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              {submittingQuick ? 'Adding...' : 'Add Task'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400">
            <span>Quick due date:</span>
            <button
              type="button"
              onClick={() => setQuickDueDate(todayIso)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                quickDueDate === todayIso
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setQuickDueDate(tomorrowIso)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                quickDueDate === tomorrowIso
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Tomorrow
            </button>
            {quickDueDate && (
              <button
                type="button"
                onClick={() => setQuickDueDate('')}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                Clear date
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <span>Creates in To Do</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => openGuideAt('creating')}
              className="text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              Add Task vs New Task guide
            </button>
          </div>
        </div>

        {showQuickNotes && (
          <textarea
            rows={2}
            maxLength={BLUEPRINT_LIMITS.TASK_DESC_MAX_LEN}
            value={quickNotes}
            onChange={(e) => setQuickNotes(e.target.value)}
            placeholder="Optional description, acceptance criteria, or links..."
            aria-label="Task notes"
            className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
          />
        )}

        {quickError && (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {quickError}
          </p>
        )}
      </form>

      {/* Undo Archive Toast */}
      {undoArchiveTask && (
        <div
          role="status"
          className="flex items-center justify-between gap-4 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-200"
        >
          <span className="truncate">
            Archived <strong className="font-medium">&ldquo;{undoArchiveTask.title}&rdquo;</strong>
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => void handleUndoArchive()}
              className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Undo
            </button>
            <button
              type="button"
              onClick={() => setUndoArchiveTask(null)}
              aria-label="Dismiss notification"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Toolbar: Status Tabs + Smart Focus + Filters + View Mode */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented Status Filter (when in list mode) */}
          {viewMode === 'list' && (
            <div
              role="tablist"
              aria-label="Filter tasks by status"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
            >
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'todo', label: 'To Do' },
                  { key: 'in_progress', label: 'In Progress' },
                  { key: 'done', label: 'Done' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === tab.key
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Smart Focus Segmented Pills */}
          <div
            role="group"
            aria-label="Smart focus presets"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {(
              [
                { id: 'all', label: 'Everything' },
                { id: 'due_soon', label: `Due Soon (${counts.dueSoon})` },
                { id: 'high_priority', label: `Urgent & High (${counts.highPriority})` },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSmartFocus(preset.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  smartFocus === preset.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filters, Sort, Bulk Select & View Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'all' | TaskPriority)}
            className="px-3 py-1.5 min-h-[36px] text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            aria-label="Filter by list"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 min-h-[36px] text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All lists</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <div className="relative flex items-center">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" aria-hidden="true" />
            <select
              aria-label="Sort tasks"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="pl-8 pr-3 py-1.5 min-h-[36px] text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="updated">Sort: Recently synced</option>
              <option value="due">Sort: Due date</option>
              <option value="priority">Sort: Priority</option>
              <option value="created_desc">Sort: Creation date (newest)</option>
              <option value="created_asc">Sort: Creation date (oldest)</option>
            </select>
          </div>

          {viewMode === 'list' && filteredTasks.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectMode((prev) => !prev);
                setSelectedIds([]);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                selectMode
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              {selectMode ? 'Cancel Select' : 'Select'}
            </button>
          )}

          {/* List vs Board Switcher */}
          <div
            role="group"
            aria-label="Task layout view"
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shrink-0"
          >
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              List
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('board');
                setSelectMode(false);
                setSelectedIds([]);
              }}
              aria-label="Board view"
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'board'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Board
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar when selecting tasks */}
      {selectMode && viewMode === 'list' && filteredTasks.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleAllVisible}
              className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {validSelectedIds.length === filteredTasks.length ? 'Deselect all' : `Select all (${filteredTasks.length})`}
            </button>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {validSelectedIds.length} selected
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={validSelectedIds.length === 0 || bulkBusy}
              onClick={() => void handleBulkStatus('in_progress')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-md transition-colors"
            >
              Mark In Progress
            </button>
            <button
              type="button"
              disabled={validSelectedIds.length === 0 || bulkBusy}
              onClick={() => void handleBulkStatus('done')}
              className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-md transition-colors"
            >
              Mark Done
            </button>
            <button
              type="button"
              disabled={validSelectedIds.length === 0 || bulkBusy}
              onClick={() => void handleBulkArchive()}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 rounded-md transition-colors"
            >
              Archive Selected
            </button>
          </div>
        </div>
      )}

      {/* Task Content Area: List or Board View */}
      {loadingTasks ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="px-5 py-4 flex items-center gap-4">
              <div className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-800/60 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {counts.total === 0 ? 'No active tasks in your workspace' : 'No tasks match your active filters'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {counts.total === 0
              ? 'Create a task above or open the detailed editor to begin syncing across devices.'
              : 'Try clearing the search query or resetting active filters.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {counts.total === 0 || !hasActiveFilters ? (
              <button
                type="button"
                onClick={() => onOpenEditor(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Create First Task
              </button>
            ) : (
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-4 py-2 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'board' ? (
        /* 3-Column Board View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {(
            [
              { status: 'todo', title: 'To Do', nextStatus: 'in_progress', nextLabel: 'Start' },
              { status: 'in_progress', title: 'In Progress', nextStatus: 'done', nextLabel: 'Complete' },
              { status: 'done', title: 'Done', nextStatus: 'todo', nextLabel: 'Reopen' },
            ] as const
          ).map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.status);
            return (
              <section
                key={col.status}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-display">
                    {col.title}
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {colTasks.length}
                  </span>
                </div>

                {colTasks.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    No tasks in {col.title}
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {colTasks.map((task) => {
                      const pInfo = PRIORITY_CHIP[task.priority] ?? PRIORITY_CHIP.medium;
                      const PriorityIcon = pInfo.Icon;
                      const dueMeta = getDueDateMeta(task.dueDate, task.status, todayIso);
                      const isDone = task.status === 'done';

                      return (
                        <li key={task.id} className="p-4 space-y-2.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`text-sm font-medium break-words ${
                                isDone
                                  ? 'line-through text-slate-400 dark:text-slate-500'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {task.title}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border whitespace-nowrap shrink-0 ${pInfo.chipClassName}`}
                            >
                              <PriorityIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>{pInfo.text}</span>
                            </span>
                          </div>

                          {task.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                              {task.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>{task.category}</span>
                            {dueMeta && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className={`font-mono tabular-nums ${dueMeta.toneClass}`}>{dueMeta.label}</span>
                              </>
                            )}
                          </div>

                          <div className="pt-1 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => void onUpdateStatus(task.id, col.nextStatus)}
                              className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-md transition-colors whitespace-nowrap"
                            >
                              {col.nextLabel}
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onOpenEditor(task)}
                                aria-label={`Edit ${task.title}`}
                                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleArchiveWithUndo(task)}
                                aria-label={`Archive ${task.title}`}
                                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md transition-colors"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTasks.map((task) => {
              const isDone = task.status === 'done';
              const isInProgress = task.status === 'in_progress';
              const pInfo = PRIORITY_CHIP[task.priority] ?? PRIORITY_CHIP.medium;
              const PriorityIcon = pInfo.Icon;
              const dueMeta = getDueDateMeta(task.dueDate, task.status, todayIso);
              const isSelected = validSelectedIds.includes(task.id);
              const isExpanded = Boolean(expandedIds[task.id]);

              return (
                <li
                  key={task.id}
                  className={`px-5 py-3.5 flex items-start justify-between gap-4 transition-colors ${
                    isSelected
                      ? 'bg-blue-50/50 dark:bg-blue-950/20'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectTask(task.id)}
                        aria-label={`Select "${task.title}"`}
                        className="mt-1 w-4 h-4 accent-blue-600 rounded cursor-pointer shrink-0"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => void onUpdateStatus(task.id, isDone ? 'todo' : 'done')}
                      aria-label={isDone ? `Mark "${task.title}" as To Do` : `Mark "${task.title}" as Done`}
                      className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                        isDone
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : isInProgress
                            ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                            : 'border-slate-300 dark:border-slate-600 text-transparent hover:border-blue-600'
                      }`}
                    >
                      {isDone ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : isInProgress ? (
                        <Clock className="w-3 h-3" />
                      ) : (
                        <Circle className="w-3 h-3" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-medium break-words ${
                            isDone
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {task.title}
                        </span>
                        <span
                          aria-label={`Priority: ${pInfo.text}`}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border whitespace-nowrap shrink-0 ${pInfo.chipClassName} ${
                            isDone ? 'opacity-60' : ''
                          }`}
                        >
                          <PriorityIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span>{pInfo.text}</span>
                        </span>
                      </div>

                      {task.description && (
                        <div className="mt-0.5">
                          <p
                            className={`text-xs text-slate-500 dark:text-slate-400 whitespace-pre-line ${
                              isExpanded ? '' : 'line-clamp-1'
                            }`}
                          >
                            {task.description}
                          </p>
                          {task.description.length > 90 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedIds((prev) => ({ ...prev, [task.id]: !prev[task.id] }))
                              }
                              className="mt-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {isExpanded ? 'Show less' : 'Show full notes'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Unboxed Metadata Line */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>{STATUS_LABEL[task.status]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{task.category}</span>
                        {dueMeta && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className={`font-mono tabular-nums ${dueMeta.toneClass}`}>{dueMeta.label}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{task.updatedByDevice}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatRelativeTime(task.updatedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      aria-label={`Change status for ${task.title}`}
                      value={task.status}
                      onChange={(e) => void onUpdateStatus(task.id, e.target.value as TaskStatus)}
                      className="hidden sm:block px-2 py-1 text-xs bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => onOpenEditor(task)}
                      aria-label={`Edit ${task.title}`}
                      title="Edit task"
                      className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleArchiveWithUndo(task)}
                      aria-label={`Archive ${task.title}`}
                      title="Archive task"
                      className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <Archive className="w-4 h-4" />
                    </button>

                    {confirmDeleteId === task.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(null);
                            void onDeleteTask(task.id);
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md whitespace-nowrap"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(task.id)}
                        aria-label={`Delete ${task.title}`}
                        className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
