import type { Command } from "commander";
import { getDatabase } from "../../core/storage.js";
import { touchSession } from "../../core/session.js";
import { getFlags, info, respond, respondError } from "../../utils/output.js";

const DEFAULT_PROFILE_KEY = "default_profile";

export async function defaultCommand(profileName: string | undefined, cmd: Command): Promise<void> {
  touchSession();

  const flags = getFlags(cmd);
  const db = getDatabase();

  if (!profileName) {
    // Show current default
    const current = db.getSetting<string>(DEFAULT_PROFILE_KEY);
    if (current) {
      info(flags, `Default profile: ${current}`);
      respond(flags, { default: current });
    } else {
      info(flags, "No default profile set. Use: ccs default <profile>");
      respond(flags, { default: null });
    }
    return;
  }

  // Validate profile exists
  const profiles = db.getAllProfiles();
  const profile = profiles.find((p) => p.name === profileName);

  if (!profile) {
    respondError(flags, `Profile not found: "${profileName}"`, 1);
  }

  db.setSetting(DEFAULT_PROFILE_KEY, profileName);

  info(flags, `Default profile set to: ${profileName}`);
  respond(flags, { default: profileName });
}
