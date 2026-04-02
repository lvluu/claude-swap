import type { Command } from "commander";
import { activateProfile } from "../../core/switch.js";
import { touchSession } from "../../core/session.js";
import { getFlags, info, respondError } from "../../utils/output.js";
import type { SwitchMode } from "../../types/index.js";

export async function switchCommand(profileName: string | undefined, cmd: Command): Promise<void> {
  touchSession(); // keep session alive; also prunes stale sessions

  const flags = getFlags(cmd);

  // Resolve mode from flags
  const mode: SwitchMode = flags.local ? "local" : flags.persistent ? "persistent" : "shell";

  // If no profile name, read from ~/.ccsrc or settings (Phase 7 will expand this)
  const name = profileName ?? Bun.env.CCS_PROFILE ?? null;

  if (!name) {
    respondError(flags, "No profile specified. Use: ccs switch <profile>");
  }

  try {
    const result = await activateProfile(name as string, mode, flags);

    if (mode === "shell") {
      // Shell output goes to stdout so eval can capture it; pass through
      // info() so --quiet suppresses it on success while still printing on error
      info(flags, result.shellOutput as string);
    } else {
      info(flags, `Switched to profile: ${result.context.profile.name}`);
    }
  } catch (err) {
    respondError(flags, (err as Error).message, 1);
  }
}
