import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, RotateCcw, X } from 'lucide-react';
import { useLanguage } from '@/src/lib/i18n';
import { BLUEPRINT_LIMITS, validateTaskTitle } from '@/src/lib/validation';
import type { TaskDraft, TaskItem, TaskPriority, TaskStatus } from '@/src/types/app';

interface TaskEditorModalProps {
  isOpen: boolean;
  editingTask: TaskItem | null;
  categories: string[];
  onClose: () => void;
  onSave: (draft: TaskDraft, taskId?: string) => Promise<void>;
}

const DEFAULT_DRAFT: TaskDraft = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  category: 'General',
  dueDate: '',
};

const VALID_STATUSES: ReadonlyArray<TaskStatus> = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES: ReadonlyArray<TaskPriority> = ['low', 'medium', 'high', 'urgent'];

function getDraftStorageKey(taskId?: string): string {
  return taskId ? `cadence_task_draft_${taskId}` : 'cadence_task_draft_new';
}

function getBaseDraft(editingTask: TaskItem | null): TaskDraft {
  if (!editingTask) return DEFAULT_DRAFT;
  return {
    title: editingTask.title,
    description: editingTask.description,
    status: editingTask.status,
    priority: editingTask.priority,
    category: editingTask.category,
    dueDate: editingTask.dueDate,
  };
}

function draftsEqual(a: TaskDraft, b: TaskDraft): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.status === b.status &&
    a.priority === b.priority &&
    a.category === b.category &&
    a.dueDate === b.dueDate
  );
}

function loadSavedDraft(storageKey: string): TaskDraft | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TaskDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      title: typeof parsed.title === 'string' ? parsed.title.slice(0, BLUEPRINT_LIMITS.TASK_TITLE_MAX_LEN) : '',
      description:
        typeof parsed.description === 'string' ? parsed.description.slice(0, BLUEPRINT_LIMITS.TASK_DESC_MAX_LEN) : '',
      status: VALID_STATUSES.includes(parsed.status as TaskStatus) ? (parsed.status as TaskStatus) : 'todo',
      priority: VALID_PRIORITIES.includes(parsed.priority as TaskPriority)
        ? (parsed.priority as TaskPriority)
        : 'medium',
      category:
        typeof parsed.category === 'string' && parsed.category.trim().length > 0
          ? parsed.category.slice(0, BLUEPRINT_LIMITS.TASK_CATEGORY_MAX_LEN)
          : 'General',
      dueDate: typeof parsed.dueDate === 'string' ? parsed.dueDate.slice(0, BLUEPRINT_LIMITS.TASK_DUE_DATE_MAX_LEN) : '',
    };
  } catch {
    return null;
  }
}

export const TaskEditorModal: React.FC<TaskEditorModalProps> = ({
  isOpen,
  editingTask,
  categories,
  onClose,
  onSave,
}) => {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<TaskDraft>(DEFAULT_DRAFT);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const initializedKeyRef = useRef<string | null>(null);

  const storageKey = getDraftStorageKey(editingTask?.id);

  // Restore draft from localStorage when opening modal
  useEffect(() => {
    if (!isOpen) {
      initializedKeyRef.current = null;
      setShowGuide(false);
      return;
    }

    setError(null);
    const base = getBaseDraft(editingTask);
    const saved = loadSavedDraft(storageKey);

    if (saved && !draftsEqual(saved, base)) {
      setDraft(saved);
      setHasSavedDraft(true);
    } else {
      setDraft(base);
      setHasSavedDraft(false);
    }
    initializedKeyRef.current = storageKey;
  }, [isOpen, editingTask, storageKey]);

  // Automatically persist changes to localStorage while open
  useEffect(() => {
    if (!isOpen || initializedKeyRef.current !== storageKey) return;
    const base = getBaseDraft(editingTask);
    try {
      if (draftsEqual(draft, base)) {
        localStorage.removeItem(storageKey);
        setHasSavedDraft(false);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(draft));
        setHasSavedDraft(true);
      }
    } catch {
      // Ignore localStorage quota/availability errors
    }
  }, [draft, isOpen, editingTask, storageKey]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDiscardDraft = () => {
    const base = getBaseDraft(editingTask);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore storage errors
    }
    setDraft(base);
    setHasSavedDraft(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateTaskTitle(draft.title);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft, editingTask?.id);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore storage errors
      }
      setHasSavedDraft(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save task.');
    } finally {
      setSaving(false);
    }
  };

  const toLocalDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayIso = toLocalDate(0);
  const tomorrowIso = toLocalDate(1);
  const nextWeekIso = toLocalDate(7);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cadence-modal-enter w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h2 id="task-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
              {editingTask ? t.editor.editTaskTitle : t.editor.newTaskTitle}
            </h2>
            {hasSavedDraft && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {t.editor.draftAutoSaved}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              aria-expanded={showGuide}
              onClick={() => setShowGuide((prev) => !prev)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                showGuide
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{showGuide ? t.editor.hideGuideBtn : t.editor.guideBtn}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showGuide && (
          <div className="cadence-panel-enter px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {t.editor.guideHeading}
            </p>
            <ul className="space-y-1 leading-relaxed">
              <li>
                <span className="font-medium text-slate-800 dark:text-slate-200">{t.editor.guideNewTaskPrefix}</span>{' '}
                {t.editor.guideNewTaskItem}
              </li>
              <li>
                <span className="font-medium text-slate-800 dark:text-slate-200">{t.editor.guideAddTaskPrefix}</span>{' '}
                {t.editor.guideAddTaskItem}
              </li>
              <li>
                <span className="font-medium text-slate-800 dark:text-slate-200">{t.editor.guideDraftPrefix}</span>{' '}
                {t.editor.guideDraftItem}
              </li>
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="task-title-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.editor.titleLabel}
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {draft.title.length}/{BLUEPRINT_LIMITS.TASK_TITLE_MAX_LEN}
              </span>
            </div>
            <input
              id="task-title-input"
              type="text"
              autoFocus
              maxLength={BLUEPRINT_LIMITS.TASK_TITLE_MAX_LEN}
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
              placeholder={t.editor.titlePlaceholder}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="task-desc-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.editor.notesLabel}
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {draft.description.length}/{BLUEPRINT_LIMITS.TASK_DESC_MAX_LEN}
              </span>
            </div>
            <textarea
              id="task-desc-input"
              rows={3}
              maxLength={BLUEPRINT_LIMITS.TASK_DESC_MAX_LEN}
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={t.editor.notesPlaceholder}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="task-status-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.editor.statusLabel}
              </label>
              <select
                id="task-status-select"
                value={draft.status}
                onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as TaskStatus }))}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="todo">{t.status.todo}</option>
                <option value="in_progress">{t.status.in_progress}</option>
                <option value="done">{t.status.done}</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-priority-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.editor.priorityLabel}
              </label>
              <select
                id="task-priority-select"
                value={draft.priority}
                onChange={(e) => setDraft((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="low">{t.priority.low}</option>
                <option value="medium">{t.priority.medium}</option>
                <option value="high">{t.priority.high}</option>
                <option value="urgent">{t.priority.urgent}</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-category-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.editor.workspaceListLabel}
              </label>
              <input
                id="task-category-input"
                type="text"
                list="cadence-categories"
                maxLength={BLUEPRINT_LIMITS.TASK_CATEGORY_MAX_LEN}
                value={draft.category}
                onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <datalist id="cadence-categories">
                {categories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="task-due-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.editor.dueDateLabel}
              </label>
              <input
                id="task-due-input"
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, dueDate: todayIso }))}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    draft.dueDate === todayIso
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {t.tasks.today}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, dueDate: tomorrowIso }))}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    draft.dueDate === tomorrowIso
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {t.tasks.tomorrow}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, dueDate: nextWeekIso }))}
                  className={`px-2 py-0.5 rounded border transition-colors font-mono ${
                    draft.dueDate === nextWeekIso
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {t.editor.nextWeekBtn}
                </button>
                {draft.dueDate && (
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, dueDate: '' }))}
                    className="px-1.5 py-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {t.tasks.clearDate}
                  </button>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t.editor.draftEscHintBefore}{' '}
            <kbd className="px-1 py-0.5 font-mono text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
              Esc
            </kbd>{' '}
            {t.editor.draftEscHintAfter}
          </p>

          <div className="pt-1 flex items-center justify-between gap-3">
            <div>
              {hasSavedDraft && (
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t.editor.discardDraft}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
              >
                {t.editor.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {saving ? t.editor.saving : editingTask ? t.editor.saveChanges : t.editor.createTask}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
