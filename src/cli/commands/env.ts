import type { Command } from "commander";
import { getDatabase } from "../../core/storage.js";
import { decryptFromStorage } from "../../core/encryption.js";
import { touchSession } from "../../core/session.js";
import { getFlags, warnSecurity, respond, respondError } from "../../utils/output.js";
import { formatShell } from "../../core/env-output.js";

export async function envCommand(profileName: string | undefined, cmd: Command): Promise<void> {
  touchSession();

  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const reveal = (opts["reveal"] as boolean) ?? false;
  const shellMode = (opts["shell"] as boolean) ?? false;

  const db = getDatabase();
  const defaultProfile = db.getSetting<string>("default_profile");

  const name = profileName ?? defaultProfile ?? Bun.env.CCS_PROFILE ?? null;

  if (!name) {
    respondError(flags, "No profile specified and no default set. Use: ccs env <profile>", 1);
  }

  const profiles = db.getAllProfiles();
  const profile = profiles.find((p) => p.name === name);

  if (!profile) {
    respondError(flags, `Profile not found: "${name}"`, 1);
  }

  let token: string;
  try {
    token = decryptFromStorage(profile!.token_encrypted);
  } catch {
    respondError(flags, "Failed to decrypt profile token", 1);
  }

  if (reveal) {
    warnSecurity(flags, "WARNING: Exposing decrypted token to stdout.");
    if (flags.json) {
      // In JSON mode, do not output raw token — too dangerous for scripting
      respond(flags, {
        profile: name,
        token: null,
        warning: "Token not shown in JSON mode. Use non-JSON output.",
      });
      return;
    }
    console.log(`ANTHROPIC_AUTH_TOKEN=${token}`);
    return;
  }

  if (shellMode || (!flags.local && !flags.json)) {
    // Default: shell export format
    const output = formatShell(profile!, token);
    respond(flags, { output });
    if (!flags.json) console.log(output);
    return;
  }

  // Fallback: structured JSON output
  respond(flags, {
    profile: name,
    token: "[hidden]",
    use: "ccs env <profile> --shell",
  });
}
