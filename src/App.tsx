/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckSquare,
  Cpu,
  Gauge,
  Laptop,
  LogOut,
  Menu,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { ActivityView } from '@/src/components/ActivityView';
import { CompactSystemWidget } from '@/src/components/CompactSystemWidget';
import { DevicesView } from '@/src/components/DevicesView';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { LiveDashboardView } from '@/src/components/LiveDashboardView';
import { SecurityScanView } from '@/src/components/SecurityScanView';
import { SystemTelemetryView } from '@/src/components/SystemTelemetryView';
import { TaskEditorModal } from '@/src/components/TaskEditorModal';
import { TasksWorkspace } from '@/src/components/TasksWorkspace';
import { useRealtimeWorkspace } from '@/src/hooks/useRealtimeWorkspace';
import { useSystemTelemetry } from '@/src/hooks/useSystemTelemetry';
import { LanguageProvider, useLanguage } from '@/src/lib/i18n';
import type { ActiveTab, TaskDraft, TaskItem } from '@/src/types/app';

const THEME_STORAGE_KEY = 'cadence_theme';

function loadInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage errors
  }
  return 'light';
}

function CadenceWorkspace() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<ActiveTab>('tasks');
  const [theme, setTheme] = useState<'light' | 'dark'>(loadInitialTheme);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

  const telemetry = useSystemTelemetry();
  const workspace = useRealtimeWorkspace();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
        return;
      }
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || editorOpen || !workspace.user) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      setEditingTask(null);
      setEditorOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen, editorOpen, workspace.user]);

  const categories = useMemo(() => {
    const base = new Set(['General', 'Engineering', 'Operations', 'Personal']);
    for (const task of workspace.tasks) {
      if (task.category) base.add(task.category);
    }
    return Array.from(base).sort((a, b) => a.localeCompare(b));
  }, [workspace.tasks]);

  const handleOpenEditor = (task: TaskItem | null) => {
    setEditingTask(task);
    setEditorOpen(true);
  };

  const handleSaveTask = async (draft: TaskDraft, taskId?: string) => {
    if (taskId) {
      await workspace.updateTask(taskId, draft);
    } else {
      await workspace.createTask(draft);
    }
  };

  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'tasks', label: t.nav.tasks, icon: CheckSquare },
    { id: 'dashboard', label: t.nav.dashboard, icon: Gauge },
    { id: 'system', label: t.nav.system, icon: Cpu },
    { id: 'devices', label: t.nav.devices, icon: Laptop },
    { id: 'security', label: t.nav.security, icon: ShieldCheck },
    { id: 'activity', label: t.nav.activity, icon: Activity },
  ];

  const selectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar: Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 h-16 px-4 sm:px-6 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-8 transition-colors">
        {/* Zone 1: Single-element wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              selectTab('tasks');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display whitespace-nowrap shrink-0"
          >
            Cadence
          </a>
        </div>

        {/* Zone 2: Concise single-line text nav links */}
        <nav className="hidden lg:flex items-center gap-5 xl:gap-6" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="shrink-0">
          {workspace.user ? (
            <button
              type="button"
              onClick={() => {
                setActiveTab('tasks');
                handleOpenEditor(null);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.985] rounded-lg transition-all whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              {t.nav.newTask}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void workspace.signInWithGoogle()}
              className="px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.985] rounded-lg transition-all whitespace-nowrap shrink-0"
            >
              {t.nav.signInGoogle}
            </button>
          )}
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 top-16 z-30 bg-slate-950/30 backdrop-blur-[1px] lg:hidden"
        />
      )}

      {/* Main Workspace Shell */}
      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        {/* Desktop Sidebar & Mobile Drawer */}
        <aside
          className={`${
            mobileMenuOpen ? 'fixed inset-y-16 left-0 z-40 flex shadow-lg' : 'hidden'
          } lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto lg:flex flex-col justify-between w-64 shrink-0 bg-slate-50 dark:bg-slate-950 lg:bg-transparent border-r border-slate-200 dark:border-slate-800 p-4 sm:p-5 gap-6`}
        >
          <div className="space-y-6">
            <nav className="space-y-1" aria-label="Workspace sections">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 min-h-[40px] text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.id === 'tasks' && workspace.user && (
                      <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500">
                        {workspace.tasks.filter((t) => !t.archived && t.status !== 'done').length}
                      </span>
                    )}
                    {item.id === 'devices' && workspace.user && (
                      <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500">
                        {workspace.devices.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <CompactSystemWidget
              snapshot={telemetry.snapshot}
              streamStatus={telemetry.streamStatus}
              thresholds={telemetry.thresholds}
              onOpenMonitor={() => selectTab('system')}
            />
          </div>

          {/* Bottom Sidebar Controls: Theme & Account */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              className="w-full flex items-center justify-between px-3 py-2 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg transition-colors"
            >
              <span className="flex items-center gap-2">
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                <span>{theme === 'light' ? t.nav.darkAppearance : t.nav.lightAppearance}</span>
              </span>
            </button>

            {workspace.user && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5 px-1">
                  {workspace.user.photoURL ? (
                    <img
                      src={workspace.user.photoURL}
                      alt={workspace.user.displayName || 'Account avatar'}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                      {(workspace.user.displayName || workspace.user.email || 'U').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {workspace.user.displayName || 'Account'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {workspace.user.email}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void workspace.signOutUser()}
                  className="mt-2.5 w-full flex items-center gap-2 px-3 py-2 min-h-[36px] text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t.nav.signOut}</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          {workspace.authError && (
            <div
              role="alert"
              className="mb-6 px-4 py-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300"
            >
              {workspace.authError}
            </div>
          )}

          <div key={activeTab} className="cadence-view-enter">
            {activeTab === 'tasks' && (
              <TasksWorkspace
                userSignedIn={Boolean(workspace.user)}
                authReady={workspace.authReady}
                tasks={workspace.tasks}
                loadingTasks={workspace.loadingTasks}
                syncState={workspace.syncState}
                lastSyncedAt={workspace.lastSyncedAt}
                categories={categories}
                onlineDeviceCount={workspace.devices.filter((d) => d.isOnline).length}
                totalDeviceCount={workspace.devices.length}
                latestScanStatus={workspace.securityScans[0]?.overallStatus ?? null}
                snapshot={telemetry.snapshot}
                telemetryStreamStatus={telemetry.streamStatus}
                telemetryPaused={telemetry.isPaused}
                telemetryThresholds={telemetry.thresholds}
                clientDevice={telemetry.clientDevice}
                onSignIn={workspace.signInWithGoogle}
                onCreateTask={workspace.createTask}
                onUpdateStatus={workspace.updateTaskStatus}
                onToggleArchive={workspace.toggleTaskArchive}
                onDeleteTask={workspace.deleteTask}
                onOpenEditor={handleOpenEditor}
                onOpenDevices={() => selectTab('devices')}
                onOpenSecurity={() => selectTab('security')}
                onToggleTelemetryPause={telemetry.togglePause}
                onUpdateTelemetryThresholds={telemetry.updateThresholds}
                onOpenSystemMonitor={() => selectTab('system')}
              />
            )}

            {activeTab === 'dashboard' && (
              <LiveDashboardView
                snapshot={telemetry.snapshot}
                history={telemetry.history}
                streamStatus={telemetry.streamStatus}
                isPaused={telemetry.isPaused}
                onTogglePause={telemetry.togglePause}
                onRefreshNow={telemetry.refreshNow}
                thresholds={telemetry.thresholds}
                onUpdateThresholds={telemetry.updateThresholds}
                thresholdEvents={telemetry.thresholdEvents}
                onClearThresholdEvents={telemetry.clearThresholdEvents}
                clientDevice={telemetry.clientDevice}
                devices={workspace.devices}
                tasks={workspace.tasks}
                securityScans={workspace.securityScans}
                syncState={workspace.syncState}
                userSignedIn={Boolean(workspace.user)}
                onOpenTab={selectTab}
                onCreateRemediationTask={workspace.createTask}
              />
            )}

            {activeTab === 'system' && (
              <SystemTelemetryView
                snapshot={telemetry.snapshot}
                history={telemetry.history}
                streamStatus={telemetry.streamStatus}
                isPaused={telemetry.isPaused}
                onTogglePause={telemetry.togglePause}
                thresholds={telemetry.thresholds}
                onUpdateThresholds={telemetry.updateThresholds}
                thresholdEvents={telemetry.thresholdEvents}
                onClearThresholdEvents={telemetry.clearThresholdEvents}
                clientDevice={telemetry.clientDevice}
              />
            )}

            {activeTab === 'devices' && (
              <DevicesView
                userSignedIn={Boolean(workspace.user)}
                devices={workspace.devices}
                currentDeviceId={workspace.currentDeviceId}
                clientDevice={telemetry.clientDevice}
                onSignIn={workspace.signInWithGoogle}
                onRenameDevice={workspace.renameCurrentDevice}
                onRemoveDevice={workspace.removeDeviceSession}
              />
            )}

            {activeTab === 'security' && (
              <SecurityScanView
                userSignedIn={Boolean(workspace.user)}
                emailVerified={Boolean(workspace.user?.emailVerified)}
                clientDevice={telemetry.clientDevice}
                devices={workspace.devices}
                currentDeviceId={workspace.currentDeviceId}
                snapshot={telemetry.snapshot}
                thresholds={telemetry.thresholds}
                securityScans={workspace.securityScans}
                onSignIn={workspace.signInWithGoogle}
                onRecordScan={workspace.recordSecurityScan}
                onDeleteScan={workspace.deleteSecurityScan}
                onRemoveDevice={workspace.removeDeviceSession}
                onOpenSystemMonitor={() => selectTab('system')}
              />
            )}

            {activeTab === 'activity' && (
              <ActivityView
                userSignedIn={Boolean(workspace.user)}
                tasks={workspace.tasks}
                syncState={workspace.syncState}
                lastSyncedAt={workspace.lastSyncedAt}
                onSignIn={workspace.signInWithGoogle}
              />
            )}
          </div>
        </main>
      </div>

      <TaskEditorModal
        isOpen={editorOpen}
        editingTask={editingTask}
        categories={categories}
        onClose={() => {
          setEditorOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <CadenceWorkspace />
      </LanguageProvider>
    </ErrorBoundary>
  );
}
