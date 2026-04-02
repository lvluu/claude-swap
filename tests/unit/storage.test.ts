import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  Database,
  closeDatabase,
} from "../../src/core/storage";
import { Encryption } from "../../src/core/encryption";

let db: Database;

async function createTestDb(): Promise<Database> {
  const testDbPath = `/tmp/ccs-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  // Reset singletons before each test so they don't interfere with CLI tests
  (Database as unknown as { instance: Database | null }).instance = null;
  (Encryption as unknown as { _instance: unknown })._instance = null;
  const db = new Database(
    new (await import("bun:sqlite")).Database(testDbPath) as never,
  );
  db.runMigrations();
  return db;
}

describe("Database", () => {
  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeDatabase();
    // Restore singletons to null so subsequent test files can re-initialise
    (Database as unknown as { instance: Database | null }).instance = null;
    (Encryption as unknown as { _instance: unknown })._instance = null;
  });

  describe("Profile operations", () => {
    test("create and get profile", () => {
      const now = Date.now();
      db.createProfile({
        id: "test@example.com",
        name: "Test Profile",
        token_encrypted: "encrypted-token",
        auth_method: "manual",
        created_at: now,
        last_used: now,
        use_count: 0,
        metadata: {},
        tags: ["test"],
      });

      const profile = db.getProfileById("test@example.com");
      expect(profile).not.toBeNull();
      expect(profile?.name).toBe("Test Profile");
      expect(profile?.auth_method).toBe("manual");
      expect(profile?.tags).toEqual(["test"]);
    });

    test("get all profiles", () => {
      const now = Date.now();
      db.createProfile({
        id: "profile1@example.com",
        name: "Profile 1",
        token_encrypted: "token1",
        auth_method: "manual",
        created_at: now,
        last_used: now,
        use_count: 0,
        metadata: {},
        tags: [],
      });
      db.createProfile({
        id: "profile2@example.com",
        name: "Profile 2",
        token_encrypted: "token2",
        auth_method: "oauth",
        created_at: now,
        last_used: now,
        use_count: 0,
        metadata: {},
        tags: [],
      });

      const profiles = db.getAllProfiles();
      expect(profiles).toHaveLength(2);
    });

    test("update profile", () => {
      const now = Date.now();
      db.createProfile({
        id: "test@example.com",
        name: "Original Name",
        token_encrypted: "token",
        auth_method: "manual",
        created_at: now,
        last_used: now,
        use_count: 0,
        metadata: {},
        tags: [],
      });

      db.updateProfile("test@example.com", {
        name: "Updated Name",
        use_count: 5,
      });
      const profile = db.getProfileById("test@example.com");
      expect(profile?.name).toBe("Updated Name");
      expect(profile?.use_count).toBe(5);
    });

    test("delete profile", () => {
      const now = Date.now();
      db.createProfile({
        id: "test@example.com",
        name: "Test",
        token_encrypted: "token",
        auth_method: "manual",
        created_at: now,
        last_used: now,
        use_count: 0,
        metadata: {},
        tags: [],
      });

      db.deleteProfile("test@example.com");
      expect(db.getProfileById("test@example.com")).toBeNull();
    });
  });

  describe("Session operations", () => {
    test("create and get session", () => {
      const now = Date.now();
      db.createSession({
        id: "session-1",
        profile_id: null,
        terminal: "/dev/tty1",
        started_at: now,
        last_activity: now,
        metadata: { shell: "bash", cwd: "/home", parent_pid: 1234 },
      });

      const session = db.getSessionById("session-1");
      expect(session).not.toBeNull();
      expect(session?.terminal).toBe("/dev/tty1");
    });

    test("get session by terminal", () => {
      const now = Date.now();
      db.createSession({
        id: "session-1",
        profile_id: null,
        terminal: "/dev/tty1",
        started_at: now,
        last_activity: now,
        metadata: { shell: "bash", cwd: "/home", parent_pid: 1234 },
      });

      const session = db.getSessionByTerminal("/dev/tty1");
      expect(session?.id).toBe("session-1");
    });

    test("delete stale sessions", () => {
      const now = Date.now();
      db.createSession({
        id: "old-session",
        profile_id: null,
        terminal: "/dev/tty1",
        started_at: now - 100000,
        last_activity: now - 100000,
        metadata: { shell: "bash", cwd: "/home", parent_pid: 1234 },
      });

      db.deleteStaleSessions(60000);
      expect(db.getAllSessions()).toHaveLength(0);
    });
  });

  describe("Quota operations", () => {
    test("create and get quota", () => {
      const now = Date.now();
      db.createOrUpdateQuota({
        profile_id: "test@example.com",
        daily_limit: 5000,
        monthly_limit: 100000,
        current_daily: 0,
        current_monthly: 0,
        last_reset_daily: now,
        last_reset_monthly: now,
      });

      const quota = db.getQuota("test@example.com");
      expect(quota?.daily_limit).toBe(5000);
      expect(quota?.monthly_limit).toBe(100000);
    });

    test("update quota counters", () => {
      const now = Date.now();
      db.createOrUpdateQuota({
        profile_id: "test@example.com",
        daily_limit: 5000,
        monthly_limit: 100000,
        current_daily: 100,
        current_monthly: 500,
        last_reset_daily: now,
        last_reset_monthly: now,
      });

      db.updateQuotaCounters("test@example.com", 50, 200);
      const quota = db.getQuota("test@example.com");
      expect(quota?.current_daily).toBe(150);
      expect(quota?.current_monthly).toBe(700);
    });
  });

  describe("Usage log operations", () => {
    test("log and retrieve usage", () => {
      const now = Date.now();
      db.logUsage({
        profile_id: "test@example.com",
        session_id: "session-1",
        timestamp: now,
        tokens_used: 1000,
        model: "claude-3-sonnet",
      });

      const logs = db.getUsageLogs("test@example.com");
      expect(logs).toHaveLength(1);
      expect(logs[0]?.tokens_used).toBe(1000);
      expect(logs[0]?.model).toBe("claude-3-sonnet");
    });
  });

  describe("Settings operations", () => {
    test("set and get setting", () => {
      db.setSetting("theme", "dark");
      expect(db.getSetting<string>("theme")).toBe("dark");
    });

    test("get non-existent setting returns null", () => {
      expect(db.getSetting("nonexistent")).toBeNull();
    });

    test("delete setting", () => {
      db.setSetting("temp", "value");
      db.deleteSetting("temp");
      expect(db.getSetting("temp")).toBeNull();
    });
  });
});
