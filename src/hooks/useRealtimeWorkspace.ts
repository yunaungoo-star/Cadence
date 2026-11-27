import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { getClientDeviceInfo, setSavedDeviceName } from '@/src/lib/device';
import {
  BLUEPRINT_LIMITS,
  sanitizeDeviceName,
  sanitizeSecuritySummary,
  sanitizeString,
  sanitizeTaskDraft,
} from '@/src/lib/validation';
import type {
  DeviceSession,
  SecurityOverallStatus,
  SecurityScanReport,
  SyncConnectionState,
  TaskDraft,
  TaskItem,
  TaskStatus,
} from '@/src/types/app';

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return null;
}

export function useRealtimeWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [securityScans, setSecurityScans] = useState<SecurityScanReport[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [syncState, setSyncState] = useState<SyncConnectionState>('signed_out');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const currentDeviceIdRef = useRef<string>(getClientDeviceInfo().deviceId);

  if (fatalError) {
    throw fatalError;
  }

  // Ensure /users/{uid} exists before writing or reading subcollections
  const ensureUserProfile = useCallback(async (firebaseUser: User): Promise<void> => {
    const userPath = `users/${firebaseUser.uid}`;
    const userRef = doc(db, 'users', firebaseUser.uid);
    try {
      const snap = await getDoc(userRef);
      const displayName =
        sanitizeString(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX_LEN) ||
        'User';
      const email = sanitizeString(firebaseUser.email || '', BLUEPRINT_LIMITS.EMAIL_MAX_LEN);
      const photoURL = sanitizeString(firebaseUser.photoURL || '', BLUEPRINT_LIMITS.PHOTO_URL_MAX_LEN);

      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: firebaseUser.uid,
          displayName,
          email,
          photoURL,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existing = snap.data();
        if (
          existing.displayName !== displayName ||
          existing.email !== email ||
          (existing.photoURL || '') !== photoURL
        ) {
          await updateDoc(userRef, {
            displayName,
            email,
            photoURL,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, userPath);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  }, []);

  // Register and heartbeat this device session
  const syncCurrentDevice = useCallback(async (firebaseUser: User, isOnline: boolean): Promise<void> => {
    const info = getClientDeviceInfo();
    currentDeviceIdRef.current = info.deviceId;
    const devicePath = `users/${firebaseUser.uid}/devices/${info.deviceId}`;
    const deviceRef = doc(db, 'users', firebaseUser.uid, 'devices', info.deviceId);
    try {
      const snap = await getDoc(deviceRef);
      if (!snap.exists()) {
        await setDoc(deviceRef, {
          id: info.deviceId,
          ownerId: firebaseUser.uid,
          deviceName: info.deviceName,
          platform: info.platform,
          browser: info.browser,
          cpuCores: info.cpuCores,
          memoryGB: info.memoryGB,
          isOnline,
          createdAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
        });
      } else {
        await updateDoc(deviceRef, {
          deviceName: info.deviceName,
          platform: info.platform,
          browser: info.browser,
          cpuCores: info.cpuCores,
          memoryGB: info.memoryGB,
          isOnline,
          lastActiveAt: serverTimestamp(),
        });
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, devicePath);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setProfileReady(false);

      if (!nextUser) {
        setTasks([]);
        setDevices([]);
        setSecurityScans([]);
        setLoadingTasks(false);
        setSyncState('signed_out');
        return;
      }

      setLoadingTasks(true);
      setSyncState(navigator.onLine ? 'syncing' : 'offline');
      await ensureUserProfile(nextUser);
      await syncCurrentDevice(nextUser, navigator.onLine);
      setProfileReady(true);
    });

    return () => unsub();
  }, [ensureUserProfile, syncCurrentDevice]);

  // Network online/offline + periodic device heartbeat
  useEffect(() => {
    if (!user || !profileReady) return;

    const handleOnline = () => {
      setSyncState('syncing');
      void syncCurrentDevice(user, true);
    };
    const handleOffline = () => {
      setSyncState('offline');
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncCurrentDevice(user, navigator.onLine);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    const heartbeat = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        void syncCurrentDevice(user, true);
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(heartbeat);
    };
  }, [user, profileReady, syncCurrentDevice]);

  // Real-time Firestore listeners for Tasks and Devices
  useEffect(() => {
    if (!authReady || !user || !profileReady) return;

    const tasksPath = `users/${user.uid}/tasks`;
    const tasksQuery = query(collection(db, 'users', user.uid, 'tasks'), where('ownerId', '==', user.uid));

    const unsubTasks = onSnapshot(
      tasksQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const nextTasks: TaskItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId || user.uid),
            title: String(data.title || ''),
            description: String(data.description || ''),
            status: (data.status as TaskStatus) || 'todo',
            priority: data.priority || 'medium',
            category: String(data.category || 'General'),
            dueDate: String(data.dueDate || ''),
            archived: Boolean(data.archived),
            updatedByDevice: String(data.updatedByDevice || 'Unknown Device'),
            createdAt: toDateOrNull(data.createdAt),
            updatedAt: toDateOrNull(data.updatedAt),
          };
        });

        nextTasks.sort((a, b) => {
          const ta = a.updatedAt ? a.updatedAt.getTime() : Date.now();
          const tb = b.updatedAt ? b.updatedAt.getTime() : Date.now();
          return tb - ta;
        });

        setTasks(nextTasks);
        setLoadingTasks(false);

        if (!navigator.onLine) {
          setSyncState('offline');
        } else if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) {
          setSyncState('syncing');
        } else {
          setSyncState('synced');
          setLastSyncedAt(new Date());
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, tasksPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    );

    const devicesPath = `users/${user.uid}/devices`;
    const devicesQuery = query(collection(db, 'users', user.uid, 'devices'), where('ownerId', '==', user.uid));

    const unsubDevices = onSnapshot(
      devicesQuery,
      (snapshot) => {
        const nextDevices: DeviceSession[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId || user.uid),
            deviceName: String(data.deviceName || 'Web Browser'),
            platform: String(data.platform || 'Unknown'),
            browser: String(data.browser || 'Browser'),
            cpuCores: Number(data.cpuCores || 0),
            memoryGB: Number(data.memoryGB || 0),
            isOnline: Boolean(data.isOnline),
            createdAt: toDateOrNull(data.createdAt),
            lastActiveAt: toDateOrNull(data.lastActiveAt),
          };
        });

        nextDevices.sort((a, b) => {
          const ta = a.lastActiveAt ? a.lastActiveAt.getTime() : 0;
          const tb = b.lastActiveAt ? b.lastActiveAt.getTime() : 0;
          return tb - ta;
        });

        setDevices(nextDevices);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, devicesPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    );

    const scansPath = `users/${user.uid}/securityScans`;
    const scansQuery = query(collection(db, 'users', user.uid, 'securityScans'), where('ownerId', '==', user.uid));

    const unsubScans = onSnapshot(
      scansQuery,
      (snapshot) => {
        const nextScans: SecurityScanReport[] = snapshot.docs.map((d) => {
          const data = d.data();
          const status = data.overallStatus;
          const overallStatus: SecurityOverallStatus =
            status === 'protected' || status === 'attention' || status === 'at_risk' ? status : 'attention';
          return {
            id: d.id,
            ownerId: String(data.ownerId || user.uid),
            deviceId: String(data.deviceId || ''),
            deviceName: String(data.deviceName || 'Web Browser'),
            overallStatus,
            passedChecks: Number(data.passedChecks || 0),
            warningChecks: Number(data.warningChecks || 0),
            criticalChecks: Number(data.criticalChecks || 0),
            totalChecks: Number(data.totalChecks || 1),
            summary: String(data.summary || ''),
            createdAt: toDateOrNull(data.createdAt),
          };
        });

        nextScans.sort((a, b) => {
          const ta = a.createdAt ? a.createdAt.getTime() : Date.now();
          const tb = b.createdAt ? b.createdAt.getTime() : Date.now();
          return tb - ta;
        });

        setSecurityScans(nextScans);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, scansPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    );

    return () => {
      unsubTasks();
      unsubDevices();
      unsubScans();
    };
  }, [authReady, user, profileReady]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to sign in with Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    if (user && profileReady) {
      const deviceId = currentDeviceIdRef.current;
      const deviceRef = doc(db, 'users', user.uid, 'devices', deviceId);
      try {
        await updateDoc(deviceRef, {
          isOnline: false,
          lastActiveAt: serverTimestamp(),
        });
      } catch {
        // Ignore offline/signout presence error
      }
    }
    await signOut(auth);
  }, [user, profileReady]);

  const createTask = useCallback(
    async (draft: TaskDraft): Promise<void> => {
      if (!user) return;
      const clean = sanitizeTaskDraft(draft);
      if (!clean.title) return;

      const colRef = collection(db, 'users', user.uid, 'tasks');
      const taskRef = doc(colRef);
      const taskPath = `users/${user.uid}/tasks/${taskRef.id}`;
      const deviceName = sanitizeDeviceName(getClientDeviceInfo().deviceName);

      try {
        await setDoc(taskRef, {
          id: taskRef.id,
          ownerId: user.uid,
          title: clean.title,
          description: clean.description,
          status: clean.status,
          priority: clean.priority,
          category: clean.category,
          dueDate: clean.dueDate,
          archived: false,
          updatedByDevice: deviceName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.CREATE, taskPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
    [user],
  );

  const updateTask = useCallback(
    async (taskId: string, draft: TaskDraft): Promise<void> => {
      if (!user) return;
      const clean = sanitizeTaskDraft(draft);
      if (!clean.title) return;

      const taskPath = `users/${user.uid}/tasks/${taskId}`;
      const taskRef = doc(db, 'users', user.uid, 'tasks', taskId);
      const deviceName = sanitizeDeviceName(getClientDeviceInfo().deviceName);

      try {
        await updateDoc(taskRef, {
          title: clean.title,
          description: clean.description,
          status: clean.status,
          priority: clean.priority,
          category: clean.category,
          dueDate: clean.dueDate,
          updatedByDevice: deviceName,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.UPDATE, taskPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
    [user],
  );

  const updateTaskStatus = useCallback(
    async (taskId: string, status: TaskStatus): Promise<void> => {
      if (!user) return;
      const taskPath = `users/${user.uid}/tasks/${taskId}`;
      const taskRef = doc(db, 'users', user.uid, 'tasks', taskId);
      const deviceName = sanitizeDeviceName(getClientDeviceInfo().deviceName);

      try {
        await updateDoc(taskRef, {
          status,
          updatedByDevice: deviceName,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.UPDATE, taskPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
    [user],
  );

  const toggleTaskArchive = useCallback(
    async (taskId: string, archived: boolean): Promise<void> => {
      if (!user) return;
      const taskPath = `users/${user.uid}/tasks/${taskId}`;
      const taskRef = doc(db, 'users', user.uid, 'tasks', taskId);
      const deviceName = sanitizeDeviceName(getClientDeviceInfo().deviceName);

      try {
        await updateDoc(taskRef, {
          archived,
          updatedByDevice: deviceName,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.UPDATE, taskPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
    [user],
  );

  const deleteTask = useCallback(
    async (taskId: string): Promise<void> => {
      if (!user) return;
      const taskPath = `users/${user.uid}/tasks/${taskId}`;
      const taskRef = doc(db, 'users', user.uid, 'tasks', taskId);

      try {
        await deleteDoc(taskRef);
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.DELETE, taskPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
    [user],
  );

  const renameCurrentDevice = useCallback(
    async (nextName: string): Promise<void> => {
      const cleanName = setSavedDeviceName(nextName);
      if (!user || !profileReady) return;
      const info = getClientDeviceInfo();
      const devicePath = `users/${user.uid}/devices/${info.deviceId}`;
      const deviceRef = doc(db, 'users', user.uid, 'devices', info.deviceId);
      try {
        await updateDoc(deviceRef, {
          deviceName: cleanName,
          platform: info.platform,
          browser: info.browser,
          cpuCores: info.cpuCores,
          memoryGB: info.memoryGB,
          isOnline: navigator.onLine,
          lastActiveAt: serverTimestamp(),
        });
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.UPDATE, devicePath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
    [user, profileReady],
  );

  const removeDeviceSession = useCallback(
    async (deviceId: string): Promise<void> => {
      if (!user) return;
      const devicePath = `users/${user.uid}/devices/${deviceId}`;
      const deviceRef = doc(db, 'users', user.uid, 'devices', deviceId);
      try {
        await deleteDoc(deviceRef);
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.DELETE, devicePath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
    [user],
  );

  const recordSecurityScan = useCallback(
    async (report: {
      overallStatus: SecurityOverallStatus;
      passedChecks: number;
      warningChecks: number;
      criticalChecks: number;
      totalChecks: number;
      summary: string;
    }): Promise<void> => {
      if (!user || !profileReady) return;
      const colRef = collection(db, 'users', user.uid, 'securityScans');
      const scanRef = doc(colRef);
      const scanPath = `users/${user.uid}/securityScans/${scanRef.id}`;
      const info = getClientDeviceInfo();
      const clampCount = (n: number, min = 0) => Math.min(100, Math.max(min, Math.round(n)));

      try {
        await setDoc(scanRef, {
          id: scanRef.id,
          ownerId: user.uid,
          deviceId: info.deviceId,
          deviceName: sanitizeDeviceName(info.deviceName),
          overallStatus: report.overallStatus,
          passedChecks: clampCount(report.passedChecks),
          warningChecks: clampCount(report.warningChecks),
          criticalChecks: clampCount(report.criticalChecks),
          totalChecks: clampCount(report.totalChecks, 1),
          summary: sanitizeSecuritySummary(report.summary),
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.CREATE, scanPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
    [user, profileReady],
  );

  const deleteSecurityScan = useCallback(
    async (scanId: string): Promise<void> => {
      if (!user) return;
      const scanPath = `users/${user.uid}/securityScans/${scanId}`;
      const scanRef = doc(db, 'users', user.uid, 'securityScans', scanId);
      try {
        await deleteDoc(scanRef);
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.DELETE, scanPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
    [user],
  );

  return {
    user,
    authReady,
    tasks,
    devices,
    securityScans,
    loadingTasks,
    syncState,
    lastSyncedAt,
    authError,
    currentDeviceId: currentDeviceIdRef.current,
    signInWithGoogle,
    signOutUser,
    createTask,
    updateTask,
    updateTaskStatus,
    toggleTaskArchive,
    deleteTask,
    renameCurrentDevice,
    removeDeviceSession,
    recordSecurityScan,
    deleteSecurityScan,
  };
}
