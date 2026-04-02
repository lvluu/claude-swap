import { randomUUID } from "crypto";
import { getDatabase } from "./storage.js";
import type { Session } from "../types/index.js";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

function detectTerminal(): string {
  // Use CCS_SESSION_ID env var if set (shell-injected)
  if (Bun.env.CCS_SESSION_ID) return Bun.env.CCS_SESSION_ID;
  // Fallback: TTY path or pseudo-TTY name
  return Bun.env.TTY ?? `tty-${randomUUID().slice(0, 8)}`;
}

export function touchSession(): Session {
  const db = getDatabase();
  const terminal = detectTerminal();
  const now = Date.now();

  db.deleteStaleSessions(STALE_THRESHOLD_MS);

  const existing = db.getSessionByTerminal(terminal);
  if (existing) {
    db.updateSession(existing.id, { last_activity: now });
    const updated = { ...existing, last_activity: now };
    // Propagate session ID so callers and downstream commands can re-identify
    // this same session (e.g. listCommand looking up CCS_SESSION_ID).
    Bun.env.CCS_SESSION_ID = updated.id;
    return updated;
  }

  const session: Session = {
    id: randomUUID(),
    profile_id: null,
    terminal,
    started_at: now,
    last_activity: now,
    metadata: {
      shell: Bun.env.SHELL ?? "unknown",
      cwd: process.cwd(),
      parent_pid: Bun.env.PPID ? Number(Bun.env.PPID) : process.ppid,
    },
  };

  db.createSession(session);
  Bun.env.CCS_SESSION_ID = session.id;
  return session;
}

export function pruneStaleSessions(): number {
  const db = getDatabase();
  const before = db.getAllSessions().length;
  db.deleteStaleSessions(STALE_THRESHOLD_MS);
  const after = db.getAllSessions().length;
  return before - after;
}
