import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  FolderInput,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Trash2,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from 'lucide-react';
import { formatRelativeTime } from '@/src/lib/formatters';
import { useLanguage } from '@/src/lib/i18n';
import { BLUEPRINT_LIMITS } from '@/src/lib/validation';
import type { TaskDraft, TaskItem, TaskPriority, TaskStatus } from '@/src/types/app';

export type WorkspaceToolTab = 'timer' | 'io' | 'archive';

export interface FocusTimerController {
  durationMinutes: number;
  secondsLeft: number;
  formattedTime: string;
  isRunning: boolean;
  isMidSession: boolean;
  progressPct: number;
  linkedTaskId: string;
  setLinkedTaskId: (id: string) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  sessionsToday: number;
  justCompleted: boolean;
  selectPreset: (minutes: number) => void;
  toggleRun: () => void;
  reset: () => void;
}

interface WorkspaceToolsPanelProps {
  tasks: TaskItem[];
  filteredTasks: TaskItem[];
  categories: string[];
  focusTimer: FocusTimerController;
  onCreateTask: (draft: TaskDraft) => Promise<void>;
  onUpdateStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onToggleArchive: (taskId: string, archived: boolean) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onClose: () => void;
}

function escapeCsvCell(value: string): string {
  const safe = value.replace(/\r?\n/g, ' ');
  if (/[",]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function parseChecklistLines(raw: string): Array<{ title: string; status: TaskStatus }> {
  const lines = raw.split(/\r?\n/);
  const parsed: Array<{ title: string; status: TaskStatus }> = [];

  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;

    let status: TaskStatus = 'todo';
    const doneMatch = /^[-*•]?\s*\[[xX]\]\s+(.+)$/.exec(trimmed);
    const todoBoxMatch = /^[-*•]?\s*\[\s?\]\s+(.+)$/.exec(trimmed);
    const bulletMatch = /^([-*•]|\d+[.)])\s+(.+)$/.exec(trimmed);

    if (doneMatch) {
      status = 'done';
      trimmed = doneMatch[1].trim();
    } else if (todoBoxMatch) {
      trimmed = todoBoxMatch[1].trim();
    } else if (bulletMatch) {
      trimmed = bulletMatch[2].trim();
    }

    if (!trimmed) continue;
    parsed.push({
      title: trimmed.slice(0, BLUEPRINT_LIMITS.TASK_TITLE_MAX_LEN),
      status,
    });
  }

  return parsed.slice(0, 40);
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const WorkspaceToolsPanel: React.FC<WorkspaceToolsPanelProps> = ({
  tasks,
  filteredTasks,
  categories,
  focusTimer,
  onCreateTask,
  onUpdateStatus,
  onToggleArchive,
  onDeleteTask,
  onClose,
}) => {
  const { t } = useLanguage();
  const [activeTool, setActiveTool] = useState<WorkspaceToolTab>('timer');

  // Export & Import state
  const [exportScope, setExportScope] = useState<'filtered' | 'all'>('filtered');
  const [copiedMd, setCopiedMd] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPriority, setImportPriority] = useState<TaskPriority>('medium');
  const [importCategory, setImportCategory] = useState('General');
  const [importing, setImporting] = useState(false);
  const [ioNotice, setIoNotice] = useState<string | null>(null);

  // Archive & Cleanup state
  const [archivingDone, setArchivingDone] = useState(false);
  const [busyArchiveId, setBusyArchiveId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);

  const activeTasks = useMemo(() => tasks.filter((item) => !item.archived), [tasks]);
  const openTasks = useMemo(
    () => activeTasks.filter((item) => item.status !== 'done'),
    [activeTasks]
  );
  const doneTasks = useMemo(
    () => activeTasks.filter((item) => item.status === 'done'),
    [activeTasks]
  );
  const archivedTasks = useMemo(() => tasks.filter((item) => item.archived), [tasks]);

  const linkedTask = useMemo(
    () => activeTasks.find((item) => item.id === focusTimer.linkedTaskId) ?? null,
    [activeTasks, focusTimer.linkedTaskId]
  );

  const exportTasks = exportScope === 'filtered' ? filteredTasks : activeTasks;

  const parsedImportItems = useMemo(() => parseChecklistLines(importText), [importText]);

  const buildMarkdown = (list: TaskItem[]): string => {
    const header = `# Cadence Tasks (${list.length})\n\n`;
    const rows = list.map((item) => {
      const box = item.status === 'done' ? '[x]' : '[ ]';
      const meta = [item.priority.toUpperCase(), item.category, item.dueDate ? `due ${item.dueDate}` : '']
        .filter(Boolean)
        .join(' · ');
      const notes = item.description ? `\n  ${item.description.replace(/\r?\n/g, '\n  ')}` : '';
      return `- ${box} **${item.title}** (${meta})${notes}`;
    });
    return header + rows.join('\n');
  };

  const handleCopyMarkdown = async () => {
    const md = buildMarkdown(exportTasks);
    try {
      await navigator.clipboard.writeText(md);
      setCopiedMd(true);
      window.setTimeout(() => setCopiedMd(false), 2200);
    } catch {
      setIoNotice('Clipboard write is unavailable in this browser context.');
    }
  };

  const handleDownloadMd = () => {
    triggerDownload(
      `cadence-tasks-${new Date().toISOString().slice(0, 10)}.md`,
      buildMarkdown(exportTasks),
      'text/markdown;charset=utf-8'
    );
  };

  const handleDownloadCsv = () => {
    const headers = ['Title', 'Status', 'Priority', 'List', 'Due Date', 'Notes', 'Updated By Device'];
    const lines = [headers.join(',')];
    for (const item of exportTasks) {
      lines.push(
        [
          escapeCsvCell(item.title),
          escapeCsvCell(item.status),
          escapeCsvCell(item.priority),
          escapeCsvCell(item.category),
          escapeCsvCell(item.dueDate || ''),
          escapeCsvCell(item.description || ''),
          escapeCsvCell(item.updatedByDevice || ''),
        ].join(',')
      );
    }
    triggerDownload(
      `cadence-tasks-${new Date().toISOString().slice(0, 10)}.csv`,
      lines.join('\n'),
      'text/csv;charset=utf-8'
    );
  };

  const handleDownloadJson = () => {
    const payload = exportTasks.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      priority: item.priority,
      category: item.category,
      dueDate: item.dueDate,
      updatedByDevice: item.updatedByDevice,
      createdAt: item.createdAt ? item.createdAt.toISOString() : null,
      updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
    }));
    triggerDownload(
      `cadence-tasks-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const handleBatchImport = async () => {
    if (parsedImportItems.length === 0 || importing) return;
    setImporting(true);
    setIoNotice(null);
    const category = importCategory.trim() || 'General';
    try {
      for (const entry of parsedImportItems) {
        await onCreateTask({
          title: entry.title,
          description: '',
          status: entry.status,
          priority: importPriority,
          category,
          dueDate: '',
        });
      }
      setIoNotice(`${t.workspaceTools.importSuccessPrefix} ${parsedImportItems.length} ${t.workspaceTools.importSuccessSuffix}`);
      setImportText('');
    } finally {
      setImporting(false);
    }
  };

  const handleArchiveAllDone = async () => {
    if (doneTasks.length === 0 || archivingDone) return;
    setArchivingDone(true);
    setArchiveNotice(null);
    try {
      await Promise.all(doneTasks.map((item) => onToggleArchive(item.id, true)));
      setArchiveNotice(
        `${t.workspaceTools.archivedSuccessPrefix} ${doneTasks.length} ${t.workspaceTools.archivedSuccessSuffix}`
      );
    } finally {
      setArchivingDone(false);
    }
  };

  const handleRestoreTask = async (taskId: string) => {
    setBusyArchiveId(taskId);
    setArchiveNotice(null);
    try {
      await onToggleArchive(taskId, false);
      setArchiveNotice(t.workspaceTools.restoredNotice);
    } finally {
      setBusyArchiveId(null);
    }
  };

  const handleDeleteForever = async (taskId: string) => {
    setBusyArchiveId(taskId);
    try {
      await onDeleteTask(taskId);
      setConfirmDeleteId(null);
    } finally {
      setBusyArchiveId(null);
    }
  };

  const presets = [
    { minutes: 15, label: '15m' },
    { minutes: 25, label: '25m' },
    { minutes: 45, label: '45m' },
    { minutes: 5, label: t.workspaceTools.breakLabel },
  ];

  return (
    <section
      aria-label={t.workspaceTools.title}
      className="cadence-panel-enter bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5"
    >
      {/* Header & Tool Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-2.5 min-w-0">
          <Wrench className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-1" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              {t.workspaceTools.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t.workspaceTools.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between lg:justify-end gap-2 shrink-0">
          <div
            role="tablist"
            aria-label={t.workspaceTools.title}
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTool === 'timer'}
              onClick={() => setActiveTool('timer')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTool === 'timer'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              <span>{t.workspaceTools.tabTimer}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTool === 'io'}
              onClick={() => setActiveTool('io')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTool === 'io'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span>{t.workspaceTools.tabIo}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTool === 'archive'}
              onClick={() => setActiveTool('archive')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTool === 'archive'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{t.workspaceTools.tabArchive}</span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500">
                ({archivedTasks.length})
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close workspace tools"
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tool 1: Focus Timer */}
      {activeTool === 'timer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t.workspaceTools.presetsLabel}
              </span>
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                {presets.map((preset) => {
                  const selected = focusTimer.durationMinutes === preset.minutes;
                  return (
                    <button
                      key={preset.minutes}
                      type="button"
                      onClick={() => focusTimer.selectPreset(preset.minutes)}
                      className={`px-2.5 py-1 text-xs font-medium font-mono tabular-nums rounded-md transition-colors whitespace-nowrap ${
                        selected
                          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-xl space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <div className="text-4xl font-semibold font-mono tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
                  {focusTimer.formattedTime}
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {t.workspaceTools.sessionsTodayLabel}: {focusTimer.sessionsToday}
                </div>
              </div>

              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
                  style={{ width: `${focusTimer.progressPct}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={focusTimer.toggleRun}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  {focusTimer.isRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      {t.workspaceTools.pauseBtn}
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      {focusTimer.isMidSession ? t.workspaceTools.resumeBtn : t.workspaceTools.startBtn}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={focusTimer.reset}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t.workspaceTools.resetBtn}
                </button>

                <button
                  type="button"
                  onClick={focusTimer.toggleSound}
                  aria-pressed={focusTimer.soundEnabled}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap ml-auto"
                >
                  {focusTimer.soundEnabled ? (
                    <Volume2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>
                    {focusTimer.soundEnabled ? t.workspaceTools.chimeOn : t.workspaceTools.chimeOff}
                  </span>
                </button>
              </div>
            </div>

            {focusTimer.justCompleted && (
              <div
                role="status"
                className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t.workspaceTools.sessionCompletedNotice}</span>
              </div>
            )}
          </div>

          <div className="lg:col-span-6 space-y-4 lg:border-l lg:border-slate-200 lg:dark:border-slate-800 lg:pl-6">
            <div>
              <label
                htmlFor="focus-linked-task"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {t.workspaceTools.linkTaskLabel}
              </label>
              <select
                id="focus-linked-task"
                value={focusTimer.linkedTaskId}
                onChange={(e) => focusTimer.setLinkedTaskId(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">{t.workspaceTools.noLinkedTask}</option>
                {openTasks.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{t.status[item.status]}] {item.title}
                  </option>
                ))}
              </select>
            </div>

            {linkedTask && (
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl space-y-3">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {linkedTask.title}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{t.status[linkedTask.status]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t.priority[linkedTask.priority]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{linkedTask.category}</span>
                    {linkedTask.dueDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{linkedTask.dueDate}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {linkedTask.status === 'todo' && (
                    <button
                      type="button"
                      onClick={() => void onUpdateStatus(linkedTask.id, 'in_progress')}
                      className="px-3 py-1.5 min-h-[36px] text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors whitespace-nowrap"
                    >
                      {t.workspaceTools.startLinkedTask}
                    </button>
                  )}
                  {linkedTask.status !== 'done' && (
                    <button
                      type="button"
                      onClick={() => void onUpdateStatus(linkedTask.id, 'done')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {t.workspaceTools.markLinkedDone}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool 2: Import & Export */}
      {activeTool === 'io' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Export */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.workspaceTools.exportTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t.workspaceTools.exportDesc}
              </p>
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setExportScope('filtered')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  exportScope === 'filtered'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {t.workspaceTools.scopeFiltered} ({filteredTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setExportScope('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  exportScope === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {t.workspaceTools.scopeAllActive} ({activeTasks.length})
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={exportTasks.length === 0}
                onClick={() => void handleCopyMarkdown()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
              >
                {copiedMd ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedMd ? t.workspaceTools.copiedMarkdown : t.workspaceTools.copyMarkdown}</span>
              </button>

              <button
                type="button"
                disabled={exportTasks.length === 0}
                onClick={handleDownloadMd}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t.workspaceTools.downloadMd}</span>
              </button>

              <button
                type="button"
                disabled={exportTasks.length === 0}
                onClick={handleDownloadCsv}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{t.workspaceTools.downloadCsv}</span>
              </button>

              <button
                type="button"
                disabled={exportTasks.length === 0}
                onClick={handleDownloadJson}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t.workspaceTools.downloadJson}</span>
              </button>
            </div>
          </div>

          {/* Batch Import */}
          <div className="lg:col-span-7 space-y-3 lg:border-l lg:border-slate-200 lg:dark:border-slate-800 lg:pl-6">
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.workspaceTools.importTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t.workspaceTools.importDesc}
              </p>
            </div>

            <textarea
              rows={4}
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                if (ioNotice) setIoNotice(null);
              }}
              placeholder={t.workspaceTools.importPlaceholder}
              aria-label={t.workspaceTools.importTitle}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={t.workspaceTools.importPriorityLabel}
                  value={importPriority}
                  onChange={(e) => setImportPriority(e.target.value as TaskPriority)}
                  className="px-3 py-1.5 min-h-[36px] text-xs bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="low">{t.priority.low}</option>
                  <option value="medium">{t.priority.medium}</option>
                  <option value="high">{t.priority.high}</option>
                  <option value="urgent">{t.priority.urgent}</option>
                </select>

                <input
                  type="text"
                  list="cadence-import-lists"
                  aria-label={t.workspaceTools.importListLabel}
                  maxLength={BLUEPRINT_LIMITS.TASK_CATEGORY_MAX_LEN}
                  value={importCategory}
                  onChange={(e) => setImportCategory(e.target.value)}
                  className="w-32 px-3 py-1.5 min-h-[36px] text-xs bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <datalist id="cadence-import-lists">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {parsedImportItems.length} {t.workspaceTools.importReadySuffix}
                </span>
                <button
                  type="button"
                  disabled={parsedImportItems.length === 0 || importing}
                  onClick={() => void handleBatchImport()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[36px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
                >
                  <FolderInput className="w-3.5 h-3.5" />
                  {importing ? t.workspaceTools.importingBtn : t.workspaceTools.importBtn}
                </button>
              </div>
            </div>

            {ioNotice && (
              <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
                {ioNotice}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tool 3: Archive & Cleanup */}
      {activeTool === 'archive' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-950 rounded-xl">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.workspaceTools.cleanupTitle}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.workspaceTools.cleanupDesc}
              </p>
            </div>
            <button
              type="button"
              disabled={doneTasks.length === 0 || archivingDone}
              onClick={() => void handleArchiveAllDone()}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[38px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Archive className="w-3.5 h-3.5" />
              {archivingDone
                ? t.workspaceTools.archivingBtn
                : `${t.workspaceTools.archiveAllDoneBtn} (${doneTasks.length})`}
            </button>
          </div>

          {archiveNotice && (
            <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
              {archiveNotice}
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.workspaceTools.archivedListTitle} ({archivedTasks.length})
              </h3>
            </div>

            {archivedTasks.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl px-4">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.workspaceTools.noArchivedTitle}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  {t.workspaceTools.noArchivedDesc}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {archivedTasks.map((item) => {
                  const isBusy = busyArchiveId === item.id;
                  const confirming = confirmDeleteId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {item.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{item.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{t.priority[item.priority]}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatRelativeTime(item.updatedAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleRestoreTask(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[32px] text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <ArchiveRestore className="w-3.5 h-3.5" />
                          {t.workspaceTools.restoreBtn}
                        </button>

                        {confirming ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDeleteForever(item.id)}
                              className="px-2.5 py-1.5 min-h-[32px] text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap"
                            >
                              {t.workspaceTools.confirmDeleteBtn}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1.5 min-h-[32px] text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                            >
                              {t.workspaceTools.cancelBtn}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[32px] text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t.workspaceTools.deleteForeverBtn}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
