import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckSquare,
  Columns3,
  Keyboard,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';

export type TasksGuideTab = 'creating' | 'tools' | 'shortcuts';

interface TasksGuidePanelProps {
  activeTab: TasksGuideTab;
  onSelectTab: (tab: TasksGuideTab) => void;
  onClose: () => void;
  onFocusAddTask: () => void;
  onOpenNewTaskModal: () => void;
}

export const TasksGuidePanel: React.FC<TasksGuidePanelProps> = ({
  activeTab,
  onSelectTab,
  onClose,
  onFocusAddTask,
  onOpenNewTaskModal,
}) => {
  return (
    <section
      aria-label="Tasks page end-user guide"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Guide Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              Tasks Workspace End-User Guide
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              How to capture tasks with Add Task or New Task and organize your synced workflow
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          <div
            role="tablist"
            aria-label="Tasks user guide sections"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            {(
              [
                { id: 'creating', label: 'New Task & Add Task' },
                { id: 'tools', label: 'Workspace Tools' },
                { id: 'shortcuts', label: 'Shortcuts & Sync' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close tasks user guide"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab 1: New Task vs Add Task */}
      {activeTab === 'creating' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          {/* Add Task Quick Bar */}
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                  01. Using &ldquo;Add Task&rdquo; (Quick-Add Bar)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Best for rapid capture directly inside the Tasks page without opening a dialog.
                </p>
              </div>
              <button
                type="button"
                onClick={onFocusAddTask}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <span>Try Add Task</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">1. Enter a title:</span> Type your
                task in the inline composer (up to 140 characters).
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">2. Set quick metadata:</span> Pick a
                Priority (<span className="font-medium">Low</span> to <span className="font-medium">Urgent</span>), type a
                List name (defaults to <span className="font-mono">General</span>), and click{' '}
                <span className="font-medium">Today</span>, <span className="font-medium">Tomorrow</span>, or the calendar
                picker.
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">3. Optional notes:</span> Click{' '}
                <span className="font-medium">Add Notes</span> to reveal the inline description field before submitting.
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">4. Save instantly:</span> Click{' '}
                <span className="font-medium">Add Task</span> or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                  Enter
                </kbd>{' '}
                to create it in <span className="font-medium">To Do</span> and sync across all devices.
              </li>
            </ol>
          </div>

          {/* New Task Modal */}
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                  02. Using &ldquo;New Task&rdquo; (Full Editor Modal)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Best for detailed tasks from any tab, setting initial status, or crash-safe draft writing.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenNewTaskModal}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Open New Task</span>
              </button>
            </div>

            <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">1. Open from anywhere:</span> Click{' '}
                <span className="font-medium">New Task</span> in the top navigation bar even while viewing System Monitor,
                Devices, or Security.
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">2. Full field control:</span> Choose the
                starting Status (<span className="font-medium">To Do</span>,{' '}
                <span className="font-medium">In Progress</span>, or <span className="font-medium">Done</span>), pick an
                existing Workspace List from autocomplete, and write multi-line Notes (up to 2,000 characters).
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">3. Automatic draft recovery:</span>{' '}
                Changes are saved locally in real time (<span className="font-medium">Draft auto-saved</span>). If you
                refresh or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                  Esc
                </kbd>
                , your draft restores next time you open <span className="font-medium">New Task</span>—or use{' '}
                <span className="font-medium">Discard draft</span> to clear it.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Tab 2: Workspace Tools */}
      {activeTab === 'tools' && (
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>Real-Time Search & Focus</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Filter tasks instantly by title, notes, or list name. Click{' '}
              <span className="font-medium">Schedule Focus</span> in the overview strip or the{' '}
              <span className="font-medium">Due Soon</span> / <span className="font-medium">Urgent &amp; High</span>{' '}
              presets to isolate time-critical work.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>Filter & Sort Controls</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Combine status tabs with Priority and List dropdowns. Sort your active queue by{' '}
              <span className="font-medium">Recently synced</span>, <span className="font-medium">Due date</span>,{' '}
              <span className="font-medium">Priority</span>, or <span className="font-medium">Creation date</span>.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Columns3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>List & Board Views</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Use <span className="font-medium">List</span> view for compact metadata, inline status selectors, and
              expandable long notes—or switch to <span className="font-medium">Board</span> view for a 3-column{' '}
              <span className="font-medium">To Do / In Progress / Done</span> workflow with one-click{' '}
              <span className="font-medium">Start</span> and <span className="font-medium">Complete</span> actions.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <CheckSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>Bulk Actions &amp; Hardware Tools</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Use <span className="font-medium">Select</span> in List view for bulk updates or safe archive with{' '}
              <span className="font-medium">Undo</span>. Open <span className="font-medium">Hardware Tools</span> in the
              header to inspect live CPU/RAM/disk metrics, tune alert guards, copy diagnostics, or log hardware tasks.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Shortcuts & Sync */}
      {activeTab === 'shortcuts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Keyboard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>Keyboard Shortcuts & Date Alerts</span>
            </div>
            <dl className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center justify-between gap-4">
                <dt>Focus task search bar</dt>
                <dd>
                  <kbd className="px-1.5 py-0.5 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                    /
                  </kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>Submit task from Add Task title input</dt>
                <dd>
                  <kbd className="px-1.5 py-0.5 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                    Enter
                  </kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>Close New Task / Edit Task modal (keeps draft)</dt>
                <dd>
                  <kbd className="px-1.5 py-0.5 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                    Esc
                  </kbd>
                </dd>
              </div>
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                Due dates automatically highlight <span className="text-red-600 dark:text-red-400 font-medium">Overdue</span>,{' '}
                <span className="text-amber-600 dark:text-amber-400 font-medium">Due today</span>, and{' '}
                <span className="text-blue-600 dark:text-blue-400 font-medium">Due tomorrow</span> for unfinished tasks.
              </div>
            </dl>
          </div>

          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Real-Time Cloud Sync & Privacy</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Every task created via <span className="font-medium">Add Task</span> or{' '}
              <span className="font-medium">New Task</span> is stored under your signed-in Google account with
              owner-isolated Firestore rules and stamped with the device name that last updated it.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              If your connection drops, the sync indicator switches to{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">Offline · Queuing local edits</span> and
              automatically reconciles pending updates once your device reconnects.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
