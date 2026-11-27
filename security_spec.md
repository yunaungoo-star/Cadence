# Security Specification & Payload-First TDD

## 1. Master Source of Truth & Data Invariants
- **UserProfile (`/users/{userId}`)**: Master user root document. Strictly private (`ownerId == userId`). Only the verified authenticated owner (`request.auth.uid == userId && request.auth.token.email_verified == true`) can read or write their profile. No `list` access is permitted on `/users` to prevent PII scraping.
- **Task (`/users/{userId}/tasks/{taskId}`)**: Sub-collection owned by `/users/{userId}`. A task cannot be created or modified unless the parent `/users/{userId}` document exists (`exists()`), `request.auth.uid == userId`, `email_verified == true`, `incoming().ownerId == request.auth.uid`, and `incoming().id == taskId`. `createdAt` and `ownerId` and `id` are immutable after creation. `createdAt` (on create) and `updatedAt` (on create & update) MUST equal `request.time`.
- **DeviceSession (`/users/{userId}/devices/{deviceId}`)**: Sub-collection owned by `/users/{userId}`. Tracks active/recent synced devices. Strictly owner-only, `createdAt` immutable, `lastActiveAt == request.time`.
- **SecurityScan (`/users/{userId}/securityScans/{scanId}`)**: Sub-collection owned by `/users/{userId}`. Immutable device security scan audit reports (`allow update: if false`). Strictly owner-only (`ownerId == request.auth.uid`), verified email required, `createdAt == request.time`, valid status enum (`protected | attention | at_risk`), and bounded numeric/string fields.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Task Read**: Anonymous client attempts `get` on `/users/userA/tasks/task1` -> `PERMISSION_DENIED`.
2. **Cross-Tenant Task Read**: Authenticated `userB` attempts `get` or `list` on `/users/userA/tasks` -> `PERMISSION_DENIED`.
3. **Cross-Tenant Task Creation**: Authenticated `userB` attempts `create` on `/users/userA/tasks/taskX` with `ownerId: "userB"` -> `PERMISSION_DENIED`.
4. **Owner Spoofing**: Authenticated `userA` attempts `create` on `/users/userA/tasks/taskX` with `ownerId: "userB"` -> `PERMISSION_DENIED`.
5. **Unverified Email Write**: Authenticated `userA` with `email_verified: false` attempts `create` on `/users/userA/tasks/taskX` -> `PERMISSION_DENIED`.
6. **Shadow / Ghost Field Injection**: Authenticated `userA` attempts `create` or `update` on `/users/userA/tasks/taskX` including an extra field `isAdmin: true` -> `PERMISSION_DENIED`.
7. **ID Poisoning**: Authenticated `userA` attempts `create` at `/users/userA/tasks/invalid$id..with.spaces` -> `PERMISSION_DENIED`.
8. **Resource Exhaustion (1MB String)**: Authenticated `userA` attempts `create` with a 5,000-character `title` (exceeds `maxLength: 200`) -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Authenticated `userA` attempts `create` or `update` with a backdated `createdAt` or `updatedAt` != `request.time` -> `PERMISSION_DENIED`.
10. **Immortal Field Mutation**: Authenticated `userA` attempts `update` changing `createdAt` or `ownerId` -> `PERMISSION_DENIED`.
11. **Invalid Enum Value**: Authenticated `userA` attempts `create` or `update` with `status: "hacked"` or `priority: "critical"` -> `PERMISSION_DENIED`.
12. **PII Directory Scraping**: Authenticated `userB` attempts `list` on `/users` or `get` on `/users/userA` -> `PERMISSION_DENIED`.
