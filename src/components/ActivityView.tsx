import React from 'react';
import { formatRelativeTime } from '@/src/lib/formatters';
import { useLanguage } from '@/src/lib/i18n';
import type { SyncConnectionState, TaskItem } from '@/src/types/app';

interface ActivityViewProps {
  userSignedIn: boolean;
  tasks: TaskItem[];
  syncState: SyncConnectionState;
  lastSyncedAt: Date | null;
  onSignIn: () => Promise<void>;
}

export const ActivityView: React.FC<ActivityViewProps> = ({
  userSignedIn,
  tasks,
  syncState,
  lastSyncedAt,
  onSignIn,
}) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-display tracking-tight">
            {t.activity.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t.activity.subtitle}
          </p>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
          {t.activity.statePrefix}{' '}
          {syncState === 'synced'
            ? t.activity.connectedSynced
            : syncState === 'syncing'
              ? t.activity.syncing
              : syncState === 'offline'
                ? t.activity.offline
                : t.activity.signedOut}
          {lastSyncedAt && ` · ${lastSyncedAt.toLocaleTimeString()}`}
        </div>
      </div>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {!userSignedIn ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {t.activity.signInPrompt}
            </p>
            <button
              type="button"
              onClick={() => void onSignIn()}
              className="mt-4 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
            >
              {t.nav.signInGoogle}
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-6 py-12 text-center text-xs text-slate-500 dark:text-slate-400">
            {t.activity.empty}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.map((task) => (
              <li key={task.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {task.title}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {t.activity.updatedBy}{' '}
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{task.updatedByDevice}</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>
                      {t.editor.statusLabel}: {t.status[task.status]}
                    </span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>{task.category}</span>
                  </div>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                  {task.updatedAt
                    ? `${task.updatedAt.toLocaleTimeString()} (${formatRelativeTime(task.updatedAt)})`
                    : t.activity.pendingWrite}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
