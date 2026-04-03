import type { Command } from "commander";
import { touchSession } from "../../core/session.js";
import { getDatabase } from "../../core/storage.js";
import { getFlags, info, respond, respondError } from "../../utils/output.js";

export async function currentCommand(cmd: Command): Promise<void> {
  const session = touchSession();
  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const short = (opts["short"] as boolean) ?? false;

  const db = getDatabase();

  // Warn if environment variable differs from session's profile
  const envProfile = Bun.env.CCS_PROFILE ?? null;
  if (envProfile !== null && session.profile_id !== null) {
    const activeProfile = db.getProfileById(session.profile_id);
    if (activeProfile && activeProfile.name !== envProfile) {
      // Only warn if we found a session profile that differs
      process.stderr.write(
        `Warning: active profile in session is "${activeProfile.name}", ` +
          `but CCS_PROFILE env var is "${envProfile}".\n`,
      );
    }
  }

  if (!session.profile_id) {
    respondError(flags, "No active profile. Use: ccs switch <profile>", 1);
  }

  const profile = db.getProfileById(session.profile_id as string);
  if (!profile) {
    respondError(flags, "No active profile. Use: ccs switch <profile>", 1);
  }

  if (flags.json) {
    respond(flags, {
      session_id: session.id,
      profile: { id: profile.id, name: profile.name },
      terminal: session.terminal,
    });
    return;
  }

  if (short) {
    info(flags, profile.name);
    return;
  }

  info(flags, `Active profile: ${profile.name} (${profile.id})`);
}
