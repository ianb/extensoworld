import { getStorage } from "./storage-instance.js";

const QUOTA_WINDOWS = [
  { name: "1 week", seconds: 7 * 24 * 60 * 60, limit: 300 },
  { name: "1 day", seconds: 24 * 60 * 60, limit: 100 },
  { name: "1 hour", seconds: 60 * 60, limit: 30 },
  { name: "5 minutes", seconds: 5 * 60, limit: 10 },
];

/**
 * Check whether a user has exceeded their AI usage quota.
 * Returns an error message string if over quota, or null if OK.
 * Admin users bypass quota checks.
 */
export async function checkAiQuota(
  userId: string,
  roles: string[] | undefined,
): Promise<string | null> {
  if (roles && roles.includes("admin")) return null;

  const storage = getStorage();
  for (const window of QUOTA_WINDOWS) {
    const since = new Date(Date.now() - window.seconds * 1000).toISOString();
    const count = await storage.countAiUsage(userId, since);
    if (count >= window.limit) {
      return `{!You've used too much AI power recently. Try again in a bit (limit: ${window.limit} per ${window.name}).!}`;
    }
  }
  return null;
}

/**
 * Record a successful AI call for quota tracking.
 */
export async function recordAiCall(userId: string, callType: string): Promise<void> {
  await getStorage().recordAiUsage(userId, callType);
}
