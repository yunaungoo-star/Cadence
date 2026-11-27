import React from 'react';
import { formatRelativeTime } from '@/src/lib/formatters';
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
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-display tracking-tight">
            Real-Time Sync Log
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Chronological record of task updates synchronized via Firestore across your devices.
          </p>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
          State: {syncState === 'synced' ? 'Connected & Synced' : syncState === 'syncing' ? 'Syncing' : syncState === 'offline' ? 'Offline' : 'Signed Out'}
          {lastSyncedAt && ` · ${lastSyncedAt.toLocaleTimeString()}`}
        </div>
      </div>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {!userSignedIn ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Sign in to view cross-device sync events
            </p>
            <button
              type="button"
              onClick={() => void onSignIn()}
              className="mt-4 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
            >
              Sign in with Google
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-6 py-12 text-center text-xs text-slate-500 dark:text-slate-400">
            No task synchronization events recorded yet. Create or update a task to see real-time replication metadata.
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
                    Updated by <span className="text-slate-700 dark:text-slate-300 font-medium">{task.updatedByDevice}</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>Status: {task.status === 'done' ? 'Done' : task.status === 'in_progress' ? 'In Progress' : 'To Do'}</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>{task.category}</span>
                  </div>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                  {task.updatedAt ? `${task.updatedAt.toLocaleTimeString()} (${formatRelativeTime(task.updatedAt)})` : 'Pending write'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
