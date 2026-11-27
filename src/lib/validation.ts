import type { TaskDraft, TaskPriority, TaskStatus } from '@/src/types/app';

// Constants synchronized verbatim with firebase-blueprint.json & firestore.rules
export const BLUEPRINT_LIMITS = {
  ID_MAX_LEN: 128,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  DISPLAY_NAME_MAX_LEN: 100,
  EMAIL_MAX_LEN: 254,
  PHOTO_URL_MAX_LEN: 512,
  TASK_TITLE_MAX_LEN: 200,
  TASK_DESC_MAX_LEN: 2000,
  TASK_CATEGORY_MAX_LEN: 48,
  TASK_DUE_DATE_MAX_LEN: 32,
  TASK_DUE_DATE_PATTERN: /^(\d{4}-\d{2}-\d{2})?$/,
  DEVICE_NAME_MAX_LEN: 80,
  DEVICE_PLATFORM_MAX_LEN: 64,
  DEVICE_BROWSER_MAX_LEN: 64,
  SECURITY_SUMMARY_MAX_LEN: 300,
} as const;

const VALID_STATUSES: ReadonlyArray<TaskStatus> = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES: ReadonlyArray<TaskPriority> = ['low', 'medium', 'high', 'urgent'];

export function sanitizeString(value: string, maxLength: number): string {
  return value.normalize('NFC').trim().slice(0, maxLength);
}

export function sanitizeTaskDraft(draft: TaskDraft): TaskDraft {
  const title = sanitizeString(draft.title, BLUEPRINT_LIMITS.TASK_TITLE_MAX_LEN);
  const description = draft.description.normalize('NFC').trim().slice(0, BLUEPRINT_LIMITS.TASK_DESC_MAX_LEN);
  const category = sanitizeString(draft.category || 'General', BLUEPRINT_LIMITS.TASK_CATEGORY_MAX_LEN) || 'General';
  const rawDate = draft.dueDate.trim().slice(0, BLUEPRINT_LIMITS.TASK_DUE_DATE_MAX_LEN);
  const dueDate = BLUEPRINT_LIMITS.TASK_DUE_DATE_PATTERN.test(rawDate) ? rawDate : '';
  const status: TaskStatus = VALID_STATUSES.includes(draft.status) ? draft.status : 'todo';
  const priority: TaskPriority = VALID_PRIORITIES.includes(draft.priority) ? draft.priority : 'medium';

  return {
    title,
    description,
    status,
    priority,
    category,
    dueDate,
  };
}

export function validateTaskTitle(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return 'Task title is required.';
  }
  if (trimmed.length > BLUEPRINT_LIMITS.TASK_TITLE_MAX_LEN) {
    return `Task title must be ${BLUEPRINT_LIMITS.TASK_TITLE_MAX_LEN} characters or fewer.`;
  }
  return null;
}

export function sanitizeDeviceName(name: string): string {
  const cleaned = sanitizeString(name, BLUEPRINT_LIMITS.DEVICE_NAME_MAX_LEN);
  return cleaned || 'Web Browser';
}

export function sanitizeSecuritySummary(summary: string): string {
  const cleaned = sanitizeString(summary, BLUEPRINT_LIMITS.SECURITY_SUMMARY_MAX_LEN);
  return cleaned || 'Device security audit completed.';
}
