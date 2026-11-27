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
import { useLanguage } from '@/src/lib/i18n';

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
  const { t } = useLanguage();

  return (
    <section
      aria-label="Tasks page end-user guide"
      className="cadence-panel-enter bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Guide Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              {t.guide.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.guide.subtitle}
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
                { id: 'creating', label: t.guide.tabCreating },
                { id: 'tools', label: t.guide.tabTools },
                { id: 'shortcuts', label: t.guide.tabShortcuts },
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
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                  {t.guide.addTitle}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t.guide.addSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={onFocusAddTask}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <span>{t.guide.tryAddTask}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{t.guide.addStep1Title}</span>{' '}
                {t.guide.addStep1Body}
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{t.guide.addStep2Title}</span>{' '}
                {t.guide.addStep2Body}
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{t.guide.addStep3Title}</span>{' '}
                {t.guide.addStep3Body}
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{t.guide.addStep4Title}</span>{' '}
                {t.guide.addStep4Body}
              </li>
            </ol>
          </div>

          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
                  {t.guide.newTitle}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t.guide.newSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenNewTaskModal}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.guide.openNewTask}</span>
              </button>
            </div>

            <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{t.guide.newStep1Title}</span>{' '}
                {t.guide.newStep1Body}
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{t.guide.newStep2Title}</span>{' '}
                {t.guide.newStep2Body}
              </li>
              <li>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{t.guide.newStep3Title}</span>{' '}
                {t.guide.newStep3Body}
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
              <span>{t.guide.toolSearchTitle}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.guide.toolSearchDesc}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>{t.guide.toolFilterTitle}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.guide.toolFilterDesc}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Columns3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>{t.guide.toolViewsTitle}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.guide.toolViewsDesc}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <CheckSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>{t.guide.toolBulkTitle}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.guide.toolBulkDesc}
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
              <span>{t.guide.shortcutsTitle}</span>
            </div>
            <dl className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center justify-between gap-4">
                <dt>{t.guide.shortcutSearch}</dt>
                <dd>
                  <kbd className="px-1.5 py-0.5 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                    /
                  </kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>{t.guide.shortcutEnter}</dt>
                <dd>
                  <kbd className="px-1.5 py-0.5 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                    Enter
                  </kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>{t.guide.shortcutEsc}</dt>
                <dd>
                  <kbd className="px-1.5 py-0.5 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                    Esc
                  </kbd>
                </dd>
              </div>
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                {t.guide.dueAlertSummary}
              </div>
            </dl>
          </div>

          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <span>{t.guide.syncTitle}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.guide.syncDesc1}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t.guide.syncDesc2}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
