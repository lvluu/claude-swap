import { Database as SQLiteDatabase } from "bun:sqlite";
import { mkdirSync } from "fs";
import type { Profile, Session, Quota, UsageLog } from "../types/index.js";

const SCHEMA_VERSION = 1;

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_encrypted TEXT NOT NULL DEFAULT '',
  base_url TEXT,
  auth_method TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL,
  last_used INTEGER NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  tags TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  terminal TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS quotas (
  profile_id TEXT PRIMARY KEY,
  daily_limit INTEGER,
  monthly_limit INTEGER,
  current_daily INTEGER NOT NULL DEFAULT 0,
  current_monthly INTEGER NOT NULL DEFAULT 0,
  last_reset_daily INTEGER NOT NULL,
  last_reset_monthly INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  tokens_used INTEGER NOT NULL,
  model TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_sessions_terminal ON sessions(terminal);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_usage_log_session ON usage_log(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_profile ON usage_log(profile_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_timestamp ON usage_log(timestamp DESC);
`;

function getDbDir(): string {
  const home = Bun.env.HOME ?? "/tmp";
  return `${home}/.config/ccs`;
}

function getDbPath(): string {
  return `${getDbDir()}/data.db`;
}

function ensureConfigDir(): void {
  mkdirSync(getDbDir(), { recursive: true });
}

export class Database {
  private db: SQLiteDatabase;
  private static instance: Database | null = null;

  private constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  static async initialize(): Promise<Database> {
    return Database.initializeSync(getDbPath());
  }

  /** Synchronous initialiser so test fixtures can call it directly with a specific path.
   *  Idempotent: if the same path is already initialised, returns the existing instance.
   *  Thread-safe for parallel worker loading because it records the expected path. */
  static initializeSync(path: string): Database {
    if (Database.instance) {
      // Already initialised — workers can race here; ensure only the first path wins
      return Database.instance;
    }

    ensureConfigDir();
    const db = new SQLiteDatabase(path);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");

    const instance = new Database(db);
    instance.runMigrations();

    Database.instance = instance;
    return instance;
  }

  static getInstance(): Database {
    if (!Database.instance) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return Database.instance;
  }

  static async close(): Promise<void> {
    if (Database.instance) {
      Database.instance.db.close();
      Database.instance = null;
    }
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );
    `);

    const result = this.db.query("SELECT version FROM schema_version LIMIT 1").get();
    const currentVersion = (result as { version: number } | undefined)?.version ?? 0;

    if (currentVersion < SCHEMA_VERSION) {
      this.db.exec(CREATE_TABLES);
      this.db.exec("DELETE FROM schema_version");
      this.db.exec("INSERT INTO schema_version (version) VALUES (?)", [SCHEMA_VERSION]);
    }
  }

  // Profile operations
  getAllProfiles(): Profile[] {
    const rows = this.db.query("SELECT * FROM profiles ORDER BY last_used DESC").all();
    return rows.map(this.rowToProfile);
  }

  getProfileById(id: string): Profile | null {
    const row = this.db.query("SELECT * FROM profiles WHERE id = ?").get(id);
    return row ? this.rowToProfile(row) : null;
  }

  createProfile(profile: Profile): void {
    this.db.exec(
      `INSERT INTO profiles (id, name, token_encrypted, base_url, auth_method, created_at, last_used, use_count, metadata, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.id,
        profile.name,
        profile.token_encrypted,
        profile.base_url ?? null,
        profile.auth_method,
        profile.created_at,
        profile.last_used,
        profile.use_count,
        JSON.stringify(profile.metadata),
        JSON.stringify(profile.tags),
      ],
    );
  }

  updateProfile(id: string, updates: Partial<Profile>): void {
    const profile = this.getProfileById(id);
    if (!profile) return;

    const updated = { ...profile, ...updates };
    this.db.exec(
      `UPDATE profiles SET name = ?, token_encrypted = ?, base_url = ?, auth_method = ?,
       last_used = ?, use_count = ?, metadata = ?, tags = ? WHERE id = ?`,
      [
        updated.name,
        updated.token_encrypted,
        updated.base_url ?? null,
        updated.auth_method,
        updated.last_used,
        updated.use_count,
        JSON.stringify(updated.metadata),
        JSON.stringify(updated.tags),
        id,
      ],
    );
  }

  deleteProfile(id: string): void {
    this.db.exec("DELETE FROM profiles WHERE id = ?", [id]);
  }

  private rowToProfile(row: unknown): Profile {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      token_encrypted: r.token_encrypted as string,
      base_url: (r.base_url as string) ?? undefined,
      auth_method: r.auth_method as Profile["auth_method"],
      created_at: r.created_at as number,
      last_used: r.last_used as number,
      use_count: r.use_count as number,
      metadata: JSON.parse(r.metadata as string),
      tags: JSON.parse(r.tags as string),
    };
  }

  // Session operations
  getAllSessions(): Session[] {
    const rows = this.db.query("SELECT * FROM sessions ORDER BY last_activity DESC").all();
    return rows.map(this.rowToSession);
  }

  getSessionById(id: string): Session | null {
    const row = this.db.query("SELECT * FROM sessions WHERE id = ?").get(id);
    return row ? this.rowToSession(row) : null;
  }

  getSessionByTerminal(terminal: string): Session | null {
    const row = this.db.query("SELECT * FROM sessions WHERE terminal = ?").get(terminal);
    return row ? this.rowToSession(row) : null;
  }

  createSession(session: Session): void {
    this.db.exec(
      `INSERT INTO sessions (id, profile_id, terminal, started_at, last_activity, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.profile_id,
        session.terminal,
        session.started_at,
        session.last_activity,
        JSON.stringify(session.metadata),
      ],
    );
  }

  updateSession(id: string, updates: Partial<Session>): void {
    const session = this.getSessionById(id);
    if (!session) return;

    const updated = { ...session, ...updates };
    this.db.exec(
      `UPDATE sessions SET profile_id = ?, terminal = ?, last_activity = ?, metadata = ? WHERE id = ?`,
      [
        updated.profile_id,
        updated.terminal,
        updated.last_activity,
        JSON.stringify(updated.metadata),
        id,
      ],
    );
  }

  deleteSession(id: string): void {
    this.db.exec("DELETE FROM sessions WHERE id = ?", [id]);
  }

  deleteStaleSessions(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;
    this.db.exec("DELETE FROM sessions WHERE last_activity < ?", [cutoff]);
  }

  private rowToSession(row: unknown): Session {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      profile_id: r.profile_id as string | null,
      terminal: r.terminal as string,
      started_at: r.started_at as number,
      last_activity: r.last_activity as number,
      metadata: JSON.parse(r.metadata as string),
    };
  }

  // Quota operations
  getQuota(profileId: string): Quota | null {
    const row = this.db.query("SELECT * FROM quotas WHERE profile_id = ?").get(profileId);
    return row ? this.rowToQuota(row) : null;
  }

  createOrUpdateQuota(quota: Quota): void {
    this.db.exec(
      `INSERT INTO quotas (profile_id, daily_limit, monthly_limit, current_daily, current_monthly, last_reset_daily, last_reset_monthly)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id) DO UPDATE SET
         daily_limit = excluded.daily_limit,
         monthly_limit = excluded.monthly_limit,
         current_daily = excluded.current_daily,
         current_monthly = excluded.current_monthly,
         last_reset_daily = excluded.last_reset_daily,
         last_reset_monthly = excluded.last_reset_monthly`,
      [
        quota.profile_id,
        quota.daily_limit,
        quota.monthly_limit,
        quota.current_daily,
        quota.current_monthly,
        quota.last_reset_daily,
        quota.last_reset_monthly,
      ],
    );
  }

  updateQuotaCounters(profileId: string, dailyTokens: number, monthlyTokens: number): void {
    const quota = this.getQuota(profileId);
    if (!quota) return;

    this.db.exec(`UPDATE quotas SET current_daily = ?, current_monthly = ? WHERE profile_id = ?`, [
      quota.current_daily + dailyTokens,
      quota.current_monthly + monthlyTokens,
      profileId,
    ]);
  }

  resetQuotaCounters(profileId: string): void {
    const now = Date.now();
    this.db.exec(
      `UPDATE quotas SET current_daily = 0, current_monthly = 0, last_reset_daily = ?, last_reset_monthly = ? WHERE profile_id = ?`,
      [now, now, profileId],
    );
  }

  private rowToQuota(row: unknown): Quota {
    const r = row as Record<string, unknown>;
    return {
      profile_id: r.profile_id as string,
      daily_limit: r.daily_limit as number | null,
      monthly_limit: r.monthly_limit as number | null,
      current_daily: r.current_daily as number,
      current_monthly: r.current_monthly as number,
      last_reset_daily: r.last_reset_daily as number,
      last_reset_monthly: r.last_reset_monthly as number,
    };
  }

  // Usage log operations
  logUsage(log: Omit<UsageLog, "id">): void {
    this.db.exec(
      `INSERT INTO usage_log (profile_id, session_id, timestamp, tokens_used, model) VALUES (?, ?, ?, ?, ?)`,
      [log.profile_id, log.session_id, log.timestamp, log.tokens_used, log.model],
    );
  }

  getUsageLogs(profileId: string, limit = 100): UsageLog[] {
    const rows = this.db
      .query("SELECT * FROM usage_log WHERE profile_id = ? ORDER BY timestamp DESC LIMIT ?")
      .all(profileId, limit);
    return rows.map(this.rowToUsageLog);
  }

  getUsageBySession(sessionId: string): UsageLog[] {
    const rows = this.db
      .query("SELECT * FROM usage_log WHERE session_id = ? ORDER BY timestamp DESC")
      .all(sessionId);
    return rows.map(this.rowToUsageLog);
  }

  private rowToUsageLog(row: unknown): UsageLog {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      profile_id: r.profile_id as string,
      session_id: r.session_id as string,
      timestamp: r.timestamp as number,
      tokens_used: r.tokens_used as number,
      model: r.model as string,
    };
  }

  // Settings operations
  getSetting<T>(key: string): T | null {
    const row = this.db.query("SELECT value FROM settings WHERE key = ?").get(key);
    if (!row) return null;
    return JSON.parse((row as { value: string }).value) as T;
  }

  setSetting<T>(key: string, value: T): void {
    this.db.exec(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, JSON.stringify(value)],
    );
  }

  deleteSetting(key: string): void {
    this.db.exec("DELETE FROM settings WHERE key = ?", [key]);
  }
}

export async function initializeDatabase(): Promise<Database> {
  return Database.initialize();
}

export async function closeDatabase(): Promise<void> {
  return Database.close();
}

export function getDatabase(): Database {
  return Database.getInstance();
}
