import type { Command } from "commander";
import { confirm } from "@clack/prompts";
import { getDatabase } from "../../core/storage.js";
import { touchSession } from "../../core/session.js";
import { getFlags, info, respond, respondError } from "../../utils/output.js";

export async function removeCommand(profileName: string, cmd: Command): Promise<void> {
  touchSession();

  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const force = (opts["force"] as boolean) ?? false;

  const db = getDatabase();
  const profiles = db.getAllProfiles();
  const profile = profiles.find((p) => p.name === profileName);

  if (!profile) {
    respondError(flags, `Profile not found: "${profileName}"`, 1);
  }

  const skipConfirm = force || flags.json;

  const confirmed = skipConfirm
    ? true
    : await confirm({
        message: `Delete profile "${profileName}"? This cannot be undone.`,
        initialValue: false,
      });

  if (!confirmed) {
    info(flags, "Aborted.");
    return;
  }

  db.deleteProfile(profile!.id);

  info(flags, `Profile "${profileName}" removed.`);
  respond(flags, { deleted: profileName });
}
