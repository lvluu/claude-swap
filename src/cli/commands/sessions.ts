import type { Command } from "commander";
import { touchSession, pruneStaleSessions } from "../../core/session.js";
import { getDatabase } from "../../core/storage.js";
import { getFlags, info, respond, respondError } from "../../utils/output.js";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

function ageString(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export async function sessionsCommand(cmd: Command): Promise<void> {
  touchSession();
  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const killId = (opts["kill"] as string | undefined) ?? null;
  const doClean = (opts["clean"] as boolean) ?? false;
  const showCurrent = (opts["current"] as boolean) ?? false;

  const db = getDatabase();

  // --kill: delete specific session
  if (killId !== null) {
    const session = db.getSessionById(killId);
    if (!session) {
      respondError(flags, `Session not found: ${killId}`, 7);
    }
    db.deleteSession(killId);
    info(flags, `Killed session: ${killId}`);
    return;
  }

  // --clean: prune stale sessions
  if (doClean) {
    const before = db.getAllSessions().length;
    pruneStaleSessions();
    const after = db.getAllSessions().length;
    const removed = before - after;
    info(flags, `Removed ${removed} stale session(s).`);
    return;
  }

  // --current: show only the current session
  if (showCurrent) {
    const currentId = Bun.env.CCS_SESSION_ID;
    if (!currentId) {
      respondError(flags, "No current session.", 1);
    }
    const session = db.getSessionById(currentId as string);
    if (!session) {
      respondError(flags, "Current session not found.", 1);
    }

    if (flags.json) {
      const profile = session.profile_id ? db.getProfileById(session.profile_id) : null;
      respond(flags, { ...session, is_stale: false, profile_name: profile?.name ?? null });
      return;
    }

    const profile = session.profile_id ? db.getProfileById(session.profile_id) : null;
    info(flags, `Session: ${session.id}`);
    info(flags, `  Terminal: ${session.terminal}`);
    info(flags, `  Profile: ${profile?.name ?? "(none)"}`);
    info(flags, `  Active: ${ageString(Date.now() - session.last_activity)} ago`);
    return;
  }

  // Default: list all sessions
  const sessions = db.getAllSessions();
  const now = Date.now();

  if (flags.json) {
    const enriched = sessions.map((s) => {
      const isStale = now - s.last_activity > STALE_THRESHOLD_MS;
      const profile = s.profile_id ? db.getProfileById(s.profile_id) : null;
      return { ...s, is_stale: isStale, profile_name: profile?.name ?? null };
    });
    respond(flags, enriched);
    return;
  }

  if (sessions.length === 0) {
    info(flags, "No sessions found.");
    return;
  }

  for (const s of sessions) {
    const ageMs = now - s.last_activity;
    const isStale = ageMs > STALE_THRESHOLD_MS;
    const profile = s.profile_id ? db.getProfileById(s.profile_id) : null;
    const profileName = profile?.name ?? "(none)";
    const id = s.id.slice(0, 8);
    const terminal = s.terminal.padEnd(20).slice(0, 20);
    const age = ageString(ageMs).padStart(4);
    const stale = isStale ? " [stale]" : "";
    info(flags, `  ${id}  ${terminal}  ${profileName.padEnd(20)}  ${age}${stale}`);
  }
}
