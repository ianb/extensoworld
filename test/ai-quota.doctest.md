# AI Usage Quota

Tests for the per-user AI quota system.

```ts setup
import { setStorage } from "../src/server/storage-instance.js";
import { checkAiQuota, recordAiCall } from "../src/server/ai-quota.js";

// In-memory usage log for testing
let usageLog: Array<{ userId: string; callType: string; createdAt: string }> = [];
let nowMs = new Date("2026-03-31T12:00:00Z").getTime();

function setNow(iso: string): void {
  nowMs = new Date(iso).getTime();
}

// Patch Date.now for quota checks
const origDateNow = Date.now;
Date.now = () => nowMs;

setStorage({
  recordAiUsage: async (userId: string, callType: string) => {
    usageLog.push({ userId, callType, createdAt: new Date(nowMs).toISOString() });
  },
  countAiUsage: async (userId: string, since: string) => {
    return usageLog.filter((e) => e.userId === userId && e.createdAt > since).length;
  },
  // Stubs for other methods (unused by quota)
  loadAiEntities: async () => [],
  saveAiEntity: async () => {},
  getAiEntityIds: async () => new Set(),
  removeAiEntity: async () => false,
  loadAiHandlers: async () => [],
  saveHandler: async () => {},
  listHandlers: async () => [],
  removeHandler: async () => false,
  loadEvents: async () => [],
  appendEvent: async () => {},
  clearEvents: async () => {},
  popEvent: async () => null,
  loadConversationEntries: async () => [],
  saveWordEntry: async () => {},
  findUserByGoogleId: async () => null,
  findUserById: async () => null,
  findUserByName: async () => null,
  hasAnyUsers: async () => false,
  createUser: async () => {},
  updateLastLogin: async () => {},
} as any);
```

## Recording AI calls

```
usageLog = [];
await recordAiCall("user:1", "room");
await recordAiCall("user:1", "scenery");
await recordAiCall("user:2", "verb-fallback");

usageLog.length
=> 3
```

```continue
usageLog.map(e => e.callType).join(", ")
=> room, scenery, verb-fallback
```

## No quota exceeded with zero usage

```
usageLog = [];
await checkAiQuota("user:1", ["ai"])
=> null
```

## Admin bypasses quota

Even with lots of usage, admin role bypasses the check:

```
usageLog = [];
setNow("2026-03-31T12:00:00Z");

// Fill up past the 5-minute limit
for (let i = 0; i < 15; i++) {
  usageLog.push({ userId: "admin:1", callType: "room", createdAt: new Date(nowMs - 1000).toISOString() });
}

await checkAiQuota("admin:1", ["admin", "ai"])
=> null
```

## 5-minute window triggers quota

```
usageLog = [];
setNow("2026-03-31T12:00:00Z");

// Add 10 calls within the last 5 minutes (at the limit)
for (let i = 0; i < 10; i++) {
  usageLog.push({ userId: "user:1", callType: "room", createdAt: new Date(nowMs - 60000).toISOString() });
}

const msg = await checkAiQuota("user:1", ["ai"]);
msg !== null
=> true
```

The message mentions the limit:

```continue
msg.includes("10 per 5 minutes")
=> true
```

## Just under the limit passes

```
usageLog = [];
setNow("2026-03-31T12:00:00Z");

// 9 calls (under the limit of 10)
for (let i = 0; i < 9; i++) {
  usageLog.push({ userId: "user:1", callType: "room", createdAt: new Date(nowMs - 60000).toISOString() });
}

await checkAiQuota("user:1", ["ai"])
=> null
```

## Old usage outside window doesn't count

```
usageLog = [];
setNow("2026-03-31T12:00:00Z");

// 15 calls but all from 10 minutes ago (outside 5-min window)
for (let i = 0; i < 15; i++) {
  usageLog.push({ userId: "user:1", callType: "room", createdAt: new Date(nowMs - 10 * 60000).toISOString() });
}

await checkAiQuota("user:1", ["ai"])
=> null
```

## Hourly window triggers

```
usageLog = [];
setNow("2026-03-31T12:00:00Z");

// 30 calls spread across the last hour
for (let i = 0; i < 30; i++) {
  usageLog.push({ userId: "user:1", callType: "room", createdAt: new Date(nowMs - 30 * 60000).toISOString() });
}

const hourMsg = await checkAiQuota("user:1", ["ai"]);
hourMsg !== null
=> true
```

```continue
hourMsg.includes("per 1 hour")
=> true
```

## Per-user isolation

One user's usage doesn't affect another:

```
usageLog = [];
setNow("2026-03-31T12:00:00Z");

// user:1 is at the 5-min limit
for (let i = 0; i < 10; i++) {
  usageLog.push({ userId: "user:1", callType: "room", createdAt: new Date(nowMs - 60000).toISOString() });
}

// user:2 should still be fine
await checkAiQuota("user:2", ["ai"])
=> null
```

## No roles defaults to non-admin

When roles is undefined, quota is still enforced:

```
usageLog = [];
setNow("2026-03-31T12:00:00Z");

for (let i = 0; i < 10; i++) {
  usageLog.push({ userId: "user:1", callType: "room", createdAt: new Date(nowMs - 60000).toISOString() });
}

const noRolesMsg = await checkAiQuota("user:1", undefined);
noRolesMsg !== null
=> true
```

## Cleanup

```
Date.now = origDateNow;
```
