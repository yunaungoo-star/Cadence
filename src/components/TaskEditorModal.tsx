import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, RotateCcw, X } from 'lucide-react';
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h2 id="task-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
              {editingTask ? 'Edit Task' : 'New Task'}
            </h2>
            {hasSavedDraft && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Draft auto-saved
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
              <span>{showGuide ? 'Hide Guide' : 'Guide'}</span>
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
          <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-slate-100">
              End-User Guide · New Task vs Add Task
            </p>
            <ul className="space-y-1 leading-relaxed">
              <li>
                <span className="font-medium text-slate-800 dark:text-slate-200">New Task (this editor):</span> Set
                starting Status (<span className="font-medium">To Do</span>,{' '}
                <span className="font-medium">In Progress</span>, or <span className="font-medium">Done</span>), pick an
                existing Workspace List, and write full notes up to 2,000 characters.
              </li>
              <li>
                <span className="font-medium text-slate-800 dark:text-slate-200">Add Task (Tasks page bar):</span> Use
                the inline bar above your task list for fast 1-line capture with{' '}
                <span className="font-medium">Today</span> / <span className="font-medium">Tomorrow</span> quick dates.
              </li>
              <li>
                <span className="font-medium text-slate-800 dark:text-slate-200">Automatic Draft Safety:</span>{' '}
                Unsaved changes save locally in your browser. Closing or refreshing restores your work; click{' '}
                <span className="font-medium">Discard draft</span> to reset.
              </li>
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="task-title-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Title
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
              placeholder="e.g., Audit production memory spikes before release"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="task-desc-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Notes
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
              placeholder="Optional implementation notes or checklist details"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="task-status-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Status
              </label>
              <select
                id="task-status-select"
                value={draft.status}
                onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as TaskStatus }))}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-priority-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Priority
              </label>
              <select
                id="task-priority-select"
                value={draft.priority}
                onChange={(e) => setDraft((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-category-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Workspace List
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
                Due Date
              </label>
              <input
                id="task-due-input"
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Drafts auto-save locally in your browser. Press{' '}
            <kbd className="px-1 py-0.5 font-mono text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
              Esc
            </kbd>{' '}
            to close safely without losing edits.
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
                  Discard draft
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {saving ? 'Saving...' : editingTask ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
