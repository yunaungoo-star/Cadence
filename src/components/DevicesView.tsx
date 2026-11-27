import React, { useState } from 'react';
import { Check, Laptop, Monitor, Smartphone, Trash2 } from 'lucide-react';
import { formatBytes, formatRelativeTime } from '@/src/lib/formatters';
import { BLUEPRINT_LIMITS } from '@/src/lib/validation';
import type { ClientDeviceInfo, DeviceSession } from '@/src/types/app';

interface DevicesViewProps {
  userSignedIn: boolean;
  devices: DeviceSession[];
  currentDeviceId: string;
  clientDevice: ClientDeviceInfo;
  onSignIn: () => Promise<void>;
  onRenameDevice: (name: string) => Promise<void>;
  onRemoveDevice: (deviceId: string) => Promise<void>;
}

function getDeviceIcon(platform: string) {
  if (/Android|iOS|iPhone/i.test(platform)) return Smartphone;
  if (/macOS|Windows|Linux/i.test(platform)) return Laptop;
  return Monitor;
}

export const DevicesView: React.FC<DevicesViewProps> = ({
  userSignedIn,
  devices,
  currentDeviceId,
  clientDevice,
  onSignIn,
  onRenameDevice,
  onRemoveDevice,
}) => {
  const [nameInput, setNameInput] = useState(clientDevice.deviceName);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRenameDevice(nameInput);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 font-display tracking-tight">
          Connected Devices
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Inspect local browser hardware capabilities and manage devices syncing tasks in real time.
        </p>
      </div>

      {/* Current Device Identity & Local Hardware */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
              This Browser Session
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span className={clientDevice.online ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>
                {clientDevice.online ? 'Online' : 'Offline'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{clientDevice.browser} on {clientDevice.platform}</span>
              <span aria-hidden="true">·</span>
              <span>{clientDevice.cpuCores > 0 ? `${clientDevice.cpuCores} logical cores` : 'Cores undisclosed'}</span>
              {clientDevice.memoryGB > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{clientDevice.memoryGB} GB device RAM</span>
                </>
              )}
              {clientDevice.jsHeapUsedBytes !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>JS Heap {formatBytes(clientDevice.jsHeapUsedBytes)}</span>
                </>
              )}
            </div>
          </div>

          <form onSubmit={handleRenameSubmit} className="flex items-center gap-2.5 shrink-0">
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.DEVICE_NAME_MAX_LEN}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              aria-label="Current device name"
              className="w-56 px-3 py-2 min-h-[40px] text-xs bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {savedNotice && <Check className="w-3.5 h-3.5" />}
              {savedNotice ? 'Saved' : 'Rename Device'}
            </button>
          </form>
        </div>
      </section>

      {/* Synced Account Devices List */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
            Account Sync Sessions
          </h2>
          {userSignedIn && (
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {devices.length} registered
            </span>
          )}
        </div>

        {!userSignedIn ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Sign in to view connected devices across your account
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Every browser or device signed into your Google account appears here in real time.
            </p>
            <button
              type="button"
              onClick={() => void onSignIn()}
              className="mt-5 px-4 py-2 min-h-[40px] text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
            >
              Sign in with Google
            </button>
          </div>
        ) : devices.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Registering current device session...
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {devices.map((device) => {
              const Icon = getDeviceIcon(device.platform);
              const isCurrent = device.id === currentDeviceId;
              return (
                <li key={device.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Icon className="w-5 h-5 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {device.deviceName}
                        {isCurrent && (
                          <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">
                            (This device)
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        <span className={device.isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                          {device.isOnline ? 'Online' : 'Offline'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{device.browser} on {device.platform}</span>
                        <span aria-hidden="true">·</span>
                        <span>{device.cpuCores > 0 ? `${device.cpuCores} cores` : 'Cores unknown'}</span>
                        {device.memoryGB > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{device.memoryGB} GB RAM</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>Heartbeat {formatRelativeTime(device.lastActiveAt)}</span>
                      </div>
                    </div>
                  </div>

                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => void onRemoveDevice(device.id)}
                      aria-label={`Remove ${device.deviceName}`}
                      className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
